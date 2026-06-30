import { db, outreachSchedule, leads, contacts, accounts, leadOutreach, leadResearch } from "@/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { isOutreachSendingPaused } from "@/lib/email/config";
import { evaluateOutreachDraft } from "@/lib/agents/quality-gate";

export class FollowUpQualityError extends Error {
  code = "FOLLOWUP_QUALITY_FAILED" as const;
  delivScore: number;
  rubricTotal: number;

  constructor(delivScore: number, rubricTotal: number) {
    super(`Follow-up quality gate failed (inbox ${delivScore}, rubric ${rubricTotal})`);
    this.name = "FollowUpQualityError";
    this.delivScore = delivScore;
    this.rubricTotal = rubricTotal;
  }
}

export async function sendScheduledFollowUp(params: {
  scheduleId: string;
  tenantId: string;
  workspaceId: string;
  overridePreflight?: boolean;
  overrideQualityGate?: boolean;
  actorId?: string;
}): Promise<{ messageId: string; mode: string; outreachId: string }> {
  const sched = await db.query.outreachSchedule.findFirst({
    where: eq(outreachSchedule.id, params.scheduleId),
  });
  if (!sched) throw new Error("Schedule not found");
  if (sched.status !== "scheduled" && sched.status !== "pending_review") {
    throw new Error("Schedule is not sendable");
  }
  if (sched.sequenceDay <= 0) throw new Error("Not a follow-up schedule row");

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, sched.leadId),
    with: { contact: true, account: true, research: true },
  });
  if (!lead || lead.tenantId !== params.tenantId) throw new Error("Lead not found");
  if (lead.status !== "outreached") throw new Error("Lead is not in outreached status");

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const research = lead.research as typeof leadResearch.$inferSelect | null;

  const emailConfig = await getResolvedEmailConfig(params.workspaceId);
  if (isOutreachSendingPaused(emailConfig)) throw new Error("Outreach sending is paused");
  if (emailConfig.sendMode === "live") {
    await assertPlanEntitlement(params.tenantId, "live_send");
  }

  let generatedOutreach = sched.draftLeadOutreachId
    ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, sched.draftLeadOutreachId) })
    : null;
  if (!generatedOutreach) throw new Error("No outreach draft linked to schedule");

  const subject = generatedOutreach.subjectA ?? `Re: Diwali gifting for ${account.name}`;
  const body = generatedOutreach.emailBody ?? "";

  const quality = await evaluateOutreachDraft({
    subject,
    emailBody: body,
    contact: { name: contact.name, firstName: contact.firstName, title: contact.title },
    account,
    giftingHook: research?.giftingHook,
    sequencePosition: generatedOutreach.sequencePosition ?? 2,
  });

  if (!quality.passes && !params.overrideQualityGate) {
    throw new FollowUpQualityError(quality.delivScore, quality.rubricTotal);
  }

  try {
    await assertSenderPreflight(emailConfig, params.workspaceId, {
      override: Boolean(params.overridePreflight),
    });
  } catch (e) {
    if (e instanceof SenderPreflightError) throw e;
    throw e;
  }

  const thread = await loadThreadContext(sched.leadId, lead);
  const threadedSubject = thread.rootSubject
    ? resolveOutboundSubject({ isReplySend: true, rootSubject: thread.rootSubject, fallbackSubject: thread.rootSubject })
    : subject;

  const threadHeaders = resolveThreadHeaders({
    isReplySend: false,
    isFollowUp: true,
    rootMessageId: thread.rootMessageId,
    inboundMessageId: null,
    referencesChain: thread.referencesChain,
  });

  const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@ish.local";
  const rfcMessageId = generateRfcMessageId(fromAddress);

  const result = await sendEmail({
    workspaceId: params.workspaceId,
    to: contact.email ?? "",
    subject: threadedSubject,
    html: buildEmailHtml({
      body,
      trackingToken: sched.trackingToken ?? undefined,
      appUrl: emailConfig.appUrl,
      emailStyle: emailConfig.emailStyle,
    }),
    replyTo: emailConfig.replyToAddress,
    messageId: rfcMessageId,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
  });

  await db
    .update(outreachSchedule)
    .set({
      status: "sent",
      sentAt: new Date(),
      resendId: result.messageId,
      rfcMessageId,
      inReplyTo: threadHeaders.inReplyTo ?? null,
      referencesChain: threadHeaders.references ?? null,
      subjectSent: threadedSubject,
      bodySnippet: body.slice(0, 500) || null,
      emailKind: "followup",
      draftLeadOutreachId: generatedOutreach.id,
    })
    .where(eq(outreachSchedule.id, sched.id));

  if (emailConfig.sendMode === "live") {
    await deductCredits({
      tenantId: params.tenantId,
      action: "email.live",
      referenceId: sched.leadId,
      idempotencyKey: `followup-send-${sched.id}`,
    });
  }

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: "sequencer.sent",
    entityType: "lead",
    entityId: sched.leadId,
    metadata: {
      day: sched.sequenceDay,
      mode: result.mode,
      messageId: rfcMessageId,
      outreachId: generatedOutreach.id,
      manualReview: sched.status === "pending_review",
      qualityOverride: Boolean(params.overrideQualityGate && !quality.passes),
    },
  });

  return { messageId: rfcMessageId, mode: result.mode, outreachId: generatedOutreach.id };
}

export { InsufficientCreditsError };
