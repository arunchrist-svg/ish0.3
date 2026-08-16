import { db, leads, contacts, outreachSchedule } from "@/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { processLeadReply } from "@/lib/email/process-reply";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { isInboundLikeEvent, type ResendWebhookEvent } from "@/lib/email/resend-webhook";
import { REPLY_WATCH_STATUSES } from "@/lib/pipeline-status";

function normalizeEmail(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

function firstFrom(from?: string): string | undefined {
  if (!from?.trim()) return undefined;
  const normalized = normalizeEmail(from);
  return normalized.includes("@") ? normalized : undefined;
}

export async function processResendInboundEvent(event: ResendWebhookEvent): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  leadId?: string;
}> {
  if (!isInboundLikeEvent(event.type)) {
    return { ok: true, skipped: true, reason: "ignored_event" };
  }

  const from = firstFrom(event.data?.from);
  if (!from) return { ok: true, skipped: true, reason: "missing_from" };

  const text = event.data?.text?.trim() || "";
  const html = typeof event.data?.html === "string" ? event.data.html.replace(/<[^>]+>/g, " ") : "";
  const replyContent = extractLatestReplyText(text || html.replace(/\s+/g, " ").trim());
  const inboundMessageId = event.data?.email_id?.trim() || undefined;

  const matches = await db
    .select({
      leadId: leads.id,
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
      status: leads.status,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        inArray(leads.status, [...REPLY_WATCH_STATUSES]),
        or(
          sql`lower(${contacts.email}) = ${from}`,
          sql`lower(${outreachSchedule.recipientEmail}) = ${from}`,
        ),
      ),
    )
    .orderBy(desc(outreachSchedule.sentAt))
    .limit(5);

  const lead = matches[0];
  if (!lead) return { ok: true, skipped: true, reason: "lead_not_found" };

  const result = await processLeadReply({
    leadId: lead.leadId,
    source: "resend_inbound",
    replyContent: replyContent || undefined,
    inboundMessageId,
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
  });

  if (!result.ok) return { ok: true, skipped: true, reason: result.error };
  if (result.skipped) return { ok: true, skipped: true, reason: result.reason, leadId: lead.leadId };
  return { ok: true, leadId: lead.leadId };
}
