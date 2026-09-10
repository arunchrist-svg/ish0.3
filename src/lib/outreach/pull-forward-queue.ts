import { and, asc, eq, gt } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";

/**
 * When a send slot is freed (skip/cancel), pull the next scheduled Email 1 forward to now
 * so mass sends do not wait for the next gap slot.
 */
export async function pullForwardNextQueuedInitialEmail(
  workspaceId: string,
  now: Date,
): Promise<boolean> {
  const [next] = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
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
    .set({ scheduledFor: now, lastError: null })
    .where(eq(outreachSchedule.id, next.id));

  return true;
}
