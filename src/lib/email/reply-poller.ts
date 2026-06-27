import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, leads, contacts, outreachSchedule, workspaceSettings } from "@/db";
import { and, eq } from "drizzle-orm";
import type { EmailConfig } from "@/lib/email/config";
import { resolveEmailConfig, resolveSmtpCredentials } from "@/lib/email/config";
import { processLeadReply } from "@/lib/email/process-reply";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;
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
  if (text) return text.slice(0, 8000);
  const htmlRaw = typeof parsed.html === "string" ? parsed.html : "";
  const html = htmlRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return html?.slice(0, 8000) ?? "";
}

async function loadOutreachedLeads(workspaceId: string): Promise<OutreachedLead[]> {
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
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.status, "outreached")));

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
  const nextConfig: EmailConfig = {
    ...config,
    lastReplyPollAt: new Date().toISOString(),
    processedReplyMessageIds: merged,
  };
  await db
    .update(workspaceSettings)
    .set({ emailConfig: nextConfig, updatedAt: new Date() })
    .where(eq(workspaceSettings.workspaceId, workspaceId));
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

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const config = resolveEmailConfig((settings?.emailConfig as Partial<EmailConfig> | undefined) ?? {});
  if (config.provider !== "smtp") {
    result.errors.push("Reply polling requires SMTP (Gmail) provider");
    return result;
  }

  const creds = resolveSmtpCredentials(config);
  if (!creds.user || !creds.pass) {
    result.errors.push("SMTP credentials not configured");
    return result;
  }

  const outreached = await loadOutreachedLeads(workspaceId);
  if (outreached.length === 0) return result;

  const emailToLead = new Map(outreached.map((l) => [l.contactEmail, l]));
  const processedIds = new Set(config.processedReplyMessageIds ?? []);
  const since = getPollSince();

  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });

  const newlyProcessedIds: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const message of client.fetch("1:*", { uid: true, envelope: true, source: true })) {
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
