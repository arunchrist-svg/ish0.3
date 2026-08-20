import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, leads, contacts, outreachSchedule, workspaceSettings } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import type { EmailConfig, EmailProvider } from "@/lib/email/config";
import { imapHostForSmtp, resolveSmtpCredentials } from "@/lib/email/config";
import {
  findWatchLeadForFrom,
  indexWatchLeadsByEmail,
  mergeWatchLeadRows,
  replyContentFromBodies,
  type ReplyWatchLead,
} from "@/lib/email/inbound-match";
import { processLeadReply } from "@/lib/email/process-reply";
import { getReceivedEmail, listReceivedEmails } from "@/lib/email/resend-receiving";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { REPLY_WATCH_STATUSES } from "@/lib/pipeline-status";
import { getResolvedEmailConfig, persistEmailConfig } from "@/lib/settings/email-settings";

const MAX_PROCESSED_IDS = 200;
const LOOKBACK_DAYS = 14;
const RESEND_LIST_LIMIT = 100;
const RESEND_MAX_PAGES = 5;

export type ReplyPollResult = {
  workspaceId: string;
  provider?: EmailProvider;
  checked: number;
  matched: number;
  processed: number;
  skipped: number;
  errors: string[];
};

function emptyResult(workspaceId: string, provider?: EmailProvider): ReplyPollResult {
  return {
    workspaceId,
    provider,
    checked: 0,
    matched: 0,
    processed: 0,
    skipped: 0,
    errors: [],
  };
}

function extractReplyBody(parsed: Awaited<ReturnType<typeof simpleParser>>): string {
  const text = parsed.text?.trim();
  if (text) return extractLatestReplyText(text);
  const htmlRaw = typeof parsed.html === "string" ? parsed.html : "";
  const html = htmlRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return extractLatestReplyText(html);
}

async function loadReplyWatchLeads(workspaceId: string): Promise<ReplyWatchLead[]> {
  const rows = await db
    .select({
      leadId: leads.id,
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
      contactEmail: contacts.email,
      alternateEmails: contacts.alternateEmails,
      recipientEmail: outreachSchedule.recipientEmail,
      firstSentAt: outreachSchedule.sentAt,
    })
    .from(leads)
    .innerJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(
      outreachSchedule,
      and(eq(outreachSchedule.leadId, leads.id), eq(outreachSchedule.status, "sent")),
    )
    .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.status, [...REPLY_WATCH_STATUSES])));

  return mergeWatchLeadRows(rows);
}

function getPollSince(): Date {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

async function persistPollState(workspaceId: string, config: EmailConfig, processedIds: string[]) {
  const merged = [...new Set([...(config.processedReplyMessageIds ?? []), ...processedIds])].slice(
    -MAX_PROCESSED_IDS,
  );
  await persistEmailConfig(
    {
      ...config,
      lastReplyPollAt: new Date().toISOString(),
      processedReplyMessageIds: merged,
    },
    workspaceId,
  );
}

function forgetLead(emailToLead: Map<string, ReplyWatchLead>, lead: ReplyWatchLead) {
  for (const email of lead.emails) {
    if (emailToLead.get(email) === lead) emailToLead.delete(email);
  }
}

async function markProcessedReply(params: {
  lead: ReplyWatchLead;
  source: string;
  replyContent?: string;
  inboundMessageId: string;
}): Promise<boolean> {
  const processed = await processLeadReply({
    leadId: params.lead.leadId,
    source: params.source,
    replyContent: params.replyContent || undefined,
    inboundMessageId: params.inboundMessageId,
    tenantId: params.lead.tenantId,
    workspaceId: params.lead.workspaceId,
  });
  return processed.ok && !processed.skipped;
}

async function pollImapReplies(
  workspaceId: string,
  config: EmailConfig,
  result: ReplyPollResult,
): Promise<ReplyPollResult> {
  const creds = resolveSmtpCredentials(config);
  if (!creds.user || !creds.pass) {
    result.errors.push("SMTP credentials not configured");
    return result;
  }

  const watchLeads = await loadReplyWatchLeads(workspaceId);
  if (watchLeads.length === 0) return result;

  const emailToLead = indexWatchLeadsByEmail(watchLeads);
  const processedIds = new Set(config.processedReplyMessageIds ?? []);
  const since = getPollSince();

  const imap = imapHostForSmtp(creds.host);
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });

  const newlyProcessedIds: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];
      if (uidList.length === 0) {
        return result;
      }
      for await (const message of client.fetch(uidList, { uid: true, envelope: true, source: true }, { uid: true })) {
        const messageDate = message.envelope?.date ?? new Date();
        if (messageDate < since) continue;
        result.checked++;
        const fromAddresses = (message.envelope?.from ?? []).map((addr) => addr.address).filter(Boolean);
        if (fromAddresses.length === 0) continue;

        const messageId = message.envelope?.messageId ?? `uid:${message.uid}`;
        if (processedIds.has(messageId)) {
          result.skipped++;
          continue;
        }

        const lead = findWatchLeadForFrom(fromAddresses, emailToLead);
        if (!lead) continue;

        if (lead.firstSentAt && messageDate < lead.firstSentAt) {
          newlyProcessedIds.push(messageId);
          result.skipped++;
          continue;
        }

        result.matched++;
        let replyContent = "";
        if (message.source) {
          try {
            const parsed = await simpleParser(message.source);
            replyContent = extractReplyBody(parsed);
          } catch (e) {
            console.error("[reply-poller] parse failed", e);
          }
        }

        newlyProcessedIds.push(messageId);
        const applied = await markProcessedReply({
          lead,
          source: "imap_poll",
          replyContent,
          inboundMessageId: messageId,
        });
        if (applied) {
          result.processed++;
          forgetLead(emailToLead, lead);
        } else {
          result.skipped++;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`IMAP error: ${msg}`);
    console.error("[reply-poller]", workspaceId, e);
  }

  await persistPollState(workspaceId, config, newlyProcessedIds);
  return result;
}

async function pollResendReplies(
  workspaceId: string,
  config: EmailConfig,
  result: ReplyPollResult,
): Promise<ReplyPollResult> {
  const apiKey = config.resendApiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    result.errors.push("Resend API key not configured");
    return result;
  }

  const watchLeads = await loadReplyWatchLeads(workspaceId);
  if (watchLeads.length === 0) return result;

  const emailToLead = indexWatchLeadsByEmail(watchLeads);
  const processedIds = new Set(config.processedReplyMessageIds ?? []);
  const since = getPollSince();
  const newlyProcessedIds: string[] = [];

  try {
    let after: string | undefined;
    for (let page = 0; page < RESEND_MAX_PAGES; page++) {
      const { data, hasMore } = await listReceivedEmails(apiKey, { limit: RESEND_LIST_LIMIT, after });
      if (data.length === 0) break;

      let sawRecent = false;
      for (const item of data) {
        const messageDate = item.created_at ? new Date(item.created_at) : new Date();
        if (Number.isFinite(messageDate.getTime()) && messageDate >= since) sawRecent = true;
        if (Number.isFinite(messageDate.getTime()) && messageDate < since) continue;

        result.checked++;
        const inboundId = item.id?.trim();
        if (!inboundId) continue;
        if (processedIds.has(inboundId) || (item.message_id && processedIds.has(item.message_id))) {
          result.skipped++;
          continue;
        }

        const lead = findWatchLeadForFrom([item.from], emailToLead);
        if (!lead) continue;

        if (lead.firstSentAt && messageDate < lead.firstSentAt) {
          newlyProcessedIds.push(inboundId);
          processedIds.add(inboundId);
          result.skipped++;
          continue;
        }

        result.matched++;
        let replyContent = "";
        try {
          const detail = await getReceivedEmail(inboundId, apiKey);
          replyContent = replyContentFromBodies(detail?.text, detail?.html);
        } catch (e) {
          console.error("[reply-poller] resend receiving get failed", inboundId, e);
        }

        newlyProcessedIds.push(inboundId);
        processedIds.add(inboundId);
        if (item.message_id) {
          newlyProcessedIds.push(item.message_id);
          processedIds.add(item.message_id);
        }

        const applied = await markProcessedReply({
          lead,
          source: "resend_poll",
          replyContent,
          inboundMessageId: inboundId,
        });
        if (applied) {
          result.processed++;
          forgetLead(emailToLead, lead);
        } else {
          result.skipped++;
        }
      }

      if (!hasMore || !sawRecent) break;
      after = data[data.length - 1]?.id;
      if (!after) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Resend receiving error: ${msg}`);
    console.error("[reply-poller] resend", workspaceId, e);
  }

  await persistPollState(workspaceId, config, newlyProcessedIds);
  return result;
}

export async function pollRepliesForWorkspace(workspaceId: string): Promise<ReplyPollResult> {
  const config = await getResolvedEmailConfig(workspaceId);
  const result = emptyResult(workspaceId, config.provider);

  if (config.provider === "resend") {
    return pollResendReplies(workspaceId, config, result);
  }

  if (config.provider !== "smtp") {
    return result;
  }

  return pollImapReplies(workspaceId, config, result);
}

export async function pollRepliesForAllWorkspaces(): Promise<ReplyPollResult[]> {
  const rows = await db.select({ workspaceId: workspaceSettings.workspaceId }).from(workspaceSettings);
  const results: ReplyPollResult[] = [];
  for (const row of rows) {
    results.push(await pollRepliesForWorkspace(row.workspaceId));
  }
  return results;
}
