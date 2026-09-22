import { db, leads, yieldFunnel, outreachSchedule } from "@/db";
import { eq, and } from "drizzle-orm";
import { isPastReplyStage, isReplyWatchStatus } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";
import { enqueueReplyOrchestrator } from "@/lib/jobs/enqueue";
import {
  INBOUND_AUTO_REPLY_EMAIL_KIND,
  INBOUND_REPLY_EMAIL_KIND,
} from "@/lib/email/inbound-match";
import { detectAutomatedReply } from "@/lib/email/detect-automated-reply";
import { isHumanReplyContent } from "@/lib/email/human-reply-filter";
import { revertFalseInboundReply } from "@/lib/email/revert-false-inbound";

export type InboundReplyClass = "human" | "auto";

export type ProcessReplyResult =
  | { ok: true; skipped?: false; replyClass: InboundReplyClass }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

function snippet(text: string | undefined, max = 280): string | null {
  if (!text?.trim()) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned;
}

export async function processLeadReply(params: {
  leadId: string;
  source?: string;
  replyContent?: string;
  inboundMessageId?: string;
  tenantId?: string;
  workspaceId?: string;
  /** Default human. Auto keeps the sequence running and skips notify/draft. */
  replyClass?: InboundReplyClass;
  autoReason?: string;
  subject?: string | null;
}): Promise<ProcessReplyResult> {
  const {
    leadId,
    source = "webhook",
    replyContent,
    inboundMessageId,
    tenantId,
    workspaceId,
    subject,
  } = params;

  let lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead not found" };

  const autoDetected = detectAutomatedReply({
    subject,
    text: replyContent ?? lead.lastReplyContent,
  });
  const replyClass: InboundReplyClass =
    autoDetected.automated ? "auto" : (params.replyClass ?? "human");
  const resolvedAutoReason = autoDetected.automated ? autoDetected.reason : params.autoReason;

  if (
    (lead.status === "replied" || isPastReplyStage(lead.status)) &&
    !isHumanReplyContent(replyContent ?? lead.lastReplyContent, subject)
  ) {
    await revertFalseInboundReply(leadId);
    lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead) return { ok: false, error: "Lead not found" };
  } else if (lead.status === "replied" || isPastReplyStage(lead.status)) {
    return { ok: true, skipped: true, reason: "already past reply stage" };
  }

  if (!isReplyWatchStatus(lead.status) && lead.status !== "outreached") {
    return { ok: true, skipped: true, reason: `lead status is ${lead.status}` };
  }

  const resolvedTenantId = tenantId ?? lead.tenantId;
  const resolvedWorkspaceId = workspaceId ?? lead.workspaceId;
  const bodySnippet = snippet(replyContent);

  if (replyClass === "auto") {
    if (inboundMessageId) {
      await db.insert(outreachSchedule).values({
        leadId,
        channel: "email",
        sequenceDay: -2,
        emailKind: INBOUND_AUTO_REPLY_EMAIL_KIND,
        rfcMessageId: inboundMessageId,
        subjectSent: subject?.trim() || "Automated reply",
        bodySnippet: bodySnippet,
        bounceReason: resolvedAutoReason ?? null,
        scheduledFor: new Date(),
        sentAt: new Date(),
        status: "sent",
      });
    }

    await logAudit({
      tenantId: resolvedTenantId,
      workspaceId: resolvedWorkspaceId,
      action: "lead.auto_replied",
      entityType: "lead",
      entityId: leadId,
      metadata: {
        source,
        autoReason: resolvedAutoReason ?? null,
        hasReplyContent: !!replyContent,
        inboundMessageId,
      },
    });

    return { ok: true, replyClass: "auto" };
  }

  await db
    .update(leads)
    .set({
      status: "replied",
      ...(replyContent ? { lastReplyContent: replyContent } : {}),
      ...(inboundMessageId ? { lastInboundMessageId: inboundMessageId } : {}),
    })
    .where(eq(leads.id, leadId));

  await db.insert(yieldFunnel).values({
    leadId,
    stage: "replied",
    metadata: {
      source,
      hasReplyContent: !!replyContent,
      inboundMessageId: inboundMessageId ?? null,
      replyClass: "human",
    },
  });

  if (inboundMessageId) {
    await db.insert(outreachSchedule).values({
      leadId,
      channel: "email",
      sequenceDay: -2,
      emailKind: INBOUND_REPLY_EMAIL_KIND,
      rfcMessageId: inboundMessageId,
      subjectSent: subject?.trim() || null,
      bodySnippet: bodySnippet,
      scheduledFor: new Date(),
      sentAt: new Date(),
      status: "sent",
    });
  }

  const cancelled = await db
    .update(outreachSchedule)
    .set({ status: "cancelled" })
    .where(and(eq(outreachSchedule.leadId, leadId), eq(outreachSchedule.status, "scheduled")))
    .returning({ id: outreachSchedule.id });

  await logAudit({
    tenantId: resolvedTenantId,
    workspaceId: resolvedWorkspaceId,
    action: "lead.replied",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      source,
      cancelledFollowUps: cancelled.length,
      hasReplyContent: !!replyContent,
      inboundMessageId,
      replyClass: "human",
    },
  });

  if (replyContent) {
    await enqueueReplyOrchestrator({
      leadId,
      tenantId: resolvedTenantId,
      workspaceId: resolvedWorkspaceId,
    });
  }

  return { ok: true, replyClass: "human" };
}
