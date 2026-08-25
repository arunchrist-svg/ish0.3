import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageEmailSettings } from "@/lib/auth/permissions";
import type { EmailConfig } from "@/lib/email/config";
import { verifyEmailConnection } from "@/lib/settings/email-settings";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageEmailSettings(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Admin access required");
    }
    const body = (await req.json()) as Partial<EmailConfig>;
    const config = await verifyEmailConnection(body, ctx.userId);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("[api/settings/email/verify] POST failed:", e);
    return NextResponse.json({ error: "Failed to verify SMTP connection" }, { status: 500 });
  }
}
