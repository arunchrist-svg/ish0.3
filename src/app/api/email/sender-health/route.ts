import { NextResponse } from "next/server";
import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { runSenderHealthCheck, type SenderHealthResult } from "@/lib/email/sender-preflight";
import { invalidateEmailConfigCache } from "@/lib/email/email-sender";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import type { EmailConfig } from "@/lib/email/config";

const CACHE_TTL_MS = 60 * 60 * 1000;

function isFresh(checkedAt?: string): boolean {
  if (!checkedAt) return false;
  return Date.now() - new Date(checkedAt).getTime() < CACHE_TTL_MS;
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const config = await getResolvedEmailConfig(ctx.workspaceId);
    const fromAddress = config.fromAddress || config.smtpUser;
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const cached = config.senderHealthCache;

    if (
      !refresh &&
      cached &&
      cached.fromAddress === fromAddress &&
      isFresh(cached.checkedAt)
    ) {
      return NextResponse.json(cached.result as SenderHealthResult);
    }

    const health = await runSenderHealthCheck(config, ctx.workspaceId);

    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, ctx.workspaceId))
      .limit(1);

    const emailConfig: EmailConfig = {
      ...(config as EmailConfig),
      senderHealthCache: {
        checkedAt: new Date().toISOString(),
        fromAddress,
        result: health,
      },
    };

    await db
      .insert(workspaceSettings)
      .values({ workspaceId: ctx.workspaceId, emailConfig, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workspaceSettings.workspaceId,
        set: { emailConfig, updatedAt: new Date() },
      });

    invalidateEmailConfigCache();

    return NextResponse.json(health);
  } catch (e) {
    return handleApiError(e, "[api/email/sender-health]");
  }
}
