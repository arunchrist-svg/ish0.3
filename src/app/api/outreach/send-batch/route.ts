import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { batchQueueInitialEmails } from "@/lib/outreach/batch-send-initial";
import { SenderPreflightError } from "@/lib/email/sender-preflight";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      leadIds?: unknown;
      overridePreflight?: unknown;
    };

    const leadIds = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds required" }, { status: 400 });
    }

    const result = await batchQueueInitialEmails(ctx, {
      leadIds,
      overridePreflight: Boolean(body.overridePreflight),
    });

    return NextResponse.json({ mode: "queued", ...result });
  } catch (e) {
    if (e instanceof SenderPreflightError) {
      const critical = e.issues.filter((i) => i.severity === "critical");
      return NextResponse.json(
        {
          code: "SENDER_PREFLIGHT_FAILED",
          error: e.message,
          issues: critical,
          canOverride: e.canOverride,
        },
        { status: 422 },
      );
    }
    return handleApiError(e, "[api/outreach/send-batch]");
  }
}
