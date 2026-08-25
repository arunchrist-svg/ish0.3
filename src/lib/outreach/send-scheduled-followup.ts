import { db, outreachSchedule, leads, contacts, accounts, leadOutreach, leadResearch } from "@/db";
import { and, eq } from "drizzle-orm";
import { hasUsableEmail } from "@/lib/enrichment/contact-emails";
import { sendEmail } from "@/lib/email/email-sender";
import { buildEmailHtml } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { generateRfcMessageId } from "@/lib/email/threading";
import { loadThreadContext, resolveOutboundSubject, resolveThreadHeaders } from "@/lib/email/thread-context";
import { isOutreachSendingPaused, resolveOutreachEmailStyle } from "@/lib/email/config";
import { evaluateOutreachDraft } from "@/lib/agents/quality-gate";
import { followUpThreadSubject, resolveDraftBody, resolveDraftSubject } from "@/lib/email/draft-variants";
import { cleanEmailAddress } from "@/lib/email/list-cleaner";
import { maybeAutoOpenWhatsAppAfterSecondEmail, type WhatsAppAutoOpenPayload } from "@/lib/whatsapp/auto-after-second-email";
import {
  CATALOG_ON_OPEN_EMAIL_KIND,
  isCatalogOnOpenDraft,
  isIshFestiveCatalogBody,
} from "@/lib/email/ish-festive-catalog";

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
}): Promise<{ messageId: string; mode: string; outreachId: string; whatsappOpen?: WhatsAppAutoOpenPayload }> {
  const [row] = await db
    .select({ schedule: outreachSchedule, leadTenantId: leads.tenantId })
    .from(outreachSchedule)
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .where(and(eq(outreachSchedule.id, params.scheduleId), eq(leads.tenantId, params.tenantId)))
    .limit(1);
  const sched = row?.schedule;
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

  const prior = await db.query.outreachSchedule.findMany({
    where: eq(outreachSchedule.leadId, sched.leadId),
  });
  if (prior.some((row) => row.bouncedAt && row.sendMode !== "test")) {
    throw new Error("Sequence paused: an earlier email bounced");
  }

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const research = lead.research as typeof leadResearch.$inferSelect | null;

  const senderUserId = lead.createdByUserId ?? params.actorId ?? null;
  const emailConfig = await getResolvedEmailConfig(params.workspaceId, senderUserId);
  if (isOutreachSendingPaused(emailConfig)) throw new Error("Outreach sending is paused");
  if (emailConfig.sendMode === "live") {
    await assertPlanEntitlement(params.tenantId, "live_send");
  }

  let generatedOutreach = sched.draftLeadOutreachId
    ? await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, sched.draftLeadOutreachId) })
    : null;
  if (!generatedOutreach) throw new Error("No outreach draft linked to schedule");

  const email1Outreach =
    generatedOutreach.sequencePosition === 1
      ? generatedOutreach
      : await db.query.leadOutreach.findFirst({
          where: and(eq(leadOutreach.leadId, sched.leadId), eq(leadOutreach.sequencePosition, 1)),
        });

  const seqPos = generatedOutreach.sequencePosition ?? 2;
  const followUpDraftSubject = resolveDraftSubject(generatedOutreach);
  const email1Subject = email1Outreach ? resolveDraftSubject(email1Outreach) : "";
  const body = resolveDraftBody(generatedOutreach);
  const isCatalog =
    sched.emailKind === CATALOG_ON_OPEN_EMAIL_KIND ||
    isCatalogOnOpenDraft(generatedOutreach) ||
    isIshFestiveCatalogBody(body);

  const quality = await evaluateOutreachDraft({
    subject: followUpDraftSubject || email1Subject || `Re: Outreach for ${account.name}`,
    emailBody: body,
    contact: { name: contact.name, firstName: contact.firstName, title: contact.title },
    account,
    outreachHook: research?.outreachHook,
    sequencePosition: seqPos,
  });

  if (
    emailConfig.sendMode === "live" &&
    !isCatalog &&
    !quality.passes &&
    !params.overrideQualityGate
  ) {
    throw new FollowUpQualityError(quality.delivScore, quality.rubricTotal);
  }

  try {
    await assertSenderPreflight(emailConfig, params.workspaceId, {
      override: Boolean(params.overridePreflight),
      projectedAdditional: 1,
    });
  } catch (e) {
    if (e instanceof SenderPreflightError) throw e;
    throw e;
  }

  const thread = await loadThreadContext(sched.leadId, lead);
  // If Opened uses its own selected A/B subject, not Re: Email 1.
  const threadedSubject = isCatalog
    ? followUpDraftSubject || `festive gifting for ${account.name}`
    : resolveOutboundSubject({
        isReplySend: false,
        isFollowUp: true,
        rootSubject: thread.rootSubject,
        fallbackSubject:
          followUpThreadSubject({
            threadRootSubject: thread.rootSubject,
            email1Draft: email1Outreach,
          }) ||
          email1Subject ||
          followUpDraftSubject ||
          `Re: Outreach for ${account.name}`,
      });

  const threadHeaders = resolveThreadHeaders({
    isReplySend: false,
    isFollowUp: true,
    rootMessageId: thread.rootMessageId,
    inboundMessageId: null,
    referencesChain: thread.referencesChain,
  });

  const to = contact.email?.trim() ?? "";
  if (!hasUsableEmail(to, contact.emailStatus)) {
    throw new Error("Contact has no usable email address");
  }

  if (emailConfig.sendMode === "live") {
    const cleaned = await cleanEmailAddress(to);
    if (!cleaned.ok) {
      throw new Error(`Recipient failed list cleaning: ${cleaned.reason ?? "invalid"}`);
    }
  }

  const fromAddress = emailConfig.fromAddress ?? emailConfig.smtpUser ?? "noreply@localhost";
  const rfcMessageId = generateRfcMessageId(fromAddress);

  const result = await sendEmail({
    workspaceId: params.workspaceId,
    userId: senderUserId,
    to,
    subject: threadedSubject,
    html: buildEmailHtml({
      body,
      trackingToken: sched.trackingToken ?? undefined,
      appUrl: emailConfig.appUrl,
      emailStyle: resolveOutreachEmailStyle(emailConfig.emailStyle),
      signature: emailConfig.signature,
    }),
    replyTo: emailConfig.replyToAddress?.trim() || emailConfig.fromAddress,
    messageId: rfcMessageId,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
  });

  await db
    .update(outreachSchedule)
    .set({
      status: "sent",
      sentAt: new Date(),
      resendId: result.providerMessageId ?? result.messageId ?? null,
      rfcMessageId,
      recipientEmail: to,
      inReplyTo: threadHeaders.inReplyTo ?? null,
      referencesChain: threadHeaders.references ?? null,
      subjectSent: threadedSubject,
      bodySnippet: body.slice(0, 500) || null,
      emailKind: sched.emailKind === CATALOG_ON_OPEN_EMAIL_KIND ? CATALOG_ON_OPEN_EMAIL_KIND : "followup",
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

  const whatsappOpen = await maybeAutoOpenWhatsAppAfterSecondEmail({
    leadId: sched.leadId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
  });

  return {
    messageId: rfcMessageId,
    mode: result.mode,
    outreachId: generatedOutreach.id,
    ...(whatsappOpen ? { whatsappOpen } : {}),
  };
}

export { InsufficientCreditsError };
