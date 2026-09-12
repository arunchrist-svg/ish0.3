#!/usr/bin/env npx tsx
/**
 * Reschedule all queued Email 1 sends to start tomorrow morning (settings send window).
 *
 * Usage:
 *   npx tsx scripts/reschedule-queue-tomorrow.ts
 *   npx tsx scripts/reschedule-queue-tomorrow.ts --local-hour=7
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

function parseLocalHour(argv: string[]): number | undefined {
  for (const arg of argv) {
    if (arg.startsWith("--local-hour=")) {
      const value = Number(arg.slice("--local-hour=".length));
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

async function main() {
  const { db, workspaces } = await import("../src/db/index.ts");
  const { rescheduleInitialEmailQueue } = await import("../src/lib/outreach/reschedule-initial-queue.ts");
  const argv = process.argv.slice(2);
  const localHour = parseLocalHour(argv);
  const enableWeekends = argv.includes("--enable-weekends");

  const workspaceIdFromEnv = process.env.WORKSPACE_ID?.trim();
  let workspace =
    workspaceIdFromEnv
      ? (await db.select().from(workspaces).where(eq(workspaces.id, workspaceIdFromEnv)).limit(1))[0]
      : undefined;

  if (!workspace) {
    const { sql } = await import("drizzle-orm");
    const top = await db.execute(sql`
      SELECT l.workspace_id AS id, l.tenant_id AS tenant_id, count(*)::int AS n
      FROM outreach_schedule os
      INNER JOIN leads l ON l.id = os.lead_id
      WHERE os.sequence_day = 0 AND os.status IN ('scheduled', 'sending')
      GROUP BY l.workspace_id, l.tenant_id
      ORDER BY n DESC
      LIMIT 1
    `);
    const row = top.rows[0] as { id: string; tenant_id: string; n: number } | undefined;
    if (row?.id) {
      workspace = { id: row.id, tenantId: row.tenant_id } as typeof workspace;
    }
  }

  if (!workspace) {
    const fallback = await db.select().from(workspaces).limit(1);
    workspace = fallback[0];
  }
  if (!workspace) throw new Error("No workspace found");

  const { eq } = await import("drizzle-orm");

  if (enableWeekends) {
    const { workspaceSettings, userEmailSettings } = await import("../src/db/schema.ts");
    const { and } = await import("drizzle-orm");
    const weekendDays = [0, 6] as const;
    const hour = localHour ?? 7;
    const patch = {
      sendDaysOfWeek: [...weekendDays],
      sendHourRanges: [{ hourStart: hour, hourEnd: 11 }],
      sendHourStart: hour,
      sendHourEnd: 11,
    };
    const [wsRow] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id))
      .limit(1);
    if (wsRow) {
      await db
        .update(workspaceSettings)
        .set({
          emailConfig: { ...(wsRow.emailConfig as object), ...patch },
          updatedAt: new Date(),
        })
        .where(eq(workspaceSettings.workspaceId, workspace.id));
    }
    const userRows = await db
      .select()
      .from(userEmailSettings)
      .where(eq(userEmailSettings.workspaceId, workspace.id));
    for (const row of userRows) {
      await db
        .update(userEmailSettings)
        .set({
          emailConfig: { ...(row.emailConfig as object), ...patch },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userEmailSettings.workspaceId, workspace.id),
            eq(userEmailSettings.userId, row.userId),
          ),
        );
    }
    const { invalidateEmailConfigCache } = await import("../src/lib/email/email-sender.ts");
    invalidateEmailConfigCache();
    console.log("Enabled weekend send window Sat-Sun", `${hour}:00-11:00 IST`);
  }

  const result = await rescheduleInitialEmailQueue(
    {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      userId: undefined,
    },
    { daysAhead: 1, localHour },
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
