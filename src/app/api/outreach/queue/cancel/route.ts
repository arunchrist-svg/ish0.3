import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { cancelQueuedInitialEmailsBatch } from "@/lib/outreach/send-scheduled-initial";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as { leadIds?: unknown; leadId?: unknown };

    const leadIdsRaw = Array.isArray(body.leadIds)
      ? body.leadIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : typeof body.leadId === "string" && body.leadId
        ? [body.leadId]
        : undefined;

    if (leadIdsRaw && leadIdsRaw.length === 0) {
      return NextResponse.json({ error: "leadIds required" }, { status: 400 });
    }

    const result = await cancelQueuedInitialEmailsBatch({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      leadIds: leadIdsRaw,
    });

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "outreach.queue_cancelled",
      entityType: "outreach_schedule",
      entityId: result.leadIds[0] ?? ctx.workspaceId,
      metadata: {
        cancelled: result.cancelled,
        leadIds: result.leadIds,
        scope: leadIdsRaw ? "selected" : "workspace",
      },
    });

    return NextResponse.json({
      ok: true,
      cancelled: result.cancelled,
      leadIds: result.leadIds,
    });
  } catch (e) {
    return handleApiError(e, "[api/outreach/queue/cancel]");
  }
}
