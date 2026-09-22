import { db, leads, outreachSchedule } from "@/db";
import { and, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { withMailboxLeadVisibility } from "@/lib/leads/lead-visibility";
import type { TenantContext } from "@/lib/tenant";
import { outboundCampaignEmailFilter } from "@/lib/email/outbound-campaign";
import { CATALOG_ON_OPEN_EMAIL_KIND } from "@/lib/email/ish-festive-catalog";
import { normalizeCadenceDays, type CadenceDays } from "@/lib/email/cadence";
import { emailOpenRatePercent } from "@/lib/email/outbox-queue-status";
import {
  getOutboxEngagementCounts,
  getOutreachAttentionCounts,
} from "@/lib/email/outreach-attention-counts";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { humanInboundScheduleRowSql } from "@/lib/email/human-reply-filter-sql";
import {
  resolveHomeOutreachPeriod,
  type HomeOutreachPeriodId,
  type HomeOutreachPeriodInput,
  type ResolvedHomeOutreachPeriod,
} from "@/lib/email/home-outreach-period";
import { calendarDayKey } from "@/lib/email/send-window-parts";

export type HomeOutreachStepStats = {
  label: "E1" | "E2" | "E3" | "If Opened";
  sent: number;
  opened: number;
  openRatePct: number;
};

export type HomeOutreachActivity = {
  sent: number;
  due: number;
  opened: number;
  replies: number;
};

export type HomeOutreachSnapshot = {
  cadenceDays: CadenceDays;
  period: ResolvedHomeOutreachPeriod;
  activity: HomeOutreachActivity;
  steps: HomeOutreachStepStats[];
  totals: {
    sent: number;
    opened: number;
    openRatePct: number;
    hot: number;
    replied: number;
    needsReview: number;
    activeSequences: number;
  };
  /** @deprecated use activity */
  today?: HomeOutreachActivity & { dayKey: string; timezone: string };
};

function openedFilter(): SQL {
  return sql`${outreachSchedule.openedAt} is not null and ${outreachSchedule.bouncedAt} is null`;
}

function visibility(ctx: TenantContext, ...parts: Array<SQL | undefined>) {
  return withMailboxLeadVisibility(ctx, eq(leads.workspaceId, ctx.workspaceId), ...parts);
}

function sentInRange(start: Date | null, end: Date | null): SQL | undefined {
  if (!start && !end) return undefined;
  if (start && end) {
    return sql`${outreachSchedule.sentAt} >= ${start} and ${outreachSchedule.sentAt} < ${end}`;
  }
  if (start) return sql`${outreachSchedule.sentAt} >= ${start}`;
  return sql`${outreachSchedule.sentAt} < ${end!}`;
}

function openedInRange(start: Date | null, end: Date | null): SQL | undefined {
  if (!start && !end) return undefined;
  if (start && end) {
    return sql`${outreachSchedule.openedAt} >= ${start} and ${outreachSchedule.openedAt} < ${end}`;
  }
  if (start) return sql`${outreachSchedule.openedAt} >= ${start}`;
  return sql`${outreachSchedule.openedAt} < ${end!}`;
}

async function countStepStats(
  ctx: TenantContext,
  cadence: CadenceDays,
  period: ResolvedHomeOutreachPeriod,
): Promise<HomeOutreachStepStats[]> {
  const [d1, d2] = cadence;
  const range = sentInRange(period.start, period.end);
  const base = visibility(ctx, outboundCampaignEmailFilter(), range);
  const opened = openedFilter();

  const [row] = await db
    .select({
      e1Sent: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = 0 and coalesce(${outreachSchedule.emailKind}, '') <> ${CATALOG_ON_OPEN_EMAIL_KIND})::int`,
      e1Opened: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = 0 and coalesce(${outreachSchedule.emailKind}, '') <> ${CATALOG_ON_OPEN_EMAIL_KIND} and ${opened})::int`,
      e2Sent: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = ${d1})::int`,
      e2Opened: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = ${d1} and ${opened})::int`,
      e3Sent: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = ${d2})::int`,
      e3Opened: sql<number>`count(*) filter (where ${outreachSchedule.sequenceDay} = ${d2} and ${opened})::int`,
      ifOpenedSent: sql<number>`count(*) filter (where coalesce(${outreachSchedule.emailKind}, '') = ${CATALOG_ON_OPEN_EMAIL_KIND})::int`,
      ifOpenedOpened: sql<number>`count(*) filter (where coalesce(${outreachSchedule.emailKind}, '') = ${CATALOG_ON_OPEN_EMAIL_KIND} and ${opened})::int`,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(base);

  const pack = (label: HomeOutreachStepStats["label"], sent: number, opened: number): HomeOutreachStepStats => ({
    label,
    sent,
    opened,
    openRatePct: emailOpenRatePercent(opened, sent),
  });

  return [
    pack("E1", row?.e1Sent ?? 0, row?.e1Opened ?? 0),
    pack("E2", row?.e2Sent ?? 0, row?.e2Opened ?? 0),
    pack("E3", row?.e3Sent ?? 0, row?.e3Opened ?? 0),
    pack("If Opened", row?.ifOpenedSent ?? 0, row?.ifOpenedOpened ?? 0),
  ];
}

async function countPeriodActivity(
  ctx: TenantContext,
  period: ResolvedHomeOutreachPeriod,
): Promise<{ sent: number; opened: number; replies: number }> {
  const { start, end } = period;

  const sentFilter =
    start && end
      ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${outreachSchedule.sentAt} >= ${start} and ${outreachSchedule.sentAt} < ${end})::int`
      : start
        ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${outreachSchedule.sentAt} >= ${start})::int`
        : end
          ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${outreachSchedule.sentAt} < ${end})::int`
          : sql`count(*) filter (where ${outboundCampaignEmailFilter()})::int`;

  const openedFilterSql =
    start && end
      ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${openedFilter()} and ${outreachSchedule.openedAt} >= ${start} and ${outreachSchedule.openedAt} < ${end})::int`
      : start
        ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${openedFilter()} and ${outreachSchedule.openedAt} >= ${start})::int`
        : end
          ? sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${openedFilter()} and ${outreachSchedule.openedAt} < ${end})::int`
          : sql`count(*) filter (where ${outboundCampaignEmailFilter()} and ${openedFilter()})::int`;

  const repliesFilter =
    start && end
      ? sql`count(*) filter (where ${outreachSchedule.emailKind} = 'inbound_reply' and ${outreachSchedule.status} = 'sent' and ${outreachSchedule.sentAt} >= ${start} and ${outreachSchedule.sentAt} < ${end} and ${humanInboundScheduleRowSql()})::int`
      : start
        ? sql`count(*) filter (where ${outreachSchedule.emailKind} = 'inbound_reply' and ${outreachSchedule.status} = 'sent' and ${outreachSchedule.sentAt} >= ${start} and ${humanInboundScheduleRowSql()})::int`
        : end
          ? sql`count(*) filter (where ${outreachSchedule.emailKind} = 'inbound_reply' and ${outreachSchedule.status} = 'sent' and ${outreachSchedule.sentAt} < ${end} and ${humanInboundScheduleRowSql()})::int`
          : sql`count(*) filter (where ${outreachSchedule.emailKind} = 'inbound_reply' and ${outreachSchedule.status} = 'sent' and ${humanInboundScheduleRowSql()})::int`;

  const [row] = await db
    .select({
      sent: sentFilter,
      opened: openedFilterSql,
      replies: repliesFilter,
    })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(visibility(ctx));

  return {
    sent: row?.sent ?? 0,
    opened: row?.opened ?? 0,
    replies: row?.replies ?? 0,
  };
}

async function countDueInPeriod(ctx: TenantContext, period: ResolvedHomeOutreachPeriod): Promise<number> {
  if (period.id !== "today" || !period.end) return 0;

  const dueWhere = visibility(
    ctx,
    inArray(outreachSchedule.status, ["scheduled", "sending"]),
    eq(outreachSchedule.channel, "email"),
    sql`${outreachSchedule.sequenceDay} >= 0`,
    lt(outreachSchedule.scheduledFor, period.end),
    or(eq(leads.status, "outreached"), eq(leads.status, "researched"))!,
  );

  const [row] = await db
    .select({ n: sql<number>`count(distinct ${outreachSchedule.leadId})::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(dueWhere);

  return row?.n ?? 0;
}

async function countActiveSequences(ctx: TenantContext): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${outreachSchedule.leadId})::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(
      visibility(
        ctx,
        eq(leads.status, "outreached"),
        inArray(outreachSchedule.status, ["scheduled", "paused"]),
        sql`${outreachSchedule.sequenceDay} > 0`,
        sql`exists (
          select 1 from ${outreachSchedule} sent
          where sent.lead_id = ${leads.id}
            and sent.status = 'sent'
            and sent.sequence_day >= 0
            and coalesce(sent.email_kind, '') not in ('inbound_reply', 'inbound_auto_reply')
        )`,
        sql`not exists (
          select 1 from ${outreachSchedule} inbound
          where inbound.lead_id = ${leads.id}
            and inbound.email_kind = 'inbound_reply'
            and inbound.status = 'sent'
        )`,
      ),
    );

  return row?.n ?? 0;
}

async function countEngagementInPeriod(
  ctx: TenantContext,
  period: ResolvedHomeOutreachPeriod,
): Promise<{ sent: number; opened: number }> {
  if (!period.start && !period.end) {
    const all = await getOutboxEngagementCounts(ctx);
    return { sent: all.sent, opened: all.opened };
  }

  const sentRange = sentInRange(period.start, period.end);
  const openedRange = openedInRange(period.start, period.end);

  const [sentRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(visibility(ctx, outboundCampaignEmailFilter(), sentRange));

  const [openedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachSchedule)
    .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
    .where(visibility(ctx, outboundCampaignEmailFilter(), openedFilter(), openedRange));

  return { sent: sentRow?.n ?? 0, opened: openedRow?.n ?? 0 };
}

export async function getHomeOutreachSnapshot(
  ctx: TenantContext,
  periodInput: HomeOutreachPeriodInput = {},
): Promise<HomeOutreachSnapshot> {
  const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
  const cadenceDays = normalizeCadenceDays(emailConfig.cadenceDays);
  const timezone = emailConfig.sendTimezone?.trim() || "Asia/Kolkata";
  const period = resolveHomeOutreachPeriod(timezone, periodInput);

  const [steps, activityCounts, due, activeSequences, attention, engagement, periodEngagement] =
    await Promise.all([
      countStepStats(ctx, cadenceDays, period),
      countPeriodActivity(ctx, period),
      countDueInPeriod(ctx, period),
      countActiveSequences(ctx),
      getOutreachAttentionCounts(ctx),
      getOutboxEngagementCounts(ctx),
      countEngagementInPeriod(ctx, period),
    ]);

  const sentForRate = period.id === "all" ? engagement.sent : periodEngagement.sent;
  const openedForRate = period.id === "all" ? engagement.opened : periodEngagement.opened;

  const activity: HomeOutreachActivity = {
    sent: activityCounts.sent,
    due,
    opened: activityCounts.opened,
    replies: activityCounts.replies,
  };

  const todayKey = calendarDayKey(new Date(), timezone);

  return {
    cadenceDays,
    period,
    activity,
    today: {
      ...activity,
      dayKey: todayKey,
      timezone,
    },
    steps,
    totals: {
      sent: sentForRate,
      opened: openedForRate,
      openRatePct: emailOpenRatePercent(openedForRate, sentForRate),
      hot: engagement.hot,
      replied: attention.replies,
      needsReview: attention.needsReview,
      activeSequences,
    },
  };
}

export type { HomeOutreachPeriodId, HomeOutreachPeriodInput };
