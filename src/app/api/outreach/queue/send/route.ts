import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { db, outreachSchedule, leads } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { sendScheduledInitialEmail } from "@/lib/outreach/send-scheduled-initial";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      scheduleId?: unknown;
      leadId?: unknown;
      overridePreflight?: unknown;
    };

    let scheduleId =
      typeof body.scheduleId === "string" && body.scheduleId.trim() ? body.scheduleId.trim() : "";

    if (!scheduleId && typeof body.leadId === "string" && body.leadId.trim()) {
      const leadId = body.leadId.trim();
      const [row] = await db
        .select({ id: outreachSchedule.id })
        .from(outreachSchedule)
        .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
        .where(
          and(
            eq(outreachSchedule.leadId, leadId),
            eq(leads.tenantId, ctx.tenantId),
            eq(leads.workspaceId, ctx.workspaceId),
            eq(outreachSchedule.channel, "email"),
            eq(outreachSchedule.sequenceDay, 0),
            inArray(outreachSchedule.status, ["scheduled", "sending"]),
          ),
        )
        .limit(1);
      scheduleId = row?.id ?? "";
    }

    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId or leadId required" }, { status: 400 });
    }

    const result = await sendScheduledInitialEmail({
      scheduleId,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      overridePreflight: Boolean(body.overridePreflight),
      actorId: ctx.userId,
    });

    return NextResponse.json({ ok: true, scheduleId, ...result });
  } catch (e) {
    return handleApiError(e, "[api/outreach/queue/send]");
  }
}
