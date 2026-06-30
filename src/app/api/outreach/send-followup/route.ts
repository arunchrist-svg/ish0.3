import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  sendScheduledFollowUp,
  FollowUpQualityError,
} from "@/lib/outreach/send-scheduled-followup";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { scheduleId, overridePreflight, overrideQualityGate } = await req.json();
    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    const result = await sendScheduledFollowUp({
      scheduleId,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      overridePreflight: Boolean(overridePreflight),
      overrideQualityGate: Boolean(overrideQualityGate),
      actorId: ctx.userId,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FollowUpQualityError) {
      return NextResponse.json(
        {
          code: "QUALITY_GATE_FAILED",
          error: e.message,
          delivScore: e.delivScore,
          rubricTotal: e.rubricTotal,
          canOverride: true,
        },
        { status: 422 },
      );
    }
    return handleApiError(e, "[api/outreach/send-followup]");
  }
}
