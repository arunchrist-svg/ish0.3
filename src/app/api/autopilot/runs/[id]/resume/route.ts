import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getAutopilotRun, serializeAutopilotRun } from "@/lib/agents/autopilot-store";
import { resumeAutopilotRun } from "@/lib/agents/autopilot";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const existing = await getAutopilotRun(id);
    if (!existing || existing.tenantId !== ctx.tenantId || existing.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Autopilot run not found" }, { status: 404 });
    }
    const run = await resumeAutopilotRun(id);
    return NextResponse.json({ run: serializeAutopilotRun(run) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/already has 100 leads|tavily|paused/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return handleApiError(e, "[api/autopilot/runs/resume]");
  }
}
