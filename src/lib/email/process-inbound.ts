import { db, leads, contacts, outreachSchedule } from "@/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { extractEmailAddress } from "@/lib/email/email-address";
import { replyContentFromBodies } from "@/lib/email/inbound-match";
import { processLeadReply } from "@/lib/email/process-reply";
import { getReceivedEmail } from "@/lib/email/resend-receiving";
import { isInboundLikeEvent, type ResendWebhookEvent } from "@/lib/email/resend-webhook";
import { REPLY_WATCH_STATUSES } from "@/lib/pipeline-status";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";

export function inboundFromMatchSql(from: string) {
  return or(
    sql`lower(${contacts.email}) = ${from}`,
    sql`lower(${outreachSchedule.recipientEmail}) = ${from}`,
    sql`exists (
      select 1
      from jsonb_array_elements(coalesce(${contacts.alternateEmails}, '[]'::jsonb)) as alt
      where lower(alt->>'email') = ${from}
    )`,
  );
}

async function replyContentForInboundEvent(
  event: ResendWebhookEvent,
  workspaceId: string,
): Promise<string> {
  const fromPayload = replyContentFromBodies(event.data?.text, event.data?.html);
  if (fromPayload) return fromPayload;

  const emailId = event.data?.email_id?.trim();
  if (!emailId) return "";

  let apiKey: string | undefined;
  try {
    apiKey = (await getResolvedEmailConfig(workspaceId)).resendApiKey;
  } catch (e) {
    console.error("[process-inbound] email config lookup failed", e);
  }

  try {
    const detail = await getReceivedEmail(emailId, apiKey);
    return replyContentFromBodies(detail?.text, detail?.html);
  } catch (e) {
    console.error("[process-inbound] fetch received email failed", e);
    return "";
  }
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

  const from = extractEmailAddress(event.data?.from);
  if (!from) return { ok: true, skipped: true, reason: "missing_from" };

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
    .where(and(inArray(leads.status, [...REPLY_WATCH_STATUSES]), inboundFromMatchSql(from)))
    .orderBy(desc(outreachSchedule.sentAt))
    .limit(5);

  const lead = matches[0];
  if (!lead) return { ok: true, skipped: true, reason: "lead_not_found" };

  const replyContent = await replyContentForInboundEvent(event, lead.workspaceId);

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
