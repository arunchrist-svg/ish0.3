import { and, desc, eq, inArray } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";

/** Latest scheduled time for Email 1 still in the outbox (append new Send All after this). */
export async function getLastInitialEmailQueueTime(workspaceId: string): Promise<Date | null> {
  const [row] = await db
    .select({ scheduledFor: outreachSchedule.scheduledFor })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "sending", "paused"]),
      ),
    )
    .orderBy(desc(outreachSchedule.scheduledFor))
    .limit(1);

  return row?.scheduledFor ?? null;
}
