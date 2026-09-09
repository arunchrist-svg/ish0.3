import { NextResponse } from "next/server";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { runSequencer } from "@/lib/agents/sequencer";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const result = await runSequencer();

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "sequencer.run_now",
      entityType: "workspace",
      entityId: ctx.workspaceId,
      metadata: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(e, "[api/sequencer/run-now]");
  }
}
