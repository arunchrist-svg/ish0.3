import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { getEmailConfigForApi, setOutreachPaused } from "@/lib/settings/email-settings";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const config = await getEmailConfigForApi();
    return NextResponse.json({ outreachPaused: config.outreachPaused ?? false });
  } catch (e) {
    return handleApiError(e, "[api/settings/email/sending]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Admin access required");
    }
    const body = (await req.json()) as { paused?: boolean };
    if (typeof body.paused !== "boolean") {
      return NextResponse.json({ error: "paused (boolean) required" }, { status: 400 });
    }
    const config = await setOutreachPaused(body.paused, ctx.workspaceId);
    return NextResponse.json({ ok: true, outreachPaused: config.outreachPaused ?? false });
  } catch (e) {
    return handleApiError(e, "[api/settings/email/sending]");
  }
}
