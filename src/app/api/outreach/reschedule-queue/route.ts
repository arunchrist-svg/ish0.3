import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { rescheduleInitialEmailQueue } from "@/lib/outreach/reschedule-initial-queue";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      daysAhead?: unknown;
      localHour?: unknown;
    };

    const daysAhead =
      typeof body.daysAhead === "number" && body.daysAhead >= 1
        ? Math.min(14, Math.floor(body.daysAhead))
        : 1;
    const localHour =
      typeof body.localHour === "number" && Number.isFinite(body.localHour)
        ? body.localHour
        : undefined;

    const result = await rescheduleInitialEmailQueue(ctx, { daysAhead, localHour });
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/outreach/reschedule-queue]");
  }
}
