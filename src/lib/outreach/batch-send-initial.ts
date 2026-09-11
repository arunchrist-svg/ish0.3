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
import { and, eq, inArray } from "drizzle-orm";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { sendWindowFromEmailFields, formatQueuedSendLabel, type SendWindow } from "@/lib/email/send-window";
import { recommendedDailyCap } from "@/lib/email/sender-warmup";
import { countInitialOutboundByCalendarDay } from "@/lib/email/sender-volume";
import { assertSenderPreflight, SenderPreflightError } from "@/lib/email/sender-preflight";
import { isOutreachSendingPaused, OUTREACH_PAUSED_MESSAGE } from "@/lib/email/config";
import type { EmailConfig } from "@/lib/email/config";
import { isManualStage, isPastReplyStage } from "@/lib/pipeline-status";
import {
  isAllowedInitialSequenceDraft,
  resolveDraftBody,
  resolveDraftSubject,
} from "@/lib/email/draft-variants";
import { resolveSendRecipients } from "@/lib/outreach/send-recipients";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import { cancelQueuedInitialEmailsBatch } from "@/lib/outreach/send-scheduled-initial";
import {
  BATCH_SEND_GAP_MINUTES,
  countPlannedInRolling24h,
  planBatchInitialSends,
} from "@/lib/outreach/plan-batch-sends";
import { getLastInitialEmailQueueTime } from "@/lib/outreach/queue-schedule-tail";
import { logAudit } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";

const CHUNK_SIZE = 40;

export type BatchSendLeadResult = {
  leadId: string;
  ok: boolean;
  scheduledFor?: string;
  scheduledForLabel?: string;
  error?: string;
};

export type BatchSendPlan = {
  dailyCap: number;
  timezone: string;
  spanDays: number;
  firstAt: string | null;
  lastAt: string | null;
};

export type BatchSendResult = {
  ok: number;
  failed: number;
  errors: string[];
  results: BatchSendLeadResult[];
  plan: BatchSendPlan;
};

export type PreparedBatchQueue = {
  slots: Date[];
  plan: BatchSendPlan;
  emailConfig: EmailConfig;
  sendWindow: SendWindow;
};

type LeadBundle = {
  lead: typeof leads.$inferSelect;
  contact: typeof contacts.$inferSelect;
  account: typeof accounts.$inferSelect;
};

export async function prepareBatchQueue(
  ctx: TenantContext,
  params: { leadIds: string[]; overridePreflight?: boolean },
): Promise<PreparedBatchQueue> {
  const leadIds = params.leadIds.filter((id) => typeof id === "string" && id.length > 0);
  if (leadIds.length === 0) {
    throw new Error("No leads to queue");
  }

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

  const [existingByDay, queueAfter] = await Promise.all([
    countInitialOutboundByCalendarDay(ctx.workspaceId, sendWindow.timezone),
    getLastInitialEmailQueueTime(ctx.workspaceId),
  ]);
  const { slots, spanDays } = planBatchInitialSends({
    count: leadIds.length,
    window: sendWindow,
    dailyCap,
    now,
    existingByDay,
    gapMinutes: BATCH_SEND_GAP_MINUTES,
    queueAfter,
  });

  const inRolling24h = countPlannedInRolling24h(slots, now);
  await assertSenderPreflight(emailConfig, ctx.workspaceId, {
    override: Boolean(params.overridePreflight),
    projectedAdditional: inRolling24h,
  });

  return {
    slots,
    emailConfig,
    sendWindow,
    plan: {
      dailyCap,
      timezone: sendWindow.timezone,
      spanDays,
      firstAt: slots[0]?.toISOString() ?? null,
      lastAt: slots[slots.length - 1]?.toISOString() ?? null,
    },
  };
}

async function loadLeadBundles(ctx: TenantContext, leadIds: string[]): Promise<Map<string, LeadBundle>> {
  if (!leadIds.length) return new Map();
  const rows = await db
    .select({
      lead: leads,
      contact: contacts,
      account: accounts,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(
      and(
        inArray(leads.id, leadIds),
        eq(leads.tenantId, ctx.tenantId),
        eq(leads.workspaceId, ctx.workspaceId),
      ),
    );
  return new Map(rows.map((row) => [row.lead.id, row]));
}

async function loadOutreachByLead(leadIds: string[]): Promise<Map<string, typeof leadOutreach.$inferSelect>> {
  if (!leadIds.length) return new Map();
  const rows = await db
    .select()
    .from(leadOutreach)
    .where(and(inArray(leadOutreach.leadId, leadIds), eq(leadOutreach.sequencePosition, 1)));
  return new Map(rows.map((row) => [row.leadId, row]));
}

async function queueLeadForBatch(params: {
  ctx: TenantContext;
  leadId: string;
  scheduledFor: Date;
  bundle: LeadBundle;
  outreach: typeof leadOutreach.$inferSelect;
  emailConfig: EmailConfig;
  sendWindow: SendWindow;
  batchId?: string;
  batchIndex: number;
  batchSize: number;
}): Promise<BatchSendLeadResult> {
  const { ctx, leadId, scheduledFor, bundle, outreach, emailConfig, sendWindow, batchId, batchIndex, batchSize } =
    params;
  const leadRow = bundle.lead;

  if (isManualStage(leadRow.status) || isPastReplyStage(leadRow.status)) {
    throw new Error("Lead is past outreach stage");
  }
  if (leadRow.status === "outreached" || leadRow.status === "replied") {
    throw new Error("Email 1 already sent");
  }
  if (!isAllowedInitialSequenceDraft(outreach)) {
    throw new Error("No Email 1 draft ready");
  }

  const subject = resolveDraftSubject(outreach) || outreach.subjectA || "";
  const body = resolveDraftBody(outreach) || outreach.emailBody || "";
  if (!subject.trim() || !body.trim()) {
    throw new Error("Draft is missing subject or body");
  }

  const contact = bundle.contact;
  const account = bundle.account;
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
      metadata: { approvalId: approval.id, batch: true, batchId },
    });
  }

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
      batchId,
      batchIndex,
      batchSize,
    },
  });

  return {
    leadId,
    ok: true,
    scheduledFor: scheduledFor.toISOString(),
    scheduledForLabel: formatQueuedSendLabel(scheduledFor, sendWindow),
  };
}

export async function batchQueueInitialEmails(
  ctx: TenantContext,
  params: {
    leadIds: string[];
    overridePreflight?: boolean;
    prepared?: PreparedBatchQueue;
    batchId?: string;
  },
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

  const prepared = params.prepared ?? await prepareBatchQueue(ctx, params);
  const { slots, emailConfig, sendWindow } = prepared;
  result.plan = prepared.plan;

  let nextSlotIdx = 0;

  for (let offset = 0; offset < leadIds.length; offset += CHUNK_SIZE) {
    const chunkIds = leadIds.slice(offset, offset + CHUNK_SIZE);
    const bundles = await loadLeadBundles(ctx, chunkIds);
    const outreachByLead = await loadOutreachByLead(chunkIds);

    await cancelQueuedInitialEmailsBatch({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      leadIds: chunkIds,
    });

    for (let i = 0; i < chunkIds.length; i++) {
      const leadId = chunkIds[i];
      const scheduledFor = slots[nextSlotIdx];

      try {
        const bundle = bundles.get(leadId);
        if (!bundle) {
          throw new Error("Lead not found");
        }
        const outreach = outreachByLead.get(leadId);
        if (!outreach) {
          throw new Error("No Email 1 draft ready");
        }

        const row = await queueLeadForBatch({
          ctx,
          leadId,
          scheduledFor,
          bundle,
          outreach,
          emailConfig,
          sendWindow,
          batchId: params.batchId,
          batchIndex: nextSlotIdx,
          batchSize: leadIds.length,
        });
        result.ok += 1;
        result.results.push(row);
        nextSlotIdx += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Send failed";
        result.failed += 1;
        result.errors.push(`${leadId}: ${message}`);
        result.results.push({ leadId, ok: false, error: message });
      }
    }
  }

  return result;
}
