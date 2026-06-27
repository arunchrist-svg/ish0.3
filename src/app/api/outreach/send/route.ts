import { NextResponse } from "next/server";
import { db, outreachApprovals, leadOutreach, leads, contacts, outreachSchedule, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { getResolvedEmailConfig} from "@/lib/settings/email-settings";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import { assertSenderPreflight } from "@/lib/email/sender-preflight";
import { logAudit } from "@/lib/audit";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { loadSequenceDrafts } from "@/lib/agents/writer-sequence";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { approvalId, overridePreflight } = await req.json();
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

    const isReplySend = outreach.templateVariant === "reply" || leadRow.status === "replied";

    if (!isReplySend && (isManualStage(leadRow.status) || isPastReplyStage(leadRow.status))) {
      return NextResponse.json({ error: "Lead is past outreach stage" }, { status: 400 });
    }

    const contact = leadRow.contact as typeof contacts.$inferSelect;
    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
    if (emailConfig.sendMode === "live") {
      await assertPlanEntitlement(ctx.tenantId, "live_send");
      await assertCredits(ctx.tenantId, "email.live", 1);
    }

    const preflight = await assertSenderPreflight(emailConfig, ctx.workspaceId, {
      override: Boolean(overridePreflight),
    });
    if (overridePreflight && preflight.hasCritical) {
      await logAudit({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        action: "outreach.preflight_override",
        entityType: "lead",
        entityId: approval.leadId,
        metadata: { issues: preflight.issues },
      });
    }

    const thread = await loadThreadContext(approval.leadId, leadRow);
    const fallbackSubject = approval.subjectUsed ?? outreach.subjectA ?? "Diwali gifting for your team";
    const subject = resolveOutboundSubject({
      isReplySend,
      rootSubject: thread.rootSubject,
      fallbackSubject,
    });

    const threadHeaders = resolveThreadHeaders({
      isReplySend,
      isFollowUp: false,
      rootMessageId: thread.rootMessageId,
      inboundMessageId: thread.inboundMessageId,
      referencesChain: thread.referencesChain,
    });

    const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@ish.local";
    const rfcMessageId = generateRfcMessageId(fromAddress);
    const email1TrackingToken = crypto.randomUUID();

    const result = await sendEmail({
      workspaceId: ctx.workspaceId,
      to: contact.email ?? "",
      subject,
      html: buildEmailHtml({
        body: outreach.emailBody ?? "",
        trackingToken: email1TrackingToken,
        appUrl: emailConfig.appUrl,
        emailStyle: emailConfig.emailStyle,
      }),
      replyTo: emailConfig.replyToAddress,
      messageId: rfcMessageId,
      inReplyTo: threadHeaders.inReplyTo,
      references: threadHeaders.references,
    });

    const sendMode = emailConfig.sendMode;
    const scheduleBase = {
      leadId: approval.leadId,
      approvalId,
      channel: "email" as const,
      scheduledFor: new Date(),
      sentAt: new Date(),
      status: "sent" as const,
      sendMode,
      resendId: result.messageId,
      rfcMessageId,
      inReplyTo: threadHeaders.inReplyTo ?? null,
      referencesChain: threadHeaders.references ?? null,
      subjectSent: subject,
      bodySnippet: (outreach.emailBody ?? "").slice(0, 500) || null,
      trackingToken: email1TrackingToken,
    };

    if (isReplySend) {
      await db.insert(outreachSchedule).values({
        ...scheduleBase,
        sequenceDay: -1,
        emailKind: "outbound_reply",
      });
      await db.insert(yieldFunnel).values({
        leadId: approval.leadId,
        stage: "replied",
        metadata: { sendMode: result.mode, messageId: rfcMessageId, kind: "reply_sent" },
      });
    } else {
      await db.update(leads).set({
        status: "outreached",
        threadRootMessageId: rfcMessageId,
        threadRootSubject: subject,
      }).where(eq(leads.id, approval.leadId));
      await db.insert(yieldFunnel).values({
        leadId: approval.leadId,
        stage: "outreached",
        metadata: { sendMode: result.mode, messageId: rfcMessageId },
      });

      await db.insert(outreachSchedule).values({
        ...scheduleBase,
        sequenceDay: 0,
        emailKind: "initial",
      });

      const cadence = emailConfig.cadenceDays;
      const now = Date.now();
      const sequenceDrafts = await loadSequenceDrafts(approval.leadId);
      for (let i = 0; i < cadence.length; i++) {
        const day = cadence[i];
        const scheduledFor = new Date(now + day * 24 * 60 * 60 * 1000);
        const linkedDraft = sequenceDrafts.find((d) => d.sequencePosition === i + 2);
        await db.insert(outreachSchedule).values({
          leadId: approval.leadId,
          approvalId,
          channel: "email",
          sequenceDay: day,
          scheduledFor,
          sendMode,
          trackingToken: crypto.randomUUID(),
          status: "scheduled",
          emailKind: "followup",
          draftLeadOutreachId: linkedDraft?.id ?? null,
        });
      }
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
      metadata: { mode: result.mode, messageId: rfcMessageId, subject: result.subject, threaded: Boolean(threadHeaders.inReplyTo) },
    });

    return NextResponse.json({ mode: result.mode, messageId: rfcMessageId, to: result.to });
  } catch (e) {
    return handleApiError(e, "[api/outreach/send]");
  }
}
