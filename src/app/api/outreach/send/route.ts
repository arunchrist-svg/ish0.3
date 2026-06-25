import { NextResponse } from "next/server";
import { db, outreachApprovals, leadOutreach, leads, contacts, outreachSchedule, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
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
    if (!leadRow || leadRow.tenantId !== ctx.tenantId) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (isManualStage(leadRow.status) || isPastReplyStage(leadRow.status)) {
      return NextResponse.json({ error: "Lead is past outreach stage" }, { status: 400 });
    }

    const contact = leadRow.contact as typeof contacts.$inferSelect;
    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
    if (emailConfig.sendMode === "live") {
      await assertPlanEntitlement(ctx.tenantId, "live_send");
      await assertCredits(ctx.tenantId, "email.live", 1);
    }
    const email1TrackingToken = crypto.randomUUID();

    const result = await sendEmail({
      workspaceId: ctx.workspaceId,
      to: contact.email ?? "",
      subject: approval.subjectUsed ?? outreach.subjectA ?? "Diwali gifting for your team",
      html: buildEmailHtml({
        body: outreach.emailBody ?? "",
        trackingToken: email1TrackingToken,
        appUrl: emailConfig.appUrl,
      }),
      replyTo: emailConfig.replyToAddress,
    });

    // Update lead status
    await db.update(leads).set({ status: "outreached" }).where(eq(leads.id, approval.leadId));
    await db.insert(yieldFunnel).values({
      leadId: approval.leadId,
      stage: "outreached",
      metadata: { sendMode: result.mode, messageId: result.messageId },
    });

    // Record day-0 (initial email) in schedule for tracking
    const sendMode = emailConfig.sendMode;
    await db.insert(outreachSchedule).values({
      leadId: approval.leadId,
      approvalId,
      channel: "email",
      sequenceDay: 0,
      scheduledFor: new Date(),
      sentAt: new Date(),
      status: "sent",
      sendMode,
      resendId: result.messageId, // provider message id (SMTP or Resend)
      trackingToken: email1TrackingToken,
    });

    // Schedule follow-ups from email config
    const cadence = emailConfig.cadenceDays;
    const now = Date.now();
    for (const day of cadence) {
      const scheduledFor = new Date(now + day * 24 * 60 * 60 * 1000);
      await db.insert(outreachSchedule).values({
        leadId: approval.leadId,
        approvalId,
        channel: "email",
        sequenceDay: day,
        scheduledFor,
        sendMode,
        trackingToken: crypto.randomUUID(),
      });
    }

    if (emailConfig.sendMode === "live") {
      await deductCredits({ tenantId: ctx.tenantId, action: "email.live", referenceId: approval.leadId });
      void checkLowBalanceAlerts(ctx.tenantId);
    }

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      action: "outreach.sent",
      entityType: "lead",
      entityId: approval.leadId,
      metadata: { mode: result.mode, messageId: result.messageId, subject: result.subject },
    });

    return NextResponse.json({ mode: result.mode, messageId: result.messageId });
  } catch (e) {
    return handleApiError(e, "[api/outreach/send]");
  }
}
