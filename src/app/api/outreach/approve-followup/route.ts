import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, leads, outreachSchedule } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Promote a pending_review follow-up to scheduled so the sequencer can send it
 * in the normal window (Approve without Send now).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as { scheduleId?: unknown };
    const scheduleId = typeof body.scheduleId === "string" ? body.scheduleId.trim() : "";
    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    const [row] = await db
      .select({
        id: outreachSchedule.id,
        leadId: outreachSchedule.leadId,
        status: outreachSchedule.status,
        sequenceDay: outreachSchedule.sequenceDay,
        tenantId: leads.tenantId,
        workspaceId: leads.workspaceId,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
      .where(
        and(
          eq(outreachSchedule.id, scheduleId),
          eq(leads.tenantId, ctx.tenantId),
          eq(leads.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }
    if (row.sequenceDay <= 0) {
      return NextResponse.json({ error: "Not a follow-up schedule" }, { status: 400 });
    }
    if (row.status !== "pending_review" && row.status !== "paused") {
      return NextResponse.json(
        { error: `Follow-up is ${row.status}, not awaiting approval` },
        { status: 400 },
      );
    }

    await db
      .update(outreachSchedule)
      .set({ status: "scheduled", lastError: null })
      .where(eq(outreachSchedule.id, scheduleId));

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "outreach.followup_approved",
      entityType: "outreach_schedule",
      entityId: scheduleId,
      metadata: { leadId: row.leadId, sequenceDay: row.sequenceDay, fromStatus: row.status },
    });

    return NextResponse.json({ ok: true, scheduleId, status: "scheduled" });
  } catch (e) {
    return handleApiError(e, "[api/outreach/approve-followup]");
  }
}
