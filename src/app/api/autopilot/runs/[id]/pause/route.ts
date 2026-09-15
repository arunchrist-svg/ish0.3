import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getAutopilotRun, serializeAutopilotRun } from "@/lib/agents/autopilot-store";
import { requestPauseAutopilotRun } from "@/lib/agents/autopilot";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const existing = await getAutopilotRun(id);
    if (!existing || existing.tenantId !== ctx.tenantId || existing.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Autopilot run not found" }, { status: 404 });
    }
    const run = await requestPauseAutopilotRun(id);
    return NextResponse.json({ run: serializeAutopilotRun(run) });
  } catch (e) {
    return handleApiError(e, "[api/autopilot/runs/pause]");
  }
}
