import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, leads, contacts, outreachSchedule, workspaceSettings } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import type { EmailConfig } from "@/lib/email/config";
import { imapHostForSmtp, resolveSmtpCredentials } from "@/lib/email/config";
import { processLeadReply } from "@/lib/email/process-reply";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { REPLY_WATCH_STATUSES } from "@/lib/pipeline-status";
import { getResolvedEmailConfig, persistEmailConfig } from "@/lib/settings/email-settings";

const MAX_PROCESSED_IDS = 200;
const LOOKBACK_DAYS = 14;

type OutreachedLead = {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  contactEmail: string;
  firstSentAt: Date | null;
};

export type ReplyPollResult = {
  workspaceId: string;
  checked: number;
  matched: number;
  processed: number;
  skipped: number;
  errors: string[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function extractReplyBody(parsed: Awaited<ReturnType<typeof simpleParser>>): string {
  const text = parsed.text?.trim();
  if (text) return extractLatestReplyText(text);
  const htmlRaw = typeof parsed.html === "string" ? parsed.html : "";
  const html = htmlRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return extractLatestReplyText(html);
}

async function loadReplyWatchLeads(workspaceId: string): Promise<OutreachedLead[]> {
  const rows = await db
    .select({
      leadId: leads.id,
      tenantId: leads.tenantId,
      workspaceId: leads.workspaceId,
      contactEmail: contacts.email,
      firstSentAt: outreachSchedule.sentAt,
    })
    .from(leads)
    .innerJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(
      outreachSchedule,
      and(eq(outreachSchedule.leadId, leads.id), eq(outreachSchedule.status, "sent")),
    )
    .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.status, [...REPLY_WATCH_STATUSES])));

  const byLead = new Map<string, OutreachedLead>();
  for (const row of rows) {
    if (!row.contactEmail) continue;
    const existing = byLead.get(row.leadId);
    const sentAt = row.firstSentAt ?? null;
    if (!existing) {
      byLead.set(row.leadId, {
        leadId: row.leadId,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        contactEmail: normalizeEmail(row.contactEmail),
        firstSentAt: sentAt,
      });
      continue;
    }
    if (sentAt && (!existing.firstSentAt || sentAt < existing.firstSentAt)) {
      existing.firstSentAt = sentAt;
    }
  }
  return [...byLead.values()];
}

function getPollSince(): Date {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

async function persistPollState(workspaceId: string, config: EmailConfig, processedIds: string[]) {
  const merged = [...new Set([...(config.processedReplyMessageIds ?? []), ...processedIds])].slice(-MAX_PROCESSED_IDS);
  await persistEmailConfig(
    {
      ...config,
      lastReplyPollAt: new Date().toISOString(),
      processedReplyMessageIds: merged,
    },
    workspaceId,
  );
}

export async function pollRepliesForWorkspace(workspaceId: string): Promise<ReplyPollResult> {
  const result: ReplyPollResult = {
    workspaceId,
    checked: 0,
    matched: 0,
    processed: 0,
    skipped: 0,
    errors: [],
  };

  const config = await getResolvedEmailConfig(workspaceId);
  if (config.provider !== "smtp") {
    return result;
  }

  const creds = resolveSmtpCredentials(config);
  if (!creds.user || !creds.pass) {
    result.errors.push("SMTP credentials not configured");
    return result;
  }

  const watchLeads = await loadReplyWatchLeads(workspaceId);
  if (watchLeads.length === 0) return result;

  const emailToLead = new Map(watchLeads.map((l) => [l.contactEmail, l]));
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
        const fromAddresses = (message.envelope?.from ?? [])
          .map((addr) => (addr.address ? normalizeEmail(addr.address) : ""))
          .filter(Boolean);
        if (fromAddresses.length === 0) continue;

        const messageId = message.envelope?.messageId ?? `uid:${message.uid}`;
        if (processedIds.has(messageId)) {
          result.skipped++;
          continue;
        }

        const lead = fromAddresses.map((addr) => emailToLead.get(addr)).find(Boolean);
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

        const processed = await processLeadReply({
          leadId: lead.leadId,
          source: "imap_poll",
          replyContent: replyContent || undefined,
          inboundMessageId: messageId,
          tenantId: lead.tenantId,
          workspaceId: lead.workspaceId,
        });

        newlyProcessedIds.push(messageId);
        if (processed.ok && !processed.skipped) {
          result.processed++;
          emailToLead.delete(lead.contactEmail);
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

export async function pollRepliesForAllWorkspaces(): Promise<ReplyPollResult[]> {
  const rows = await db.select({ workspaceId: workspaceSettings.workspaceId }).from(workspaceSettings);
  const results: ReplyPollResult[] = [];
  for (const row of rows) {
    results.push(await pollRepliesForWorkspace(row.workspaceId));
  }
  return results;
}
