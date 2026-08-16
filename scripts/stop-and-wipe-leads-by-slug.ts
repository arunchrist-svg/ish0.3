/**
 * Pause outreach and delete all leads for a tenant slug.
 *
 * Usage:
 *   npx tsx scripts/stop-and-wipe-leads-by-slug.ts --list
 *   npx tsx scripts/stop-and-wipe-leads-by-slug.ts --slug=india-sweet-house --dry-run
 *   npx tsx scripts/stop-and-wipe-leads-by-slug.ts --slug=india-sweet-house
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  tenants,
  workspaces,
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
  campaigns,
  workspaceSettings,
} from "../src/db";
import { deleteLeadOutreachWhere } from "../src/lib/outreach/delete-lead-outreach";
import { setOutreachPaused } from "../src/lib/settings/email-settings";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const CHUNK = 200;

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
      demoMode: tenants.demoMode,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(tenants)
    .innerJoin(workspaces, eq(workspaces.tenantId, tenants.id));

  const counts = await db
    .select({
      workspaceId: leads.workspaceId,
      n: sql<number>`count(*)::int`,
    })
    .from(leads)
    .groupBy(leads.workspaceId);

  const byWs = new Map(counts.map((c) => [c.workspaceId, c.n]));
  return rows.map((r) => ({ ...r, leads: byWs.get(r.workspaceId) ?? 0 }));
}

async function countSchedules(workspaceId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        inArray(outreachSchedule.status, ["scheduled", "pending_review", "paused"]),
      ),
    );
  return row?.n ?? 0;
}

async function wipeLeads(workspaceId: string) {
  const leadRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const leadIds = leadRows.map((r) => r.id);
  if (!leadIds.length) return 0;

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

  return leadIds.length;
}

async function pauseWorkspace(workspaceId: string) {
  await setOutreachPaused(true, workspaceId);

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  const existing = (settings?.emailConfig ?? {}) as Record<string, unknown>;
  const next = {
    ...existing,
    outreachPaused: true,
    sendMode: "dry_run",
  };
  if (settings) {
    await db
      .update(workspaceSettings)
      .set({ emailConfig: next, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceSettings).values({
      workspaceId,
      emailConfig: next,
      enrichmentConfig: {},
    });
  }
  invalidateEmailConfigCache();
}

async function main() {
  const listOnly = process.argv.includes("--list");
  const dryRun = process.argv.includes("--dry-run");
  const slug = argValue("--slug");

  const all = await listTenants();

  if (listOnly || !slug) {
    console.log(JSON.stringify(all, null, 2));
    if (!slug) {
      console.error("\nPass --slug=<tenant-slug> to pause emails and delete leads.");
      process.exit(listOnly ? 0 : 1);
    }
  }

  const targets = all.filter((r) => r.slug === slug);
  if (!targets.length) {
    console.error(`No tenant found for slug "${slug}".`);
    process.exit(1);
  }

  for (const row of targets) {
    const pending = await countSchedules(row.workspaceId);
    console.log({
      tenant: row.name,
      slug: row.slug,
      workspaceId: row.workspaceId,
      leads: row.leads,
      pendingScheduledEmails: pending,
      dryRun,
    });

    if (dryRun) continue;

    await pauseWorkspace(row.workspaceId);
    await db
      .update(campaigns)
      .set({ isActive: false })
      .where(eq(campaigns.workspaceId, row.workspaceId));

    const deleted = await wipeLeads(row.workspaceId);
    const afterLeads = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.workspaceId, row.workspaceId));
    const afterPending = await countSchedules(row.workspaceId);

    console.log({
      paused: true,
      sendMode: "dry_run",
      campaignsDeactivated: true,
      leadsDeleted: deleted,
      leadsRemaining: afterLeads[0]?.n ?? 0,
      pendingScheduledEmails: afterPending,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
