import { NextResponse } from "next/server";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { runSenderHealthCheck } from "@/lib/email/sender-preflight";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const config = await getResolvedEmailConfig(ctx.workspaceId);
    const health = await runSenderHealthCheck(config, ctx.workspaceId);
    return NextResponse.json(health);
  } catch (e) {
    return handleApiError(e, "[api/email/sender-health]");
  }
}
