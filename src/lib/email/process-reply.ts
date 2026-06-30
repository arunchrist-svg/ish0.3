import { db, leads, yieldFunnel, outreachSchedule } from "@/db";
import { eq, and } from "drizzle-orm";
import { isPastReplyStage } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";
import { enqueueReplyOrchestrator } from "@/lib/jobs/enqueue";

export type ProcessReplyResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export async function processLeadReply(params: {
  leadId: string;
  source?: string;
  replyContent?: string;
  inboundMessageId?: string;
  tenantId?: string;
  workspaceId?: string;
}): Promise<ProcessReplyResult> {
  const { leadId, source = "webhook", replyContent, inboundMessageId, tenantId, workspaceId } = params;

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead not found" };

  if (isPastReplyStage(lead.status)) {
    return { ok: true, skipped: true, reason: "already past reply stage" };
  }

  if (lead.status !== "outreached") {
    return { ok: true, skipped: true, reason: `lead status is ${lead.status}` };
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
    metadata: { source, hasReplyContent: !!replyContent, inboundMessageId: inboundMessageId ?? null },
  });

  if (inboundMessageId) {
    await db.insert(outreachSchedule).values({
      leadId,
      channel: "email",
      sequenceDay: -2,
      emailKind: "inbound_reply",
      rfcMessageId: inboundMessageId,
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

  const resolvedTenantId = tenantId ?? lead.tenantId;
  const resolvedWorkspaceId = workspaceId ?? lead.workspaceId;

  await logAudit({
    tenantId: resolvedTenantId,
    workspaceId: resolvedWorkspaceId,
    action: "lead.replied",
    entityType: "lead",
    entityId: leadId,
    metadata: { source, cancelledFollowUps: cancelled.length, hasReplyContent: !!replyContent, inboundMessageId },
  });

  if (replyContent) {
    await enqueueReplyOrchestrator({
      leadId,
      tenantId: resolvedTenantId,
      workspaceId: resolvedWorkspaceId,
    });
  }

  return { ok: true };
}
