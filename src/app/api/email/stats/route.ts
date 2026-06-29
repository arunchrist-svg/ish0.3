import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads, outreachSchedule } from "@/db";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  try {
    const ctx = await requireTenantContext();

    const [needsReviewRow, repliesRow] = await Promise.all([
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

    const needsReview = needsReviewRow[0]?.count ?? 0;
    const replies = repliesRow[0]?.count ?? 0;

    return NextResponse.json(
      { needsReview, replies },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  } catch (e) {
    return handleApiError(e, "[api/email/stats]");
  }
}
