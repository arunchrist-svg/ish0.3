import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { aggregateScoutQuality } from "@/lib/scout/quality-events";
import { loadScoutQualityLearning } from "@/lib/enrichment/quality-learning";

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const daysParam = new URL(req.url).searchParams.get("days");
    const days = daysParam === "30" ? 30 : 7;
    const [summary, learning] = await Promise.all([
      aggregateScoutQuality({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        days,
      }),
      loadScoutQualityLearning(ctx.workspaceId),
    ]);

    return NextResponse.json({
      ...summary,
      learningActive: Boolean(learning && learning.sampleCount > 0),
      learningSamples: learning?.sampleCount ?? 0,
      learningUpdatedAt: learning?.updatedAt ?? null,
    });
  } catch (e) {
    return handleApiError(e, "[api/scout/quality]");
  }
}
