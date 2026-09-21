import { db, outreachSchedule, leads, userEmailSettings } from "@/db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { extractDomain } from "@/lib/email/sender-domain";
import { calendarDayKey } from "@/lib/email/send-window-parts";
import { outboundCampaignEmailFilter } from "@/lib/email/outbound-campaign";

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

/** Users whose mailbox fromAddress matches (case-insensitive). */
async function mailboxOwnerUserIds(workspaceId: string, fromAddress: string): Promise<string[]> {
  const normalized = fromAddress.trim().toLowerCase();
  if (!normalized) return [];
  const rows = await db
    .select({ userId: userEmailSettings.userId })
    .from(userEmailSettings)
    .where(
      and(
        eq(userEmailSettings.workspaceId, workspaceId),
        sql`lower(coalesce(${userEmailSettings.emailConfig}->>'fromAddress', '')) = ${normalized}`,
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Count live outbound email sends in a time range for volume / warmup gates.
 * Excludes WhatsApp, dry-run rows, and inbound reply/auto-reply noise.
 * When `fromAddress` maps to a user mailbox, counts that owner's leads only.
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
  const ownerIds = await mailboxOwnerUserIds(workspaceId, fromAddress);

  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        outboundCampaignEmailFilter(),
        eq(outreachSchedule.sendMode, "live"),
        gte(outreachSchedule.sentAt, since),
        until ? lt(outreachSchedule.sentAt, until) : undefined,
        ownerIds.length > 0 ? inArray(leads.createdByUserId, ownerIds) : undefined,
      ),
    );

  return rows[0]?.total ?? 0;
}

/**
 * Count Email 1 rows (sent or queued) per calendar day in the settings timezone.
 * Used to plan Send All batches against the daily send cap.
 */
export async function countInitialOutboundByCalendarDay(
  workspaceId: string,
  timezone: string,
  ownerUserId?: string | null,
): Promise<Map<string, number>> {
  const workspaceFilter = and(
    eq(leads.workspaceId, workspaceId),
    ownerUserId ? eq(leads.createdByUserId, ownerUserId) : undefined,
    eq(outreachSchedule.channel, "email"),
    eq(outreachSchedule.sequenceDay, 0),
  );
  const sentSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [queued, sent] = await Promise.all([
    db
      .select({
        scheduledFor: outreachSchedule.scheduledFor,
        sentAt: outreachSchedule.sentAt,
        status: outreachSchedule.status,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(
        and(workspaceFilter, inArray(outreachSchedule.status, ["scheduled", "sending", "paused"])),
      ),
    db
      .select({
        scheduledFor: outreachSchedule.scheduledFor,
        sentAt: outreachSchedule.sentAt,
        status: outreachSchedule.status,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(
        and(
          workspaceFilter,
          eq(outreachSchedule.status, "sent"),
          gte(outreachSchedule.sentAt, sentSince),
        ),
      ),
  ]);

  const byDay = new Map<string, number>();
  for (const row of [...queued, ...sent]) {
    const instant =
      row.status === "sent" && row.sentAt
        ? row.sentAt
        : row.scheduledFor;
    if (!instant) continue;
    const key = calendarDayKey(instant, timezone);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}

/** Sent Email 1 only, per calendar day (for replanning an existing queue). */
export async function countSentInitialByCalendarDay(
  workspaceId: string,
  timezone: string,
  ownerUserId?: string | null,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      sentAt: outreachSchedule.sentAt,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        ownerUserId ? eq(leads.createdByUserId, ownerUserId) : undefined,
        eq(outreachSchedule.channel, "email"),
        eq(outreachSchedule.sequenceDay, 0),
        eq(outreachSchedule.status, "sent"),
      ),
    );

  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!row.sentAt) continue;
    const key = calendarDayKey(row.sentAt, timezone);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}
