import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getAutopilotRun, serializeAutopilotRun } from "@/lib/agents/autopilot-store";
import { removeAutopilotRun, updateAutopilotRunSettings } from "@/lib/agents/autopilot";
import { parseAutopilotSettingsBody, type AutopilotSettingsBody } from "@/lib/agents/autopilot-settings";

async function loadOwnedRun(id: string, tenantId: string, workspaceId: string) {
  const run = await getAutopilotRun(id);
  if (!run || run.tenantId !== tenantId || run.workspaceId !== workspaceId) return null;
  return run;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    const { id } = await params;
    const run = await loadOwnedRun(id, ctx.tenantId, ctx.workspaceId);
    if (!run) return NextResponse.json({ error: "Autopilot run not found" }, { status: 404 });
    return NextResponse.json({ run: serializeAutopilotRun(run) });
  } catch (e) {
    return handleApiError(e, "[api/autopilot/runs/id]");
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const existing = await loadOwnedRun(id, ctx.tenantId, ctx.workspaceId);
    if (!existing) return NextResponse.json({ error: "Autopilot run not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as AutopilotSettingsBody;
    const settings = parseAutopilotSettingsBody(body);
    if (body.cities !== undefined && !settings.cities?.length) {
      return NextResponse.json({ error: "Select at least one city" }, { status: 400 });
    }
    const run = await updateAutopilotRunSettings(id, settings);
    return NextResponse.json({ run: serializeAutopilotRun(run) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/select at least one city/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return handleApiError(e, "[api/autopilot/runs/id PATCH]");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const existing = await loadOwnedRun(id, ctx.tenantId, ctx.workspaceId);
    if (!existing) return NextResponse.json({ error: "Autopilot run not found" }, { status: 404 });
    await removeAutopilotRun(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "[api/autopilot/runs/id DELETE]");
  }
}
