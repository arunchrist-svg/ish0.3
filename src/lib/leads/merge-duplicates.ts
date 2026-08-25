import {
  db,
  accounts,
  agentRuns,
  consentRecords,
  contacts,
  enrichmentRuns,
  leadOutreach,
  leadResearch,
  leads,
  notifications,
  outreachApprovals,
  outreachSchedule,
} from "@/db";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { deleteLeadById } from "@/lib/leads/crud";
import { groupDuplicateLeads, type DedupeLeadInput } from "@/lib/leads/duplicates";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export type DuplicateGroupSummary = {
  key: string;
  name: string;
  company: string;
  keepId: string;
  leadIds: string[];
  statuses: string[];
  extraCount: number;
};

export type MergeDuplicatesResult = {
  merged: number;
  groups: { keepId: string; deletedIds: string[] }[];
};

type LoadedLead = DedupeLeadInput & {
  contactId: string;
  accountId: string;
  isPinned: boolean | null;
  tags: string[] | null;
  estimatedValue: string | null;
  title: string | null;
  emailStatus: string | null;
  emailConfidence: number | null;
  phone: string | null;
  alternateEmails: ContactEmailEntry[] | null;
  firstName: string | null;
  lastName: string | null;
};

const EMAIL_RANK: Record<string, number> = {
  verified: 3,
  unverified: 2,
  generic: 1,
  missing: 0,
};

async function loadTenantLeads(
  tenantId: string,
  visibilityCtx?: Pick<import("@/lib/tenant").TenantContext, "userId" | "role" | "platformRole">,
): Promise<LoadedLead[]> {
  const rows = await db
    .select({
      id: leads.id,
      status: leads.status,
      score: leads.score,
      isPinned: leads.isPinned,
      updatedAt: leads.updatedAt,
      contactId: leads.contactId,
      accountId: leads.accountId,
      tags: leads.tags,
      estimatedValue: leads.estimatedValue,
      name: contacts.name,
      title: contacts.title,
      email: contacts.email,
      emailStatus: contacts.emailStatus,
      emailConfidence: contacts.emailConfidence,
      phone: contacts.phone,
      linkedIn: contacts.linkedIn,
      alternateEmails: contacts.alternateEmails,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: accounts.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(
      visibilityCtx
        ? withLeadVisibility(visibilityCtx, eq(leads.tenantId, tenantId))
        : eq(leads.tenantId, tenantId),
    );

  return rows.map((row) => ({
    ...row,
    score: row.score ?? 0,
    emailStatus: row.emailStatus ?? "missing",
    alternateEmails: (row.alternateEmails as ContactEmailEntry[] | null) ?? [],
  }));
}

export async function listDuplicateGroups(
  tenantId: string,
  visibilityCtx?: Pick<import("@/lib/tenant").TenantContext, "userId" | "role" | "platformRole">,
): Promise<{
  groups: DuplicateGroupSummary[];
  extraCount: number;
}> {
  const groups = groupDuplicateLeads(await loadTenantLeads(tenantId, visibilityCtx)).map((group) => ({
    key: group.key,
    name: group.name,
    company: group.company,
    keepId: group.keepId,
    leadIds: group.leads.map((lead) => lead.id),
    statuses: group.leads.map((lead) => lead.status),
    extraCount: group.leads.length - 1,
  }));
  return {
    groups,
    extraCount: groups.reduce((sum, group) => sum + group.extraCount, 0),
  };
}

function preferText(primary?: string | null, fallback?: string | null): string | null {
  const left = primary?.trim();
  if (left) return left;
  const right = fallback?.trim();
  return right || null;
}

function mergeAlternateEmails(
  keeperEmail: string | null | undefined,
  keeperAlts: ContactEmailEntry[],
  loserEmail: string | null | undefined,
  loserAlts: ContactEmailEntry[],
): ContactEmailEntry[] {
  const byEmail = new Map<string, ContactEmailEntry>();
  for (const entry of [...keeperAlts, ...loserAlts]) {
    const key = sanitizeEmail(entry.email) ?? entry.email.trim().toLowerCase();
    if (!key || byEmail.has(key)) continue;
    byEmail.set(key, entry);
  }
  const keeperPrimary = sanitizeEmail(keeperEmail);
  const loserPrimary = sanitizeEmail(loserEmail);
  if (loserPrimary && loserPrimary !== keeperPrimary && !byEmail.has(loserPrimary)) {
    byEmail.set(loserPrimary, {
      email: loserPrimary,
      emailStatus: "unverified",
    });
  }
  return [...byEmail.values()];
}

async function mergeContactIntoKeeper(keeper: LoadedLead, loser: LoadedLead): Promise<void> {
  if (keeper.contactId === loser.contactId) return;

  const keeperRank = EMAIL_RANK[keeper.emailStatus ?? "missing"] ?? 0;
  const loserRank = EMAIL_RANK[loser.emailStatus ?? "missing"] ?? 0;
  const takeLoserEmail =
    (!sanitizeEmail(keeper.email) && !!sanitizeEmail(loser.email)) ||
    loserRank > keeperRank ||
    (loserRank === keeperRank && (loser.emailConfidence ?? 0) > (keeper.emailConfidence ?? 0));

  await db
    .update(contacts)
    .set({
      title: preferText(keeper.title, loser.title),
      firstName: preferText(keeper.firstName, loser.firstName),
      lastName: preferText(keeper.lastName, loser.lastName),
      email: takeLoserEmail ? loser.email : keeper.email,
      emailStatus: (takeLoserEmail ? loser.emailStatus : keeper.emailStatus) as typeof contacts.$inferInsert.emailStatus,
      emailConfidence: takeLoserEmail ? loser.emailConfidence : keeper.emailConfidence,
      phone: preferText(keeper.phone, loser.phone),
      linkedIn: preferText(keeper.linkedIn, loser.linkedIn),
      alternateEmails: mergeAlternateEmails(
        takeLoserEmail ? loser.email : keeper.email,
        keeper.alternateEmails ?? [],
        takeLoserEmail ? keeper.email : loser.email,
        loser.alternateEmails ?? [],
      ),
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, keeper.contactId));

  if (takeLoserEmail) {
    keeper.email = loser.email;
    keeper.emailStatus = loser.emailStatus;
    keeper.emailConfidence = loser.emailConfidence;
  }
  keeper.title = preferText(keeper.title, loser.title);
  keeper.phone = preferText(keeper.phone, loser.phone);
  keeper.linkedIn = preferText(keeper.linkedIn, loser.linkedIn);
  keeper.firstName = preferText(keeper.firstName, loser.firstName);
  keeper.lastName = preferText(keeper.lastName, loser.lastName);
}

async function transferMissingResearch(keepId: string, dropId: string): Promise<void> {
  const [keeperHas] = await db
    .select({ id: leadResearch.id })
    .from(leadResearch)
    .where(eq(leadResearch.leadId, keepId))
    .limit(1);
  if (keeperHas) return;
  await db.update(leadResearch).set({ leadId: keepId }).where(eq(leadResearch.leadId, dropId));
}

async function transferMissingOutreach(keepId: string, dropId: string): Promise<void> {
  const [keeperHas] = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, keepId))
    .limit(1);
  if (keeperHas) return;

  const loserRows = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, dropId));
  if (loserRows.length === 0) return;

  await db.update(leadOutreach).set({ leadId: keepId }).where(eq(leadOutreach.leadId, dropId));
  await db.update(outreachApprovals).set({ leadId: keepId }).where(eq(outreachApprovals.leadId, dropId));
  await db.update(outreachSchedule).set({ leadId: keepId }).where(eq(outreachSchedule.leadId, dropId));
}

async function transferConsent(keepId: string, dropId: string): Promise<void> {
  const keeperRows = await db.select().from(consentRecords).where(eq(consentRecords.leadId, keepId));
  const loserRows = await db.select().from(consentRecords).where(eq(consentRecords.leadId, dropId));
  const keeperChannels = new Set(keeperRows.map((row) => row.channel));
  for (const row of loserRows) {
    if (keeperChannels.has(row.channel)) continue;
    await db.update(consentRecords).set({ leadId: keepId }).where(eq(consentRecords.id, row.id));
    keeperChannels.add(row.channel);
  }
}

async function reassignSideTables(keepId: string, dropId: string, keeperContactId: string): Promise<void> {
  await db.update(enrichmentRuns).set({ leadId: keepId, contactId: keeperContactId }).where(eq(enrichmentRuns.leadId, dropId));
  await db.update(notifications).set({ leadId: keepId }).where(eq(notifications.leadId, dropId));
  await db.update(agentRuns).set({ leadId: keepId }).where(eq(agentRuns.leadId, dropId));
}

async function deleteOrphanContact(contactId: string, keeperContactId: string): Promise<void> {
  if (contactId === keeperContactId) return;
  const [remaining] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.contactId, contactId))
    .limit(1);
  if (remaining) return;
  await db
    .update(enrichmentRuns)
    .set({ contactId: keeperContactId })
    .where(eq(enrichmentRuns.contactId, contactId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
}

async function mergeOneGroup(
  tenantId: string,
  workspaceId: string,
  actorId: string | undefined,
  groupLeads: LoadedLead[],
  keepId: string,
): Promise<string[]> {
  const keeper = groupLeads.find((lead) => lead.id === keepId);
  if (!keeper) throw new Error("Keep lead is not in this duplicate group");
  const losers = groupLeads.filter((lead) => lead.id !== keepId);
  const deletedIds: string[] = [];

  for (const loser of losers) {
    await mergeContactIntoKeeper(keeper, loser);
    await transferMissingResearch(keeper.id, loser.id);
    await transferMissingOutreach(keeper.id, loser.id);
    await transferConsent(keeper.id, loser.id);
    await reassignSideTables(keeper.id, loser.id, keeper.contactId);

    const nextScore = Math.max(keeper.score ?? 0, loser.score ?? 0);
    const nextTags = [...new Set([...(keeper.tags ?? []), ...(loser.tags ?? [])])];
    await db
      .update(leads)
      .set({
        score: nextScore,
        isPinned: Boolean(keeper.isPinned || loser.isPinned),
        tags: nextTags,
        estimatedValue: preferText(keeper.estimatedValue, loser.estimatedValue),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, keeper.id));
    keeper.score = nextScore;
    keeper.isPinned = Boolean(keeper.isPinned || loser.isPinned);
    keeper.tags = nextTags;
    keeper.estimatedValue = preferText(keeper.estimatedValue, loser.estimatedValue);
    keeper.title = preferText(keeper.title, loser.title);
    keeper.phone = preferText(keeper.phone, loser.phone);
    keeper.linkedIn = preferText(keeper.linkedIn, loser.linkedIn);

    const loserContactId = loser.contactId;
    await deleteLeadById({ tenantId, workspaceId, actorId, leadId: loser.id });
    await deleteOrphanContact(loserContactId, keeper.contactId);
    deletedIds.push(loser.id);
  }

  await logAudit({
    tenantId,
    workspaceId,
    actorId,
    action: "lead.duplicates_merged",
    entityType: "lead",
    entityId: keeper.id,
    metadata: { deletedIds, name: keeper.name, company: keeper.company },
  });

  return deletedIds;
}

export async function mergeDuplicateLeads(params: {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  keepId?: string;
  dropIds?: string[];
  visibilityCtx?: Pick<import("@/lib/tenant").TenantContext, "userId" | "role" | "platformRole">;
}): Promise<MergeDuplicatesResult> {
  const all = await loadTenantLeads(params.tenantId, params.visibilityCtx);
  const detected = groupDuplicateLeads(all);
  const results: { keepId: string; deletedIds: string[] }[] = [];

  if (params.keepId && params.dropIds?.length) {
    const dropSet = new Set(params.dropIds);
    const group = detected.find((item) => item.leads.some((lead) => lead.id === params.keepId));
    if (!group) return { merged: 0, groups: [] };
    const selected = group.leads.filter((lead) => lead.id === params.keepId || dropSet.has(lead.id));
    if (selected.length < 2) return { merged: 0, groups: [] };
    const deletedIds = await mergeOneGroup(
      params.tenantId,
      params.workspaceId,
      params.actorId,
      selected,
      params.keepId,
    );
    results.push({ keepId: params.keepId, deletedIds });
  } else {
    for (const group of detected) {
      const deletedIds = await mergeOneGroup(
        params.tenantId,
        params.workspaceId,
        params.actorId,
        group.leads,
        group.keepId,
      );
      if (deletedIds.length > 0) results.push({ keepId: group.keepId, deletedIds });
    }
  }

  return {
    merged: results.reduce((sum, group) => sum + group.deletedIds.length, 0),
    groups: results,
  };
}
