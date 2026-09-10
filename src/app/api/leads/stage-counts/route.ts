import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads } from "@/db";
import { eq, sql } from "drizzle-orm";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";
import { aggregateStatusCountsByStage } from "@/lib/pipeline-status";
import { countPendingInitialEmailSends } from "@/lib/outreach/pending-send-count";

export const preferredRegion = ["sin1"];

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const where = withLeadVisibility(ctx, eq(leads.tenantId, ctx.tenantId));
    const [rows, queued] = await Promise.all([
      db
        .select({ status: leads.status, n: sql<number>`count(*)::int` })
        .from(leads)
        .where(where)
        .groupBy(leads.status),
      countPendingInitialEmailSends(ctx),
    ]);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.n;
    }

    const byStage = aggregateStatusCountsByStage(counts);
    const emailStageTotal = byStage.Email ?? 0;
    const emailReady = Math.max(0, emailStageTotal - queued);

    return NextResponse.json({
      counts,
      board: {
        emailReady,
        queued,
        emailStageTotal,
      },
    });
  } catch (e) {
    return handleApiError(e, "[api/leads/stage-counts]");
  }
}
