import { db, leads, leadOutreach, outreachSchedule } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import type { TenantContext } from "@/lib/tenant";

export type OutreachAttentionCounts = {
  /** Email 1 drafts + follow-ups awaiting human review (visible leads only). */
  needsReview: number;
  /** Inbound replies without a sent outbound reply (visible leads only). */
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
 * - lead visibility (own / owner+unassigned / superadmin)
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
      .where(withLeadVisibility(ctx, eq(leads.workspaceId, ctx.workspaceId), eq(leads.status, "draft_ready"))),
    db
      .select({ count: sql<number>`count(distinct ${outreachSchedule.leadId})::int` })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .where(
        withLeadVisibility(
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
        withLeadVisibility(
          ctx,
          eq(leads.workspaceId, ctx.workspaceId),
          eq(outreachSchedule.emailKind, "inbound_reply"),
          eq(outreachSchedule.status, "sent"),
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

/** Pure helper for tests and callers that already have the component counts. */
export function sumOutreachAttention(needsReview: number, replies: number): number {
  return needsReview + replies;
}
