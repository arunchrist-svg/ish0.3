import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, notifications } from "@/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { mark, startTiming, withServerTiming } from "@/lib/perf/server-timing";
import { getOutreachAttentionCounts } from "@/lib/email/outreach-attention-counts";

export const preferredRegion = ["sin1"];

/** Lightweight hub badges: notifications + outreach attention counts in one round trip. */
export async function GET() {
  const { marks, t0 } = startTiming();
  try {
    const authStart = performance.now();
    const ctx = await requireTenantContext();
    mark(marks, "auth", authStart);

    const dbStart = performance.now();
    const [notifRows, attention] = await Promise.all([
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
      getOutreachAttentionCounts(ctx),
    ]);
    mark(marks, "db", dbStart);

    const res = NextResponse.json(
      {
        notifications: notifRows,
        unreadCount: notifRows.length,
        needsReview: attention.needsReview,
        replies: attention.replies,
        inboxCount: attention.inboxCount,
      },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
    return withServerTiming(res, marks, t0);
  } catch (e) {
    return handleApiError(e, "[api/hub/badge]");
  }
}
