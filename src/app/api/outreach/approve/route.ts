import { NextResponse } from "next/server";
import { db, outreachApprovals, yieldFunnel, leads, leadOutreach } from "@/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { leadOutreachId, leadId, channel, status, subjectUsed, rejectReason, rejectNote } =
      await req.json();

    if (!leadOutreachId || !leadId || !channel || !status) {
      return NextResponse.json({ error: "leadOutreachId, leadId, channel, status required" }, { status: 400 });
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [outreach] = await db
      .select()
      .from(leadOutreach)
      .where(and(eq(leadOutreach.id, leadOutreachId), eq(leadOutreach.leadId, leadId)))
      .limit(1);
    if (!outreach) {
      return NextResponse.json({ error: "Outreach draft not found" }, { status: 404 });
    }

    const [approval] = await db
      .insert(outreachApprovals)
      .values({
        leadOutreachId,
        leadId,
        channel,
        status,
        subjectUsed,
        rejectReason,
        rejectNote,
        reviewedAt: new Date(),
      })
      .returning();

    if (status === "approved") {
      await db.update(leads).set({ status: "approved" }).where(eq(leads.id, leadId));
      await db.insert(yieldFunnel).values({ leadId, stage: "approved", metadata: { approvalId: approval.id } });
    }

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: `outreach.${status}`,
      entityType: "outreach_approval",
      entityId: approval.id,
      metadata: { leadId, channel, rejectReason },
    });

    return NextResponse.json({ approvalId: approval.id });
  } catch (e) {
    return handleApiError(e, "[api/outreach/approve]");
  }
}
