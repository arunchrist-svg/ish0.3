import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, outreachSchedule, notifications } from "@/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";

export const preferredRegion = ["sin1"];

/** Lightweight hub badges: notifications + email inbox counts in one round trip. */
export async function GET() {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const dbStart = performance.now();
    const [notifRows, needsReviewRow, repliesRow] = await Promise.all([
      db
        .select({
          id: notifications.id,
          type: notifications.type,
          leadId: notifications.leadId,
          title: notifications.title,
          body: notifications.body,
          urgency: notifications.urgency,
          metadata: notifications.metadata,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.tenantId, ctx.tenantId),
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, ctx.workspaceId),
            eq(leads.status, "draft_ready"),
          ),
        ),
      db
        .select({ count: sql<number>`count(distinct ${leads.id})::int` })
        .from(leads)
        .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
        .where(
          and(
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
    mark(marks, "db", dbStart);

    const needsReview = needsReviewRow[0]?.count ?? 0;
    const replies = repliesRow[0]?.count ?? 0;

    const res = NextResponse.json(
      {
        notifications: notifRows,
        unreadCount: notifRows.length,
        needsReview,
        replies,
        inboxCount: needsReview + replies,
      },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
    return withServerTiming(res, marks, t0);
  } catch (e) {
    return handleApiError(e, "[api/hub/badge]");
  }
}
