/**
 * Wipe ISH pipeline data (leads, accounts, contacts, outreach, scout runs).
 * Does not touch workspace_settings, email/enrichment config, users, or billing.
 *
 * Usage: npx tsx scripts/reset-ish-leads-scouts.ts
 * Dry run: npx tsx scripts/reset-ish-leads-scouts.ts --dry-run
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  tenants,
  workspaces,
  accounts,
  contacts,
  leads,
  leadResearch,
  leadOutreach,
  outreachApprovals,
  outreachSchedule,
  yieldFunnel,
  enrichmentRuns,
  consentRecords,
  agentRuns,
  notifications,
  connectionMatches,
} from "../src/db";
import { deleteLeadOutreachWhere } from "../src/lib/outreach/delete-lead-outreach";

const KNOWN_TENANT_IDS = ["00000000-0000-0000-0000-000000000001"];
const KNOWN_WORKSPACE_IDS = [
  "00000000-0000-0000-0000-000000000002",
  "cb86c446-0839-4ab8-9f47-ae295bfa5e36",
];

async function findIshWorkspaces() {
  const named = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(tenants)
    .innerJoin(workspaces, eq(workspaces.tenantId, tenants.id))
    .where(
      or(
        ilike(tenants.name, "%sweet house%"),
        ilike(tenants.name, "%ish%"),
        ilike(tenants.slug, "%ish%"),
        ilike(tenants.slug, "%sweet%"),
        ilike(workspaces.name, "%ish%"),
        inArray(tenants.id, KNOWN_TENANT_IDS),
        inArray(workspaces.id, KNOWN_WORKSPACE_IDS),
      ),
    );

  return named.filter((row) => row.tenantSlug !== "ish-test-org");
}

async function countForWorkspace(workspaceId: string) {
  const [leadCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const [accountCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId));
  const [contactCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.workspaceId, workspaceId));
  const [runCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(eq(agentRuns.workspaceId, workspaceId));
  return {
    leads: leadCount?.n ?? 0,
    accounts: accountCount?.n ?? 0,
    contacts: contactCount?.n ?? 0,
    agentRuns: runCount?.n ?? 0,
  };
}

async function wipeWorkspace(workspaceId: string, tenantId: string) {
  const leadRows = await db
    .select({ id: leads.id, contactId: leads.contactId, accountId: leads.accountId })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const leadIds = leadRows.map((r) => r.id);

  const contactRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.workspaceId, workspaceId));
  const contactIds = contactRows.map((r) => r.id);

  if (leadIds.length) {
    await deleteLeadOutreachWhere(inArray(leadOutreach.leadId, leadIds));
    await db.delete(outreachSchedule).where(inArray(outreachSchedule.leadId, leadIds));
    await db.delete(outreachApprovals).where(inArray(outreachApprovals.leadId, leadIds));
    await db.delete(leadResearch).where(inArray(leadResearch.leadId, leadIds));
    await db.delete(yieldFunnel).where(inArray(yieldFunnel.leadId, leadIds));
    await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.leadId, leadIds));
    await db.delete(consentRecords).where(inArray(consentRecords.leadId, leadIds));
    await db.delete(notifications).where(inArray(notifications.leadId, leadIds));
    await db
      .update(agentRuns)
      .set({ leadId: null })
      .where(inArray(agentRuns.leadId, leadIds));
    await db.delete(leads).where(inArray(leads.id, leadIds));
  }

  if (contactIds.length) {
    await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.contactId, contactIds));
    await db.delete(connectionMatches).where(inArray(connectionMatches.contactId, contactIds));
    await db.delete(contacts).where(inArray(contacts.id, contactIds));
  }

  await db.delete(accounts).where(eq(accounts.workspaceId, workspaceId));
  await db.delete(agentRuns).where(eq(agentRuns.workspaceId, workspaceId));
  await db
    .delete(notifications)
    .where(and(eq(notifications.tenantId, tenantId), eq(notifications.workspaceId, workspaceId)));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const targets = await findIshWorkspaces();

  if (!targets.length) {
    console.error("No ISH tenant/workspace found.");
    process.exit(1);
  }

  console.log(dryRun ? "Dry run. Would reset:" : "Resetting ISH leads + scout data:");
  for (const row of targets) {
    const before = await countForWorkspace(row.workspaceId);
    console.log({
      tenant: row.tenantName,
      slug: row.tenantSlug,
      workspace: row.workspaceName,
      workspaceId: row.workspaceId,
      before,
    });
    if (!dryRun) {
      await wipeWorkspace(row.workspaceId, row.tenantId);
      const after = await countForWorkspace(row.workspaceId);
      console.log({ after, settings: "unchanged" });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
