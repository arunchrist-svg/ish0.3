import { NextResponse } from "next/server";
import { db, outreachApprovals, yieldFunnel, leads } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { leadOutreachId, leadId, channel, status, subjectUsed, rejectReason, rejectNote } = await req.json();

    if (!leadOutreachId || !leadId || !channel || !status) {
      return NextResponse.json({ error: "leadOutreachId, leadId, channel, status required" }, { status: 400 });
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
      action: `outreach.${status}`,
      entityType: "outreach_approval",
      entityId: approval.id,
      metadata: { leadId, channel, rejectReason },
    });

    return NextResponse.json({ approvalId: approval.id });
  } catch (e) {
    console.error("[api/outreach/approve]", e);
    return NextResponse.json({ error: "Approve failed" }, { status: 500 });
  }
}
