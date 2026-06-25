import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import type { EmailConfig } from "@/lib/email/config";
import {
  EmailSettingsValidationError,
  getEmailConfigForApi,
  saveWorkspaceEmailOverrides,
} from "@/lib/settings/email-settings";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError('Admin access required');
    const config = await getEmailConfigForApi();
    return NextResponse.json(config);
  } catch (e) {
    const err = handleApiError(e, '[settings]');
    if (err.status !== 500) return err;
    console.error("[api/settings/email] GET failed:", e);
    return NextResponse.json({ error: "Failed to load email settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError('Admin access required');
    const body = (await req.json()) as Partial<EmailConfig>;
    const config = await saveWorkspaceEmailOverrides(body);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    if (e instanceof EmailSettingsValidationError) {
      return NextResponse.json({ errors: e.errors }, { status: 400 });
    }
    console.error("[api/settings/email] POST failed:", e);
    return NextResponse.json({ error: "Failed to save email settings" }, { status: 500 });
  }
}
