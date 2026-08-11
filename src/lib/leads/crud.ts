import { db, accounts, contacts, leads, leadResearch, yieldFunnel, outreachSchedule, outreachApprovals, leadOutreach, enrichmentRuns, consentRecords, agentRuns } from "@/db";
import { and, eq } from "drizzle-orm";
import { verifyEmail } from "@/lib/enrichment/verify";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";
import { logAudit } from "@/lib/audit";
import { emailBelongsToCompany } from "@/lib/enrichment/company-domain-quality";
import { refreshPermutationEmails } from "@/lib/enrichment/contact-emails";
import { resolveAccountDomain } from "@/lib/enrichment/email-permutations";
import { nameCompanyDedupeKey } from "@/lib/leads/duplicates";
export class LeadNotFoundError extends Error {
  constructor() {
    super("Lead not found");
    this.name = "LeadNotFoundError";
  }
}

const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";

export type CreateLeadInput = {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  company: string;
  city?: string;
  industry?: string;
  employees?: string;
  score?: number;
  tags?: string[];
};

export type UpdateLeadInput = {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  leadId: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  company?: string;
  city?: string;
  industry?: string;
  employees?: string;
  score?: number;
  rating?: string;
  owner?: string;
  tags?: string[];
  estimatedValue?: string;
};

async function resolveAccountId(params: {
  tenantId: string;
  workspaceId: string;
  company: string;
  city?: string;
  industry?: string;
  employees?: string;
}): Promise<string> {
  const companyName = params.company.trim();
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.name, companyName)))
    .limit(1);

  if (existing) {
    if (params.city || params.industry || params.employees) {
      await db
        .update(accounts)
        .set({
          city: params.city ?? undefined,
          industry: params.industry ?? undefined,
          employees: params.employees ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existing.id));
    }
    return existing.id;
  }

  const [account] = await db
    .insert(accounts)
    .values({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      name: companyName,
      city: params.city,
      industry: params.industry,
      employees: params.employees,
      dataSource: "manual",
    })
    .returning();

  if (!account) throw new Error("Failed to create account");
  return account.id;
}


async function findExistingLeadId(params: {
  tenantId: string;
  accountId: string;
  name: string;
}): Promise<string | null> {
  const rows = await db
    .select({ id: leads.id, name: contacts.name, company: accounts.name })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(and(eq(leads.tenantId, params.tenantId), eq(leads.accountId, params.accountId)));

  const match = rows.find(
    (row) => nameCompanyDedupeKey(row.name, row.company) === nameCompanyDedupeKey(params.name, row.company),
  );
  return match?.id ?? null;
}

export async function createManualLead(input: CreateLeadInput): Promise<{ id: string; existing?: boolean }> {
  const name = input.name.trim();
  const company = input.company.trim();
  if (!name || !company) throw new Error("Name and company are required");

  const accountId = await resolveAccountId({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    company,
    city: input.city,
    industry: input.industry,
    employees: input.employees,
  });

  const existingId = await findExistingLeadId({
    tenantId: input.tenantId,
    accountId,
    name,
  });
  if (existingId) return { id: existingId, existing: true };

  const accountRow = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  const resolvedEmailRaw = sanitizeEmail(input.email);
  const resolvedEmail =
    resolvedEmailRaw && emailBelongsToCompany(resolvedEmailRaw, company) ? resolvedEmailRaw : undefined;
  const emailResult = await verifyEmail(resolvedEmail ?? "");
  const parts = name.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || undefined;

  const companyDomain = resolveAccountDomain({
    domain: accountRow?.domain,
    website: accountRow?.website,
    companyName: company,
  });

  const refreshed = refreshPermutationEmails({
    firstName,
    lastName,
    name,
    domain: companyDomain,
    website: accountRow?.website,
    companyName: company,
    primaryEmail: resolvedEmail,
    emailStatus: emailResult.status,
    alternateEmails: [],
  });
  const alternateEmails = refreshed.alternateEmails;

  const [contact] = await db
    .insert(contacts)
    .values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      accountId,
      name,
      firstName,
      lastName,
      title: input.title?.trim() || null,
      email: refreshed.email,
      emailStatus: refreshed.emailStatus,
      enrichmentSource: refreshed.enrichmentSource,
      enrichmentProvider: refreshed.enrichmentProvider,
      alternateEmails,
      phone: input.phone?.trim() || null,
      linkedIn: normalizeLinkedInUrl(input.linkedIn) ?? null,
      dataSource: "manual",
    })
    .returning();

  if (!contact) throw new Error("Failed to create contact");

  const [lead] = await db
    .insert(leads)
    .values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      contactId: contact.id,
      accountId,
      campaignId: DEFAULT_CAMPAIGN,
      status: "scouted",
      score: input.score ?? 60,
      leadSource: "manual",
      researcherEligible: true,
      tags: input.tags?.length ? input.tags : ["Lead", "Manual"],
    })
    .returning();

  if (!lead) throw new Error("Failed to create lead");

  await db.insert(yieldFunnel).values({ leadId: lead.id, stage: "scouted" });
  await db.insert(yieldFunnel).values({
    leadId: lead.id,
    stage: "prefiltered",
    metadata: { reason: "manual entry" },
  });

  await logAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    metadata: { name, company, source: "manual" },
  });

  return { id: lead.id };
}

export async function updateLeadFields(input: UpdateLeadInput): Promise<void> {
  const row = await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
  if (!row || row.tenantId !== input.tenantId) throw new LeadNotFoundError();

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, row.accountId)).limit(1);
  if (!contact || !account) throw new LeadNotFoundError();

  const contactUpdates: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
  if (input.name?.trim()) {
    const name = input.name.trim();
    contactUpdates.name = name;
    const parts = name.split(/\s+/);
    contactUpdates.firstName = parts[0];
    contactUpdates.lastName = parts.slice(1).join(" ") || null;
  }
  if (input.title !== undefined) contactUpdates.title = input.title.trim() || null;
  if (input.phone !== undefined) contactUpdates.phone = input.phone.trim() || null;
  if (input.linkedIn !== undefined) {
    contactUpdates.linkedIn = normalizeLinkedInUrl(input.linkedIn) ?? null;
  }
  if (input.email !== undefined) {
    const resolvedEmail = sanitizeEmail(input.email);
    const emailResult = await verifyEmail(resolvedEmail ?? "");
    contactUpdates.email = resolvedEmail ?? null;
    contactUpdates.emailStatus = emailResult.status;
  }

  await db.update(contacts).set(contactUpdates).where(eq(contacts.id, contact.id));

  if (input.company?.trim() && input.company.trim() !== account.name) {
    const accountId = await resolveAccountId({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      company: input.company,
      city: input.city,
      industry: input.industry,
      employees: input.employees,
    });
    await db.update(leads).set({ accountId, updatedAt: new Date() }).where(eq(leads.id, input.leadId));
    if (accountId === account.id) {
      await db
        .update(accounts)
        .set({
          city: input.city ?? account.city,
          industry: input.industry ?? account.industry,
          employees: input.employees ?? account.employees,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, account.id));
    } else {
      await db.update(contacts).set({ accountId, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
    }
  } else if (input.city !== undefined || input.industry !== undefined || input.employees !== undefined) {
    await db
      .update(accounts)
      .set({
        city: input.city ?? account.city,
        industry: input.industry ?? account.industry,
        employees: input.employees ?? account.employees,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
  }

  const leadUpdates: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
  if (input.score !== undefined) leadUpdates.score = input.score;
  if (input.rating !== undefined) leadUpdates.rating = input.rating;
  if (input.owner !== undefined) leadUpdates.owner = input.owner;
  if (input.tags !== undefined) leadUpdates.tags = input.tags;
  if (input.estimatedValue !== undefined) leadUpdates.estimatedValue = input.estimatedValue;

  await db.update(leads).set(leadUpdates).where(eq(leads.id, input.leadId));

  await logAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.updated",
    entityType: "lead",
    entityId: input.leadId,
    metadata: { fields: Object.keys(input).filter((k) => k !== "tenantId" && k !== "workspaceId" && k !== "actorId" && k !== "leadId") },
  });
}

export async function deleteLeadById(params: {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  leadId: string;
}): Promise<void> {
  const row = await db.query.leads.findFirst({ where: eq(leads.id, params.leadId) });
  if (!row || row.tenantId !== params.tenantId) throw new LeadNotFoundError();

  await deleteLeadOutreachWhere(eq(leadOutreach.leadId, params.leadId));
  await db.delete(outreachApprovals).where(eq(outreachApprovals.leadId, params.leadId));
  await db.delete(outreachSchedule).where(eq(outreachSchedule.leadId, params.leadId));
  await db.delete(leadResearch).where(eq(leadResearch.leadId, params.leadId));
  await db.delete(yieldFunnel).where(eq(yieldFunnel.leadId, params.leadId));
  await db.delete(enrichmentRuns).where(eq(enrichmentRuns.leadId, params.leadId));
  await db.delete(consentRecords).where(eq(consentRecords.leadId, params.leadId));
  await db.update(agentRuns).set({ leadId: null }).where(eq(agentRuns.leadId, params.leadId));
  await db.delete(leads).where(eq(leads.id, params.leadId));

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: "lead.deleted",
    entityType: "lead",
    entityId: params.leadId,
  });
}
