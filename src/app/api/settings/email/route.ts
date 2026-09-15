import { NextResponse, after } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageEmailSettings } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import type { EmailConfig } from "@/lib/email/config";
import {
  EmailSettingsValidationError,
  getEmailConfigForApi,
  saveWorkspaceEmailOverrides,
} from "@/lib/settings/email-settings";
import { spreadQueuedInitialEmailsFromNow } from "@/lib/outreach/reschedule-initial-queue";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageEmailSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError("Admin access required");
    const config = await getEmailConfigForApi(ctx.userId);
    return NextResponse.json(config);
  } catch (e) {
    const err = handleApiError(e, "[settings]");
    if (err.status !== 500) return err;
    console.error("[api/settings/email] GET failed:", e);
    return NextResponse.json({ error: "Failed to load email settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageEmailSettings(ctx.role, ctx.platformRole)) throw new ForbiddenError("Admin access required");
    const body = (await req.json()) as Partial<EmailConfig>;
    const { config, queueRespread } = await saveWorkspaceEmailOverrides(body, ctx.workspaceId, ctx.userId);

    if (queueRespread) {
      after(async () => {
        try {
          await spreadQueuedInitialEmailsFromNow({
            tenantId: ctx.tenantId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
          });
        } catch (e) {
          console.error("[api/settings/email] queue respread after schedule-basis change failed:", e);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      config,
      queueRespread: queueRespread
        ? { started: true, dailyCap: queueRespread.dailyCap }
        : null,
    });
  } catch (e) {
    if (e instanceof EmailSettingsValidationError) {
      return NextResponse.json({ errors: e.errors }, { status: 400 });
    }
    console.error("[api/settings/email] POST failed:", e);
    return NextResponse.json({ error: "Failed to save email settings" }, { status: 500 });
  }
}
