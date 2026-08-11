import { NextResponse } from "next/server";
import { db, outreachApprovals, leadOutreach, leads, contacts, outreachSchedule, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { getResolvedEmailConfig} from "@/lib/settings/email-settings";
import { isOutreachSendingPaused, OUTREACH_PAUSED_MESSAGE } from "@/lib/email/config";
import { requireTenantContext } from "@/lib/tenant";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { handleApiError } from "@/lib/api-errors";
import { assertSenderPreflight } from "@/lib/email/sender-preflight";
import { logAudit } from "@/lib/audit";
import { auditOutreachSentContent } from "@/lib/email/feedback-hooks";
import { draftFailsQualityGate } from "@/lib/agents/quality-gate";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { loadSequenceDrafts } from "@/lib/agents/writer-sequence";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  applySendRejectionUpdates,
  shouldHandleSendFailure,
} from "@/lib/enrichment/email-candidate-queue";
import { buildContactEmails, hasUsableEmail } from "@/lib/enrichment/contact-emails";

function resolveSendRecipients(
  contact: typeof contacts.$inferSelect,
  requested?: unknown,
): { recipients: string[]; error?: string } {
  const allowed = buildContactEmails({
    primaryEmail: contact.email,
    emailStatus: contact.emailStatus,
    emailConfidence: contact.emailConfidence,
    enrichmentSource: contact.enrichmentSource,
    enrichmentProvider: contact.enrichmentProvider,
    alternateEmails: (contact.alternateEmails as import("@/lib/enrichment/contact-emails").ContactEmailEntry[] | null) ?? [],
  })
    .map((e) => e.email.trim().toLowerCase())
    .filter((e) => hasUsableEmail(e));

  const allowedSet = new Set(allowed);
  const rawList = Array.isArray(requested)
    ? requested.filter((v): v is string => typeof v === "string")
    : [];

  const requestedEmails = [...new Set(rawList.map((e) => e.trim().toLowerCase()).filter(Boolean))];

  if (requestedEmails.length === 0) {
    const primary = contact.email?.trim();
    if (!primary || !hasUsableEmail(primary, contact.emailStatus)) {
      return { recipients: [], error: "Contact has no usable email address" };
    }
    return { recipients: [primary] };
  }

  const invalid = requestedEmails.filter((e) => !allowedSet.has(e));
  if (invalid.length) {
    return {
      recipients: [],
      error: `Email not on this contact: ${invalid.join(", ")}`,
    };
  }

  // Preserve original casing from contact records where possible
  const byLower = new Map(
    buildContactEmails({
      primaryEmail: contact.email,
      emailStatus: contact.emailStatus,
      alternateEmails: (contact.alternateEmails as import("@/lib/enrichment/contact-emails").ContactEmailEntry[] | null) ?? [],
    }).map((e) => [e.email.trim().toLowerCase(), e.email.trim()]),
  );

  return {
    recipients: requestedEmails.map((e) => byLower.get(e) ?? e),
  };
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { approvalId, overridePreflight, overrideQualityGate, toEmails } = await req.json();
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

    if (overrideQualityGate && draftFailsQualityGate(outreach)) {
      await logAudit({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "outreach.quality_override",
        entityType: "lead_outreach",
        entityId: outreach.id,
        metadata: {
          leadId: approval.leadId,
          revisionTimeout: outreach.revisionTimeout,
          deliverabilityScore: outreach.deliverabilityScore,
          rubricTotal: outreach.rubricTotal,
        },
      });
    }

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
    const { recipients, error: recipientError } = resolveSendRecipients(contact, toEmails);
    if (recipientError || recipients.length === 0) {
      return NextResponse.json({ error: recipientError ?? "No recipients selected" }, { status: 400 });
    }

    const emailConfig = await getResolvedEmailConfig(ctx.workspaceId);
    if (isOutreachSendingPaused(emailConfig)) {
      return NextResponse.json({ error: OUTREACH_PAUSED_MESSAGE }, { status: 423 });
    }
    if (emailConfig.sendMode === "live") {
      await assertPlanEntitlement(ctx.tenantId, "live_send");
      await assertCredits(ctx.tenantId, "email.live", recipients.length);
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
    const fallbackSubject = approval.subjectUsed ?? outreach.subjectA ?? "Outreach for your team";
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

    const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@localhost";
    const primaryRecipient = recipients[0];
    const rfcMessageId = generateRfcMessageId(fromAddress);
    const email1TrackingToken = crypto.randomUUID();

    const sentResults: { to: string; messageId?: string; mode: string; trackingToken: string }[] = [];

    try {
      for (let i = 0; i < recipients.length; i++) {
        const to = recipients[i];
        const isPrimarySend = i === 0;
        const messageId = isPrimarySend ? rfcMessageId : generateRfcMessageId(fromAddress);
        const trackingToken = isPrimarySend ? email1TrackingToken : crypto.randomUUID();

        const result = await sendEmail({
          workspaceId: ctx.workspaceId,
          to,
          subject,
          html: buildEmailHtml({
            body: approval.bodyUsed || outreach.emailBody || "",
            trackingToken,
            appUrl: emailConfig.appUrl,
            emailStyle: emailConfig.emailStyle,
          }),
          replyTo: emailConfig.replyToAddress,
          messageId,
          inReplyTo: isPrimarySend ? threadHeaders.inReplyTo : undefined,
          references: isPrimarySend ? threadHeaders.references : undefined,
        });
        sentResults.push({ to: result.to, messageId, mode: result.mode, trackingToken });
      }
    } catch (sendError) {
      if (shouldHandleSendFailure(contact) && sentResults.length === 0) {
        const rejection = applySendRejectionUpdates(contact);
        const contactUpdates: Partial<typeof contacts.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (rejection.updates.email !== undefined) contactUpdates.email = rejection.updates.email;
        if (rejection.updates.emailStatus !== undefined) {
          contactUpdates.emailStatus = rejection.updates.emailStatus as typeof contacts.$inferInsert.emailStatus;
        }
        if (rejection.updates.emailConfidence !== undefined) {
          contactUpdates.emailConfidence = rejection.updates.emailConfidence;
        }
        if (rejection.updates.enrichmentSource !== undefined) {
          contactUpdates.enrichmentSource = rejection.updates.enrichmentSource;
        }
        if (rejection.updates.enrichmentProvider !== undefined) {
          contactUpdates.enrichmentProvider = rejection.updates.enrichmentProvider;
        }
        if (rejection.updates.alternateEmails !== undefined) {
          contactUpdates.alternateEmails = rejection.updates.alternateEmails;
        }
        await db.update(contacts).set(contactUpdates).where(eq(contacts.id, contact.id));

        await logAudit({
          tenantId: ctx.tenantId,
          workspaceId: ctx.workspaceId,
          action: "lead.email_send_rejected",
          entityType: "lead",
          entityId: approval.leadId,
          metadata: {
            rejectedEmail: rejection.rejectedEmail,
            nextEmail: rejection.nextEmail ?? null,
            canRetry: rejection.canRetry,
          },
        });

        return NextResponse.json(
          {
            code: "email_send_rejected",
            error: rejection.canRetry
              ? `Send failed for ${rejection.rejectedEmail}. Next candidate ready: ${rejection.nextEmail}`
              : `Send failed for ${rejection.rejectedEmail}. No saved candidates remain.`,
            rejectedEmail: rejection.rejectedEmail,
            nextEmail: rejection.nextEmail,
            canRetry: rejection.canRetry,
          },
          { status: 409 },
        );
      }
      throw sendError;
    }

    const result = sentResults[0];
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
        metadata: { sendMode: result.mode, messageId: rfcMessageId, kind: "reply_sent", recipients },
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
        metadata: { sendMode: result.mode, messageId: rfcMessageId, recipients },
      });

      await db.insert(outreachSchedule).values({
        ...scheduleBase,
        sequenceDay: 0,
        emailKind: "initial",
      });

      // Extra recipients: log as additional initial sends (no separate follow-up sequences)
      for (let i = 1; i < sentResults.length; i++) {
        const extra = sentResults[i];
        await db.insert(outreachSchedule).values({
          leadId: approval.leadId,
          approvalId,
          channel: "email",
          sequenceDay: 0,
          scheduledFor: new Date(),
          sentAt: new Date(),
          status: "sent",
          sendMode,
          resendId: extra.messageId,
          rfcMessageId: extra.messageId ?? null,
          subjectSent: subject,
          bodySnippet: (outreach.emailBody ?? "").slice(0, 500) || null,
          trackingToken: extra.trackingToken,
          emailKind: "initial",
        });
      }

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
      await deductCredits({
        tenantId: ctx.tenantId,
        action: "email.live",
        quantity: recipients.length,
        referenceId: approval.leadId,
      });
      void checkLowBalanceAlerts(ctx.tenantId);
    }

    const contentScoreResult = scoreSpamMeter(
      outreach.emailBody ?? "",
      subject,
      { contactFirstName: contact.firstName ?? contact.name.split(" ")[0], sequencePosition: outreach.sequencePosition ?? 1 },
    );

    await auditOutreachSentContent({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      leadId: approval.leadId,
      approvalId,
      contentScore: outreach.deliverabilityScore ?? contentScoreResult.contentScore,
      ruleIds: contentScoreResult.ruleHits?.map((h) => h.id) ?? [],
      subject,
      sendMode: sendMode,
    });

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      action: "outreach.sent",
      entityType: "lead",
      entityId: approval.leadId,
      metadata: {
        mode: result.mode,
        messageId: rfcMessageId,
        subject,
        threaded: Boolean(threadHeaders.inReplyTo),
        contentScore: outreach.deliverabilityScore ?? contentScoreResult.contentScore,
        contentRuleIds: contentScoreResult.ruleHits?.map((h) => h.id) ?? [],
        approvalId,
        qualityOverride: Boolean(overrideQualityGate && draftFailsQualityGate(outreach)),
        recipients,
        primaryRecipient,
      },
    });

    return NextResponse.json({
      mode: result.mode,
      messageId: rfcMessageId,
      to: recipients.join(", "),
      recipients,
    });
  } catch (e) {
    return handleApiError(e, "[api/outreach/send]");
  }
}
