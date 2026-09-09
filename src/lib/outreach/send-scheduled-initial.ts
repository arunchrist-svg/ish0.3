import { db, outreachSchedule, leads, contacts, leadOutreach, outreachApprovals, yieldFunnel } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight } from "@/lib/email/sender-preflight";
import { deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { isOutreachSendingPaused, resolveOutreachEmailStyle } from "@/lib/email/config";
import {
  computeFollowUpScheduledFor,
  isWithinSendWindow,
  nextSendWindowStart,
  sendWindowFromEmailFields,
} from "@/lib/email/send-window";
import { loadSequenceDrafts } from "@/lib/agents/writer-sequence";
import { maybeAutoOpenWhatsAppAfterFirstEmail } from "@/lib/whatsapp/auto-after-first-email";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import { auditOutreachSentContent } from "@/lib/email/feedback-hooks";
import { isAllowedInitialSequenceDraft } from "@/lib/email/draft-variants";

/**
 * Send a queued Email 1 (sequenceDay 0) that was deferred to the settings send window.
 */
export async function sendScheduledInitialEmail(params: {
  scheduleId: string;
  tenantId: string;
  workspaceId: string;
  overridePreflight?: boolean;
  actorId?: string;
}): Promise<{ messageId: string; mode: string }> {
  const [row] = await db
    .select({ schedule: outreachSchedule, leadTenantId: leads.tenantId })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(and(eq(outreachSchedule.id, params.scheduleId), eq(leads.tenantId, params.tenantId)))
    .limit(1);

  const sched = row?.schedule;
  if (!sched) throw new Error("Schedule not found");
  if (sched.status !== "scheduled" && sched.status !== "sending") {
    throw new Error("Schedule is not sendable");
  }
  if (sched.sequenceDay !== 0 || sched.emailKind === "inbound_reply" || sched.emailKind === "outbound_reply") {
    throw new Error("Not a queued Email 1 schedule row");
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, sched.leadId),
    with: { contact: true, account: true },
  });
  if (!lead || lead.tenantId !== params.tenantId) throw new Error("Lead not found");
  if (lead.status !== "draft_ready" && lead.status !== "outreached") {
    throw new Error("Lead is not ready for Email 1 send");
  }

  const contact = lead.contact as typeof contacts.$inferSelect;
  const senderUserId = lead.createdByUserId ?? params.actorId ?? null;
  const emailConfig = await getResolvedEmailConfig(params.workspaceId, senderUserId);
  if (isOutreachSendingPaused(emailConfig)) throw new Error("Outbox sending is paused");

  const sendWindow = sendWindowFromEmailFields(emailConfig);
  const now = new Date();
  if (!isWithinSendWindow(now, sendWindow)) {
    const nextSlot = nextSendWindowStart(now, sendWindow);
    if (nextSlot.getTime() > now.getTime()) {
      await db
        .update(outreachSchedule)
        .set({ scheduledFor: nextSlot })
        .where(eq(outreachSchedule.id, sched.id));
    }
    throw new Error("Outside send window");
  }

  if (emailConfig.sendMode === "live") {
    await assertPlanEntitlement(params.tenantId, "live_send");
  }

  await assertSenderPreflight(emailConfig, params.workspaceId, {
    override: Boolean(params.overridePreflight),
    projectedAdditional: 1,
  });

  const approval = sched.approvalId
    ? await db.query.outreachApprovals.findFirst({ where: eq(outreachApprovals.id, sched.approvalId) })
    : null;
  const outreach = sched.draftLeadOutreachId
    ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, sched.draftLeadOutreachId) })
    : approval
      ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, approval.leadOutreachId) })
      : null;
  if (!outreach && !approval) throw new Error("No outreach draft for queued Email 1");
  if (outreach && !isAllowedInitialSequenceDraft(outreach)) {
    throw new Error("Queued Email 1 is linked to a follow-up or If Opened draft");
  }

  const to = (sched.recipientEmail ?? contact.email ?? "").trim();
  if (!to) throw new Error("No recipient on queued Email 1");

  const thread = await loadThreadContext(sched.leadId, lead);
  const fallbackSubject = approval?.subjectUsed ?? outreach?.subjectA ?? "Outreach for your team";
  const subject = resolveOutboundSubject({
    isReplySend: false,
    rootSubject: thread.rootSubject,
    fallbackSubject,
  });
  const body = approval?.bodyUsed || outreach?.emailBody || "";
  const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@localhost";
  const rfcMessageId = generateRfcMessageId(fromAddress);
  const trackingToken = sched.trackingToken ?? crypto.randomUUID();
  const threadHeaders = resolveThreadHeaders({
    isReplySend: false,
    isFollowUp: false,
    rootMessageId: thread.rootMessageId,
    inboundMessageId: thread.inboundMessageId,
    referencesChain: thread.referencesChain,
  });

  const result = await sendEmail({
    workspaceId: params.workspaceId,
    userId: senderUserId ?? undefined,
    to,
    subject,
    html: buildEmailHtml({
      body,
      trackingToken,
      appUrl: emailConfig.appUrl,
      emailStyle: resolveOutreachEmailStyle(emailConfig.emailStyle),
      signature: emailConfig.signature,
    }),
    replyTo: emailConfig.replyToAddress?.trim() || emailConfig.fromAddress,
    messageId: rfcMessageId,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
  });

  const sendMode = emailConfig.sendMode;
  const firstEmailForLead = lead.status !== "outreached";

  await db
    .update(outreachSchedule)
    .set({
      status: "sent",
      sentAt: now,
      sendMode,
      resendId: result.providerMessageId ?? result.messageId ?? null,
      rfcMessageId,
      recipientEmail: to,
      subjectSent: subject,
      bodySnippet: body.slice(0, 500) || null,
      trackingToken,
      lastError: null,
    })
    .where(eq(outreachSchedule.id, sched.id));

  if (firstEmailForLead) {
    await db
      .update(leads)
      .set({
        status: "outreached",
        threadRootMessageId: rfcMessageId,
        threadRootSubject: subject,
      })
      .where(eq(leads.id, sched.leadId));

    await db.insert(yieldFunnel).values({
      leadId: sched.leadId,
      stage: "outreached",
      metadata: { sendMode: result.mode, messageId: rfcMessageId, queued: true },
    });

    const cadence = emailConfig.cadenceDays;
    const sequenceDrafts = await loadSequenceDrafts(sched.leadId);
    for (let i = 0; i < cadence.length; i++) {
      const day = cadence[i];
      const scheduledFor = computeFollowUpScheduledFor(now, day, sendWindow);
      const linkedDraft = sequenceDrafts.find((d) => d.sequencePosition === i + 2);
      await db.insert(outreachSchedule).values({
        leadId: sched.leadId,
        approvalId: sched.approvalId,
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
      tenantId: params.tenantId,
      action: "email.live",
      quantity: 1,
      referenceId: sched.leadId,
      idempotencyKey: `queued-initial-${sched.id}`,
    });
    void checkLowBalanceAlerts(params.tenantId);
  }

  const contentScoreResult = scoreSpamMeter(body, subject, {
    contactFirstName: contact.firstName ?? contact.name.split(" ")[0],
    sequencePosition: 1,
  });

  await auditOutreachSentContent({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    leadId: sched.leadId,
    approvalId: sched.approvalId ?? "",
    contentScore: outreach?.deliverabilityScore ?? contentScoreResult.contentScore,
    ruleIds: contentScoreResult.ruleHits?.map((h) => h.id) ?? [],
    subject,
    sendMode,
  });

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "outreach.sent",
    entityType: "lead",
    entityId: sched.leadId,
    metadata: {
      mode: result.mode,
      messageId: rfcMessageId,
      subject,
      queued: true,
      scheduleId: sched.id,
      approvalId: sched.approvalId,
    },
  });

  if (firstEmailForLead) {
    void maybeAutoOpenWhatsAppAfterFirstEmail({
      leadId: sched.leadId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
    });
  }

  return { messageId: rfcMessageId, mode: result.mode };
}

/** Cancel any previously queued Email 1 rows for this lead before inserting a new queue. */
export async function cancelQueuedInitialEmails(leadId: string): Promise<void> {
  const pending = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .where(
      and(
        eq(outreachSchedule.leadId, leadId),
        eq(outreachSchedule.sequenceDay, 0),
        inArray(outreachSchedule.status, ["scheduled", "paused", "sending"]),
      ),
    );
  const ids = pending.map((r) => r.id);
  if (ids.length === 0) return;
  await db.update(outreachSchedule).set({ status: "cancelled" }).where(inArray(outreachSchedule.id, ids));
}

/**
 * Cancel queued Email 1 rows (day 0 scheduled/paused/sending) for leads in a workspace.
 * When `leadIds` is omitted, cancels all matching rows in the workspace.
 */
export async function cancelQueuedInitialEmailsBatch(params: {
  tenantId: string;
  workspaceId: string;
  leadIds?: string[];
}): Promise<{ cancelled: number; leadIds: string[] }> {
  const conditions = [
    eq(leads.tenantId, params.tenantId),
    eq(leads.workspaceId, params.workspaceId),
    eq(outreachSchedule.channel, "email"),
    eq(outreachSchedule.sequenceDay, 0),
    inArray(outreachSchedule.status, ["scheduled", "paused", "sending"]),
  ];
  if (params.leadIds?.length) {
    conditions.push(inArray(outreachSchedule.leadId, params.leadIds));
  }

  const pending = await db
    .select({ id: outreachSchedule.id, leadId: outreachSchedule.leadId })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(and(...conditions));

  const ids = pending.map((r) => r.id);
  if (ids.length === 0) return { cancelled: 0, leadIds: [] };

  await db.update(outreachSchedule).set({ status: "cancelled" }).where(inArray(outreachSchedule.id, ids));
  return {
    cancelled: ids.length,
    leadIds: [...new Set(pending.map((r) => r.leadId))],
  };
}
