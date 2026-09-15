import { db, leads, contacts, outreachSchedule } from "@/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { extractEmailAddress } from "@/lib/email/email-address";
import { detectAutomatedReply } from "@/lib/email/detect-automated-reply";
import {
  INBOUND_AUTO_REPLY_EMAIL_KIND,
  INBOUND_REPLY_EMAIL_KIND,
  indexWatchLeadsByCampaignMessageId,
  indexWatchLeadsByEmail,
  mergeWatchLeadRows,
  replyContentFromBodies,
  resolveCampaignReplyLead,
  type ReplyWatchLead,
} from "@/lib/email/inbound-match";
import { processLeadReply } from "@/lib/email/process-reply";
import { getReceivedEmail, type ReceivedEmailDetail } from "@/lib/email/resend-receiving";
import { isInboundLikeEvent, type ResendWebhookEvent } from "@/lib/email/resend-webhook";
import { referencedIdsFromInboundPayload } from "@/lib/email/threading";
import { REPLY_WATCH_STATUSES } from "@/lib/pipeline-status";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";

const watchSelect = {
  leadId: leads.id,
  tenantId: leads.tenantId,
  workspaceId: leads.workspaceId,
  status: leads.status,
  contactEmail: contacts.email,
  alternateEmails: contacts.alternateEmails,
  recipientEmail: outreachSchedule.recipientEmail,
  firstSentAt: outreachSchedule.sentAt,
  rfcMessageId: outreachSchedule.rfcMessageId,
  emailKind: outreachSchedule.emailKind,
  threadRootMessageId: leads.threadRootMessageId,
};

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

async function loadWatchRowsByFrom(from: string) {
  return db
    .select(watchSelect)
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
    .where(and(inArray(leads.status, [...REPLY_WATCH_STATUSES]), inboundFromMatchSql(from)))
    .orderBy(desc(outreachSchedule.sentAt))
    .limit(20);
}

async function loadWatchRowsByReferencedIds(ids: string[]) {
  if (ids.length === 0) return [];
  const idMatch = or(
    ...ids.map((id) =>
      or(
        sql`lower(trim(both '<>' from coalesce(${outreachSchedule.rfcMessageId}, ''))) = ${id}`,
        sql`lower(trim(both '<>' from coalesce(${leads.threadRootMessageId}, ''))) = ${id}`,
      ),
    ),
  );
  return db
    .select(watchSelect)
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(outreachSchedule, eq(outreachSchedule.leadId, leads.id))
    .where(
      and(
        inArray(leads.status, [...REPLY_WATCH_STATUSES]),
        eq(outreachSchedule.status, "sent"),
        sql`coalesce(${outreachSchedule.emailKind}, '') not in (${INBOUND_REPLY_EMAIL_KIND}, ${INBOUND_AUTO_REPLY_EMAIL_KIND})`,
        idMatch,
      ),
    )
    .limit(20);
}

async function fetchReceivedDetail(
  emailId: string | undefined,
  workspaceId?: string,
): Promise<ReceivedEmailDetail | null> {
  if (!emailId) return null;
  let apiKey: string | undefined;
  if (workspaceId) {
    try {
      apiKey = (await getResolvedEmailConfig(workspaceId)).resendApiKey;
    } catch (e) {
      console.error("[process-inbound] email config lookup failed", e);
    }
  }
  try {
    return await getReceivedEmail(emailId, apiKey);
  } catch (e) {
    console.error("[process-inbound] fetch received email failed", e);
    return null;
  }
}

function resolveFromRows(
  rows: Array<Parameters<typeof mergeWatchLeadRows>[0][number]>,
  from: string | undefined,
  referencedIds: string[],
): ReplyWatchLead | undefined {
  const watchLeads = mergeWatchLeadRows(rows);
  return resolveCampaignReplyLead({
    fromAddresses: from ? [from] : [],
    referencedIds,
    byMessageId: indexWatchLeadsByCampaignMessageId(watchLeads),
    byEmail: indexWatchLeadsByEmail(watchLeads),
  });
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
  const fromRows = await loadWatchRowsByFrom(from);

  let referencedIds = referencedIdsFromInboundPayload({
    inReplyTo: event.data?.in_reply_to,
    references: event.data?.references,
    headers: event.data?.headers,
  });
  let detail: ReceivedEmailDetail | null = null;
  if (referencedIds.length === 0 && inboundMessageId && fromRows.length > 0) {
    detail = await fetchReceivedDetail(inboundMessageId, fromRows[0]?.workspaceId);
    referencedIds = referencedIdsFromInboundPayload({
      inReplyTo: detail?.in_reply_to,
      references: detail?.references,
      headers: detail?.headers,
    });
  }

  let lead = resolveFromRows(fromRows, from, referencedIds);
  if (!lead && referencedIds.length > 0) {
    const threadRows = await loadWatchRowsByReferencedIds(referencedIds);
    lead = resolveFromRows([...fromRows, ...threadRows], from, referencedIds);
  }

  if (!lead) {
    if (fromRows.length === 0 && referencedIds.length === 0) {
      return { ok: true, skipped: true, reason: "lead_not_found" };
    }
    return { ok: true, skipped: true, reason: "not_campaign_thread" };
  }

  let replyContent = replyContentFromBodies(event.data?.text, event.data?.html);
  if (!replyContent) {
    if (!detail) detail = await fetchReceivedDetail(inboundMessageId, lead.workspaceId);
    replyContent = replyContentFromBodies(detail?.text, detail?.html);
  }

  const subject = event.data?.subject ?? detail?.subject ?? null;
  const auto = detectAutomatedReply({
    subject,
    text: replyContent,
    headers: detail?.headers ?? event.data?.headers,
  });

  const result = await processLeadReply({
    leadId: lead.leadId,
    source: "resend_inbound",
    replyContent: replyContent || undefined,
    inboundMessageId,
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
    replyClass: auto.automated ? "auto" : "human",
    autoReason: auto.reason,
    subject,
  });

  if (!result.ok) return { ok: true, skipped: true, reason: result.error };
  if (result.skipped) return { ok: true, skipped: true, reason: result.reason, leadId: lead.leadId };
  return { ok: true, leadId: lead.leadId };
}
