#!/usr/bin/env npx tsx
/**
 * Send all pending_review follow-ups now (quality-gate override).
 * Usage: npx tsx scripts/send-pending-review-followups.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, gt } from "drizzle-orm";
import { db, leads, outreachSchedule } from "../src/db";
import { sendScheduledFollowUp } from "../src/lib/outreach/send-scheduled-followup";

async function main() {
  const rows = await db
    .select({
      id: outreachSchedule.id,
      leadId: outreachSchedule.leadId,
      sequenceDay: outreachSchedule.sequenceDay,
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
      leadStatus: leads.status,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(eq(outreachSchedule.status, "pending_review"), gt(outreachSchedule.sequenceDay, 0)),
    )
    .orderBy(outreachSchedule.sequenceDay);

  console.log(`Found ${rows.length} pending_review follow-up(s)`);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const sentLeadDay = new Map<string, number>();

  for (const row of rows) {
    if (row.leadStatus !== "outreached") {
      console.log(`skip ${row.id}: lead status ${row.leadStatus}`);
      skipped++;
      continue;
    }
    const priorDay = sentLeadDay.get(row.leadId);
    if (priorDay != null && row.sequenceDay > priorDay) {
      // Keep later steps queued; do not blast Email 2 + Email 3 in one pass.
      await db
        .update(outreachSchedule)
        .set({ status: "scheduled", lastError: null })
        .where(eq(outreachSchedule.id, row.id));
      console.log(`queued ${row.id} day=${row.sequenceDay} after sending day ${priorDay}`);
      skipped++;
      continue;
    }
    try {
      const result = await sendScheduledFollowUp({
        scheduleId: row.id,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        overrideQualityGate: true,
        overridePreflight: true,
      });
      console.log(`sent ${row.id} day=${row.sequenceDay}`, result);
      sentLeadDay.set(row.leadId, row.sequenceDay);
      sent++;
    } catch (e) {
      console.error(`fail ${row.id}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(JSON.stringify({ sent, skipped, failed, total: rows.length }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
