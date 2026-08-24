import { db, outreachSchedule, leads } from "@/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { extractDomain } from "@/lib/email/sender-domain";

export {
  assertGradualRamp,
  assertVolumeWithinCap,
  clampDailySendCap,
  defaultDailyCapForStage,
  gradualVolumeCeiling,
  inferWarmupStage,
  INBOX_WARMUP_STAGE_OPTIONS,
  MAILBOX_WARMUP,
  recommendedDailyCap,
  remainingDailyQuota,
  warmupCapWarning,
  warmupDayIndex,
  type InboxWarmupStage,
  type WarmupRecommendation,
} from "@/lib/email/sender-warmup";

/**
 * Count live workspace sends in the last 24h.
 * `fromAddress` is accepted for future per-domain filtering; schedule rows do not
 * yet store the from-domain, so counts are workspace-scoped today.
 */
export async function countSendsLast24h(workspaceId: string, fromAddress: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return countSendsInRange(workspaceId, fromAddress, since);
}

export async function countSendsInRange(
  workspaceId: string,
  fromAddress: string,
  since: Date,
  until?: Date,
): Promise<number> {
  void extractDomain(fromAddress);

  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(outreachSchedule.status, "sent"),
        gte(outreachSchedule.sentAt, since),
        until ? lt(outreachSchedule.sentAt, until) : undefined,
      ),
    );

  return rows[0]?.total ?? 0;
}
