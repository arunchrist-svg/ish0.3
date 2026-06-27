import { db, leads, yieldFunnel, outreachSchedule } from "@/db";
import { eq, and } from "drizzle-orm";
import { isPastReplyStage } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";

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

  await logAudit({
    tenantId: tenantId ?? lead.tenantId,
    workspaceId: workspaceId ?? lead.workspaceId,
    action: "lead.replied",
    entityType: "lead",
    entityId: leadId,
    metadata: { source, cancelledFollowUps: cancelled.length, hasReplyContent: !!replyContent, inboundMessageId },
  });

  if (replyContent) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3002}`;
    fetch(`${appUrl}/api/agents/writer/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    }).catch((e) => console.error("[process-reply] reply-writer trigger failed", e));
  }

  return { ok: true };
}
