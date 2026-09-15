import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getAgentFlags, isAutopilotEnabled, setAutopilotEnabled } from "@/lib/settings/agent-flags";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const flags = await getAgentFlags(ctx.workspaceId);
    return NextResponse.json({ autopilotEnabled: isAutopilotEnabled(flags) });
  } catch (e) {
    return handleApiError(e, "[api/settings/autopilot]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Admin required");
    }
    const body = (await req.json()) as { autopilotEnabled?: boolean };
    if (typeof body.autopilotEnabled !== "boolean") {
      return NextResponse.json({ error: "autopilotEnabled (boolean) required" }, { status: 400 });
    }
    const flags = await setAutopilotEnabled(ctx.workspaceId, body.autopilotEnabled);
    return NextResponse.json({ ok: true, autopilotEnabled: isAutopilotEnabled(flags) });
  } catch (e) {
    return handleApiError(e, "[api/settings/autopilot POST]");
  }
}
