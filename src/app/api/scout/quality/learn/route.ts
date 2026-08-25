import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { refreshScoutQualityLearning } from "@/lib/enrichment/quality-learning";

export async function POST() {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const learning = await refreshScoutQualityLearning({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });
    if (!learning) {
      return NextResponse.json({
        ok: false,
        reason: "Need at least 30 outreached leads in the last 30 days.",
      });
    }
    return NextResponse.json({ ok: true, learning });
  } catch (e) {
    return handleApiError(e, "[api/scout/quality/learn]");
  }
}
