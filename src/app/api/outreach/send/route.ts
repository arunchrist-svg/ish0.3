import { NextResponse } from "next/server";
import { db, outreachApprovals, leadOutreach, leads, contacts, outreachSchedule, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import { sendEmail } from "@/lib/email/resend-client";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { approvalId } = await req.json();
    if (!approvalId) return NextResponse.json({ error: "approvalId required" }, { status: 400 });

    const approval = await db.query.outreachApprovals.findFirst({
      where: eq(outreachApprovals.id, approvalId),
    });
    if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    if (approval.status !== "approved") {
      return NextResponse.json({ error: "Approval not in approved state" }, { status: 400 });
    }

    const outreach = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, approval.leadOutreachId),
    });
    if (!outreach) return NextResponse.json({ error: "Outreach not found" }, { status: 404 });

    const leadRow = await db.query.leads.findFirst({
      where: eq(leads.id, approval.leadId),
      with: { contact: true },
    });
    if (!leadRow) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (isManualStage(leadRow.status) || isPastReplyStage(leadRow.status)) {
      return NextResponse.json({ error: "Lead is past outreach stage" }, { status: 400 });
    }

    const contact = leadRow.contact as typeof contacts.$inferSelect;

    const result = await sendEmail({
      to: contact.email ?? "",
      subject: approval.subjectUsed ?? outreach.subjectA ?? "Diwali gifting for your team",
      html: buildEmailHtml({ body: outreach.emailBody ?? "" }),
      replyTo: process.env.EMAIL_REPLY_TO_ADDRESS,
    });

    // Update lead status
    await db.update(leads).set({ status: "outreached" }).where(eq(leads.id, approval.leadId));
    await db.insert(yieldFunnel).values({
      leadId: approval.leadId,
      stage: "outreached",
      metadata: { sendMode: result.mode, messageId: result.messageId },
    });

    // Schedule follow-ups (Day 4, 8, 14)
    const cadence = [4, 8, 14];
    const now = Date.now();
    for (const day of cadence) {
      const scheduledFor = new Date(now + day * 24 * 60 * 60 * 1000);
      await db.insert(outreachSchedule).values({
        leadId: approval.leadId,
        approvalId,
        channel: "email",
        sequenceDay: day,
        scheduledFor,
        sendMode: (process.env.EMAIL_SEND_MODE ?? "dry_run") as "dry_run" | "test" | "live",
      });
    }

    await logAudit({
      action: "outreach.sent",
      entityType: "lead",
      entityId: approval.leadId,
      metadata: { mode: result.mode, messageId: result.messageId, subject: result.subject },
    });

    return NextResponse.json({ mode: result.mode, messageId: result.messageId });
  } catch (e) {
    console.error("[api/outreach/send]", e);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
