import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { fixLeadNames } from "@/lib/leads/fix-names";

export async function POST() {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const result = await fixLeadNames({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      visibilityCtx: ctx,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/leads/fix-names POST]");
  }
}
