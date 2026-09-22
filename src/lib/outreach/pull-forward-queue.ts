import { and, asc, eq, gt } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";
import { randomBatchSendGapMs } from "@/lib/outreach/plan-batch-sends";

/**
 * When a send slot is freed (skip/cancel), pull the next scheduled Email 1 forward
 * for the same mailbox owner only. Never steals a slot from another login's queue.
 */
export async function pullForwardNextQueuedInitialEmail(
  workspaceId: string,
  now: Date,
  ownerUserId?: string | null,
): Promise<boolean> {
  const [next] = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        ownerUserId ? eq(leads.createdByUserId, ownerUserId) : undefined,
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        eq(outreachSchedule.status, "scheduled"),
        gt(outreachSchedule.scheduledFor, now),
      ),
    )
    .orderBy(asc(outreachSchedule.scheduledFor))
    .limit(1);

  if (!next) return false;

  await db
    .update(outreachSchedule)
    .set({ scheduledFor: new Date(now.getTime() + randomBatchSendGapMs()), lastError: null })
    .where(eq(outreachSchedule.id, next.id));

  return true;
}
