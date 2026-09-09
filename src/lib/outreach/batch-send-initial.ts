import {
  db,
  leads,
  contacts,
  accounts,
  leadOutreach,
  outreachApprovals,
  outreachSchedule,
  yieldFunnel,
} from "@/db";
import { and, eq } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { sendWindowFromEmailFields, formatQueuedSendLabel } from "@/lib/email/send-window";
import { recommendedDailyCap } from "@/lib/email/sender-warmup";
import { countInitialOutboundByCalendarDay } from "@/lib/email/sender-volume";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { isOutreachSendingPaused, OUTREACH_PAUSED_MESSAGE } from "@/lib/email/config";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import {
  isAllowedInitialSequenceDraft,
  resolveDraftBody,
  resolveDraftSubject,
} from "@/lib/email/draft-variants";
import { resolveSendRecipients } from "@/lib/outreach/send-recipients";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import { cancelQueuedInitialEmails } from "@/lib/outreach/send-scheduled-initial";
import {
  BATCH_SEND_GAP_MINUTES,
  countPlannedInRolling24h,
  planBatchInitialSends,
} from "@/lib/outreach/plan-batch-sends";
import { logAudit } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";

export type BatchSendLeadResult = {
  leadId: string;
  ok: boolean;
  scheduledFor?: string;
  scheduledForLabel?: string;
  error?: string;
};

export type BatchSendResult = {
  ok: number;
  failed: number;
  errors: string[];
  results: BatchSendLeadResult[];
  plan: {
    dailyCap: number;
    timezone: string;
    spanDays: number;
    firstAt: string | null;
    lastAt: string | null;
  };
};

export async function batchQueueInitialEmails(
  ctx: TenantContext,
  params: { leadIds: string[]; overridePreflight?: boolean },
): Promise<BatchSendResult> {
  const leadIds = params.leadIds.filter((id) => typeof id === "string" && id.length > 0);
  const result: BatchSendResult = {
    ok: 0,
    failed: 0,
    errors: [],
    results: [],
    plan: { dailyCap: 0, timezone: "", spanDays: 0, firstAt: null, lastAt: null },
  };

  if (leadIds.length === 0) return result;

  const emailConfig = await getResolvedEmailConfig(ctx.workspaceId, ctx.userId);
  if (isOutreachSendingPaused(emailConfig)) {
    throw new Error(OUTREACH_PAUSED_MESSAGE);
  }

  const sendWindow = sendWindowFromEmailFields(emailConfig);
  const rec = recommendedDailyCap({
    stage: emailConfig.inboxWarmupStage,
    warmupStartedAt: emailConfig.inboxWarmupStartedAt,
  });
  const dailyCap = emailConfig.dailySendCapPerDomain ?? rec.recommended;
  const now = new Date();

  const existingByDay = await countInitialOutboundByCalendarDay(ctx.workspaceId, sendWindow.timezone);
  const { slots, spanDays } = planBatchInitialSends({
    count: leadIds.length,
    window: sendWindow,
    dailyCap,
    now,
    existingByDay,
    gapMinutes: BATCH_SEND_GAP_MINUTES,
  });

  const inRolling24h = countPlannedInRolling24h(slots, now);
  try {
    await assertSenderPreflight(emailConfig, ctx.workspaceId, {
      override: Boolean(params.overridePreflight),
      projectedAdditional: inRolling24h,
    });
  } catch (e) {
    if (e instanceof SenderPreflightError) throw e;
    throw e;
  }

  result.plan = {
    dailyCap,
    timezone: sendWindow.timezone,
    spanDays,
    firstAt: slots[0]?.toISOString() ?? null,
    lastAt: slots[slots.length - 1]?.toISOString() ?? null,
  };

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];
    const scheduledFor = slots[i];

    try {
      const leadRow = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
        with: { contact: true, account: true },
      });
      if (!leadRow || leadRow.tenantId !== ctx.tenantId || leadRow.workspaceId !== ctx.workspaceId) {
        throw new Error("Lead not found");
      }
      if (isManualStage(leadRow.status) || isPastReplyStage(leadRow.status)) {
        throw new Error("Lead is past outreach stage");
      }

      const outreach = await db.query.leadOutreach.findFirst({
        where: and(eq(leadOutreach.leadId, leadId), eq(leadOutreach.sequencePosition, 1)),
      });
      if (!outreach || !isAllowedInitialSequenceDraft(outreach)) {
        throw new Error("No Email 1 draft ready");
      }

      const subject = resolveDraftSubject(outreach) || outreach.subjectA || "";
      const body = resolveDraftBody(outreach) || outreach.emailBody || "";
      if (!subject.trim() || !body.trim()) {
        throw new Error("Draft is missing subject or body");
      }

      const contact = leadRow.contact as typeof contacts.$inferSelect;
      const account = leadRow.account as typeof accounts.$inferSelect;
      const { recipients, error: recipientError } = resolveSendRecipients(
        {
          email: contact.email,
          emailStatus: contact.emailStatus,
          emailConfidence: contact.emailConfidence,
          enrichmentSource: contact.enrichmentSource,
          enrichmentProvider: contact.enrichmentProvider,
          alternateEmails: (contact.alternateEmails as ContactEmailEntry[] | null) ?? [],
          firstName: contact.firstName,
          lastName: contact.lastName,
          name: contact.name,
        },
        undefined,
        {
          firstName: contact.firstName,
          lastName: contact.lastName,
          name: contact.name,
          domain: account?.domain,
          website: account?.website,
          companyName: account?.name,
        },
      );
      if (recipientError || recipients.length === 0) {
        throw new Error(recipientError ?? "No recipients");
      }

      const [approval] = await db
        .insert(outreachApprovals)
        .values({
          leadOutreachId: outreach.id,
          leadId,
          channel: "email",
          status: "approved",
          subjectUsed: subject,
          bodyUsed: body,
          reviewedAt: new Date(),
        })
        .returning();

      if (leadRow.status !== "outreached" && leadRow.status !== "replied") {
        await db.update(leads).set({ status: "approved" }).where(eq(leads.id, leadId));
        await db.insert(yieldFunnel).values({
          leadId,
          stage: "approved",
          metadata: { approvalId: approval.id, batch: true },
        });
      }

      await cancelQueuedInitialEmails(leadId);
      const bodySnippet = body.slice(0, 500) || null;
      for (const to of recipients) {
        await db.insert(outreachSchedule).values({
          leadId,
          approvalId: approval.id,
          channel: "email",
          sequenceDay: 0,
          scheduledFor,
          status: "scheduled",
          sendMode: emailConfig.sendMode,
          recipientEmail: to,
          subjectSent: subject,
          bodySnippet,
          trackingToken: crypto.randomUUID(),
          emailKind: "initial",
          draftLeadOutreachId: outreach.id,
        });
      }

      await logAudit({
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "outreach.queued",
        entityType: "lead",
        entityId: leadId,
        metadata: {
          approvalId: approval.id,
          scheduledFor: scheduledFor.toISOString(),
          recipients,
          reason: "batch_planned",
          batchIndex: i,
          batchSize: leadIds.length,
        },
      });

      result.ok += 1;
      result.results.push({
        leadId,
        ok: true,
        scheduledFor: scheduledFor.toISOString(),
        scheduledForLabel: formatQueuedSendLabel(scheduledFor, sendWindow),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed";
      result.failed += 1;
      result.errors.push(`${leadId}: ${message}`);
      result.results.push({ leadId, ok: false, error: message });
    }
  }

  return result;
}
