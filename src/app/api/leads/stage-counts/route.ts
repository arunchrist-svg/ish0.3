import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { db, leads } from "@/db";
import { eq, sql } from "drizzle-orm";
import { withLeadVisibility } from "@/lib/leads/lead-visibility";

export const preferredRegion = ["sin1"];

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const where = withLeadVisibility(ctx, eq(leads.tenantId, ctx.tenantId));
    const rows = await db
      .select({ status: leads.status, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(where)
      .groupBy(leads.status);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.n;
    }
    return NextResponse.json({ counts });
  } catch (e) {
    return handleApiError(e, "[api/leads/stage-counts]");
  }
}
