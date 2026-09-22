import { db, leads, leadOutreach, outreachSchedule } from "@/db";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { withMailboxLeadVisibility } from "@/lib/leads/lead-visibility";
import type { TenantContext } from "@/lib/tenant";
import { outboundCampaignEmailFilter } from "@/lib/email/outbound-campaign";
import { humanInboundScheduleRowSql, noHumanInboundReplyExistsSql } from "@/lib/email/human-reply-filter-sql";

export type OutreachAttentionCounts = {
  /** Email 1 drafts + follow-ups awaiting human review (visible leads only). */
  needsReview: number;
  /** Inbound human replies without a sent outbound reply (visible leads only). Auto-replies are excluded. */
  replies: number;
  /** Sidebar / inbox badge: items needing attention. */
  inboxCount: number;
};

type VisibilityCtx = Pick<TenantContext, "userId" | "role" | "platformRole" | "workspaceId">;

/**
 * Counts that power Outreach sidebar / hub badges.
 * Must stay aligned with `/api/email/overview` Needs Review + Replies tabs:
 * - draft_ready only when Email 1 outreach exists (same inner join as overview list)
 * - plus pending_review follow-ups
 * - unreplied inbound replies only
 * - mailbox visibility (this login's leads only)
 */
export async function getOutreachAttentionCounts(ctx: VisibilityCtx): Promise<OutreachAttentionCounts> {
  const [draftReadyRow, pendingReviewRow, repliesRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${leads.id})::int` })
      .from(leads)
      .innerJoin(
        leadOutreach,
        and(eq(leadOutreach.leadId, leads.id), eq(leadOutreach.sequencePosition, 1)),
      )
      .where(withMailboxLeadVisibility(ctx, eq(leads.workspaceId, ctx.workspaceId), eq(leads.status, "draft_ready"))),
    db
      .select({ count: sql<number>`count(distinct ${outreachSchedule.leadId})::int` })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(
        withMailboxLeadVisibility(
          ctx,
          eq(leads.workspaceId, ctx.workspaceId),
          eq(outreachSchedule.status, "pending_review"),
        ),
      ),
    db
      .select({ count: sql<number>`count(distinct ${leads.id})::int` })
      .from(leads)
      .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
      .where(
        withMailboxLeadVisibility(
          ctx,
          eq(leads.workspaceId, ctx.workspaceId),
          eq(outreachSchedule.emailKind, "inbound_reply"),
          eq(outreachSchedule.status, "sent"),
          humanInboundScheduleRowSql(),
          sql`NOT EXISTS (
            SELECT 1 FROM ${outreachSchedule} outbound
            WHERE outbound.lead_id = ${leads.id}
              AND outbound.email_kind = 'outbound_reply'
              AND outbound.status = 'sent'
          )`,
        ),
      ),
  ]);

  const draftReady = draftReadyRow[0]?.count ?? 0;
  const pendingReview = pendingReviewRow[0]?.count ?? 0;
  const replies = repliesRow[0]?.count ?? 0;
  const needsReview = draftReady + pendingReview;

  return {
    needsReview,
    replies,
    inboxCount: needsReview + replies,
  };
}

export type OutboxEngagementCounts = {
  /** Sent outbound emails (same universe as Logs). */
  sent: number;
  /** Sent outbound emails with a recorded open and no bounce. */
  opened: number;
  /** Distinct leads with an open, no inbound reply, not in replied. */
  hot: number;
};

function leadScope(leadIds?: string[] | null) {
  if (leadIds && leadIds.length > 0) return inArray(leads.id, leadIds);
  return undefined;
}

function emptyEngagement(): OutboxEngagementCounts {
  return { sent: 0, opened: 0, hot: 0 };
}

function visibility(ctx: VisibilityCtx, leadIds: string[] | null | undefined, ...parts: Array<SQL | undefined>) {
  return withMailboxLeadVisibility(
    ctx,
    eq(leads.workspaceId, ctx.workspaceId),
    leadScope(leadIds),
    ...parts,
  );
}

/** Uncapped Hot / open-rate stats. The overview list is row-capped and can miss opens. */
export async function getOutboxEngagementCounts(
  ctx: VisibilityCtx,
  leadIds?: string[] | null,
): Promise<OutboxEngagementCounts> {
  if (leadIds && leadIds.length === 0) return emptyEngagement();

  const sentWhere = visibility(ctx, leadIds, outboundCampaignEmailFilter());
  const openedWhere = visibility(
    ctx,
    leadIds,
    outboundCampaignEmailFilter(),
    sql`${outreachSchedule.openedAt} is not null`,
    sql`${outreachSchedule.bouncedAt} is null`,
  );
  const hotWhere = visibility(
    ctx,
    leadIds,
    eq(outreachSchedule.channel, "email"),
    sql`${outreachSchedule.openedAt} is not null`,
    sql`${outreachSchedule.bouncedAt} is null`,
    sql`${outreachSchedule.sequenceDay} >= 0`,
    sql`${outreachSchedule.emailKind} is distinct from 'inbound_reply'`,
    sql`${leads.status} is distinct from 'replied'`,
    noHumanInboundReplyExistsSql(),
  );

  const [sentRow, openedRow, hotRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(sentWhere),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(openedWhere),
    db
      .select({ n: sql<number>`count(distinct ${leads.id})::int` })
      .from(leads)
      .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
      .where(hotWhere),
  ]);

  return {
    sent: sentRow[0]?.n ?? 0,
    opened: openedRow[0]?.n ?? 0,
    hot: hotRow[0]?.n ?? 0,
  };
}

export async function listHotOutboxLeadIds(
  ctx: VisibilityCtx,
  limit: number,
  leadIds?: string[] | null,
): Promise<string[]> {
  if (leadIds && leadIds.length === 0) return [];
  const hotWhere = visibility(
    ctx,
    leadIds,
    eq(outreachSchedule.channel, "email"),
    sql`${outreachSchedule.openedAt} is not null`,
    sql`${outreachSchedule.bouncedAt} is null`,
    sql`${outreachSchedule.sequenceDay} >= 0`,
    sql`${outreachSchedule.emailKind} is distinct from 'inbound_reply'`,
    sql`${leads.status} is distinct from 'replied'`,
    noHumanInboundReplyExistsSql(),
  );
  const rows = await db
    .select({
      leadId: leads.id,
      openedAt: sql<Date>`max(${outreachSchedule.openedAt})`,
    })
    .from(leads)
    .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
    .where(hotWhere)
    .groupBy(leads.id)
    .orderBy(desc(sql`max(${outreachSchedule.openedAt})`))
    .limit(Math.max(1, limit));
  return rows.map((row) => row.leadId);
}

/** Pure helper for tests and callers that already have the component counts. */
export function sumOutreachAttention(needsReview: number, replies: number): number {
  return needsReview + replies;
}
