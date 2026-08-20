import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getWhatsAppConnection, setWhatsAppConnected } from "@/lib/settings/whatsapp-settings";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const config = await getWhatsAppConnection(ctx.workspaceId);
    return NextResponse.json(config);
  } catch (e) {
    return handleApiError(e, "[api/settings/whatsapp]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError("Admin access required");
    const body = (await req.json()) as { connected?: boolean };
    if (typeof body.connected !== "boolean") {
      return NextResponse.json({ error: "connected (boolean) required" }, { status: 400 });
    }
    const config = await setWhatsAppConnected(ctx.workspaceId, body.connected);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return handleApiError(e, "[api/settings/whatsapp]");
  }
}
