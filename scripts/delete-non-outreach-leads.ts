/**
 * Delete leads that have not entered email outreach.
 * Keeps draft_ready / approved / outreached / replied / meeting / closed and any
 * Contact Ready lead that already has a draft or scheduled send.
 *
 * Usage:
 *   npx tsx scripts/delete-non-outreach-leads.ts --list
 *   npx tsx scripts/delete-non-outreach-leads.ts --slug=india-sweet-house --dry-run
 *   npx tsx scripts/delete-non-outreach-leads.ts --slug=india-sweet-house
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  tenants,
  workspaces,
  leads,
  contacts,
  accounts,
  leadResearch,
  leadOutreach,
  outreachApprovals,
  outreachSchedule,
  yieldFunnel,
  enrichmentRuns,
  consentRecords,
  agentRuns,
  notifications,
} from "../src/db";
import { deleteLeadOutreachWhere } from "../src/lib/outreach/delete-lead-outreach";
import { isContactReadyStage } from "../src/lib/pipeline-status";

const CHUNK = 200;
const KEEP_IF_HAS_OUTREACH = true;

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

async function chunked<T>(ids: T[], fn: (slice: T[]) => Promise<void>) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await fn(ids.slice(i, i + CHUNK));
  }
}

async function listTenants() {
  const rows = await db
    .select({
      tenantId: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(tenants)
    .innerJoin(workspaces, eq(workspaces.tenantId, tenants.id));

  const statusRows = await db
    .select({
      workspaceId: leads.workspaceId,
      status: leads.status,
      n: sql<number>`count(*)::int`,
    })
    .from(leads)
    .groupBy(leads.workspaceId, leads.status);

  return rows.map((r) => {
    const statuses = statusRows.filter((s) => s.workspaceId === r.workspaceId);
    const total = statuses.reduce((sum, s) => sum + s.n, 0);
    return { ...r, total, statuses: Object.fromEntries(statuses.map((s) => [s.status, s.n])) };
  });
}

async function idsInOutreach(workspaceId: string): Promise<Set<string>> {
  const [fromDrafts, fromSchedule] = await Promise.all([
    db
      .selectDistinct({ leadId: leadOutreach.leadId })
      .from(leadOutreach)
      .innerJoin(leads, eq(leads.id, leadOutreach.leadId))
      .where(eq(leads.workspaceId, workspaceId)),
    db
      .selectDistinct({ leadId: outreachSchedule.leadId })
      .from(outreachSchedule)
      .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
      .where(eq(leads.workspaceId, workspaceId)),
  ]);
  return new Set([...fromDrafts, ...fromSchedule].map((r) => r.leadId));
}

async function findRemovableLeads(workspaceId: string) {
  const rows = await db
    .select({
      id: leads.id,
      status: leads.status,
      contactId: leads.contactId,
      accountId: leads.accountId,
      leadSource: leads.leadSource,
    })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));

  const outreachIds = KEEP_IF_HAS_OUTREACH ? await idsInOutreach(workspaceId) : new Set<string>();
  return rows.filter((row) => isContactReadyStage(row.status) && !outreachIds.has(row.id));
}

async function deleteLeads(leadRows: { id: string; contactId: string; accountId: string }[]) {
  const leadIds = leadRows.map((r) => r.id);
  if (!leadIds.length) return { leads: 0, contacts: 0, accounts: 0 };

  await chunked(leadIds, async (slice) => {
    await deleteLeadOutreachWhere(inArray(leadOutreach.leadId, slice));
    await db.delete(outreachSchedule).where(inArray(outreachSchedule.leadId, slice));
    await db.delete(outreachApprovals).where(inArray(outreachApprovals.leadId, slice));
    await db.delete(leadResearch).where(inArray(leadResearch.leadId, slice));
    await db.delete(yieldFunnel).where(inArray(yieldFunnel.leadId, slice));
    await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.leadId, slice));
    await db.delete(consentRecords).where(inArray(consentRecords.leadId, slice));
    await db.delete(notifications).where(inArray(notifications.leadId, slice));
    await db.update(agentRuns).set({ leadId: null }).where(inArray(agentRuns.leadId, slice));
    await db.delete(leads).where(inArray(leads.id, slice));
  });

  const contactIds = Array.from(new Set(leadRows.map((r) => r.contactId)));
  let contactsDeleted = 0;
  await chunked(contactIds, async (slice) => {
    const stillUsed = await db
      .selectDistinct({ contactId: leads.contactId })
      .from(leads)
      .where(inArray(leads.contactId, slice));
    const keep = new Set(stillUsed.map((r) => r.contactId));
    const drop = slice.filter((id) => !keep.has(id));
    if (!drop.length) return;
    await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.contactId, drop));
    await db.delete(contacts).where(inArray(contacts.id, drop));
    contactsDeleted += drop.length;
  });

  const accountIds = Array.from(new Set(leadRows.map((r) => r.accountId)));
  let accountsDeleted = 0;
  await chunked(accountIds, async (slice) => {
    const stillUsedByLeads = await db
      .selectDistinct({ accountId: leads.accountId })
      .from(leads)
      .where(inArray(leads.accountId, slice));
    const stillUsedByContacts = await db
      .selectDistinct({ accountId: contacts.accountId })
      .from(contacts)
      .where(inArray(contacts.accountId, slice));
    const keep = new Set([
      ...stillUsedByLeads.map((r) => r.accountId),
      ...stillUsedByContacts.map((r) => r.accountId),
    ]);
    const drop = slice.filter((id) => !keep.has(id));
    if (!drop.length) return;
    await db.delete(accounts).where(inArray(accounts.id, drop));
    accountsDeleted += drop.length;
  });

  return { leads: leadIds.length, contacts: contactsDeleted, accounts: accountsDeleted };
}

async function cleanupOrphans(workspaceId: string) {
  const contactRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.workspaceId, workspaceId));
  const usedContacts = await db
    .selectDistinct({ contactId: leads.contactId })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const keepContacts = new Set(usedContacts.map((r) => r.contactId));
  const orphanContacts = contactRows.map((r) => r.id).filter((id) => !keepContacts.has(id));
  let contactsDeleted = 0;
  await chunked(orphanContacts, async (slice) => {
    await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.contactId, slice));
    await db.delete(contacts).where(inArray(contacts.id, slice));
    contactsDeleted += slice.length;
  });

  const accountRows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId));
  const usedByLeads = await db
    .selectDistinct({ accountId: leads.accountId })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const usedByContacts = await db
    .selectDistinct({ accountId: contacts.accountId })
    .from(contacts)
    .where(eq(contacts.workspaceId, workspaceId));
  const keepAccounts = new Set([
    ...usedByLeads.map((r) => r.accountId),
    ...usedByContacts.map((r) => r.accountId),
  ]);
  const orphanAccounts = accountRows.map((r) => r.id).filter((id) => !keepAccounts.has(id));
  let accountsDeleted = 0;
  await chunked(orphanAccounts, async (slice) => {
    await db.delete(accounts).where(inArray(accounts.id, slice));
    accountsDeleted += slice.length;
  });

  return { contacts: contactsDeleted, accounts: accountsDeleted };
}

async function main() {
  const listOnly = process.argv.includes("--list");
  const dryRun = process.argv.includes("--dry-run");
  const slug = argValue("--slug");
  const all = await listTenants();

  if (listOnly || !slug) {
    console.log(JSON.stringify(all, null, 2));
    if (!slug) {
      console.error("\nPass --slug=<tenant-slug> to delete Contact Ready leads with no outreach.");
      process.exit(listOnly ? 0 : 1);
    }
  }

  const targets = all.filter((r) => r.slug === slug);
  if (!targets.length) {
    console.error(`No tenant found for slug "${slug}".`);
    process.exit(1);
  }

  for (const row of targets) {
    const removable = await findRemovableLeads(row.workspaceId);
    const bySource: Record<string, number> = {};
    for (const lead of removable) {
      const source = lead.leadSource ?? "unknown";
      bySource[source] = (bySource[source] ?? 0) + 1;
    }
    const keep = row.total - removable.length;
    console.log({
      tenant: row.name,
      slug: row.slug,
      workspace: row.workspaceName,
      statuses: row.statuses,
      remove: removable.length,
      keep,
      bySource,
      dryRun,
    });
    if (dryRun) continue;
    const deleted = await deleteLeads(removable);
    const orphans = await cleanupOrphans(row.workspaceId);
    const remaining = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.workspaceId, row.workspaceId));
    console.log({ deleted, orphans, leadsRemaining: remaining[0]?.n ?? 0 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
