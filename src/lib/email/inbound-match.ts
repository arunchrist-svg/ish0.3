import { extractEmailAddress } from "@/lib/email/email-address";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { normalizeRfcMessageId } from "@/lib/email/threading";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";

export const INBOUND_REPLY_EMAIL_KIND = "inbound_reply";
export const INBOUND_AUTO_REPLY_EMAIL_KIND = "inbound_auto_reply";

export function isInboundEmailKind(emailKind?: string | null): boolean {
  return emailKind === INBOUND_REPLY_EMAIL_KIND || emailKind === INBOUND_AUTO_REPLY_EMAIL_KIND;
}

export type ReplyWatchLead = {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  emails: string[];
  firstSentAt: Date | null;
  /** Normalized RFC Message-IDs from campaign sends we made (not inbound). */
  campaignMessageIds: string[];
};

function addCampaignMessageId(ids: Set<string>, raw?: string | null, emailKind?: string | null) {
  if (isInboundEmailKind(emailKind)) return;
  const id = normalizeRfcMessageId(raw);
  if (id) ids.add(id);
}

function addWatchEmail(emails: Set<string>, raw?: string | null) {
  const normalized = extractEmailAddress(raw);
  if (normalized) emails.add(normalized);
}

export function collectWatchEmails(params: {
  contactEmail?: string | null;
  recipientEmail?: string | null;
  alternateEmails?: ContactEmailEntry[] | unknown;
}): string[] {
  const emails = new Set<string>();
  addWatchEmail(emails, params.contactEmail);
  addWatchEmail(emails, params.recipientEmail);
  const alternates = Array.isArray(params.alternateEmails) ? params.alternateEmails : [];
  for (const entry of alternates) {
    if (typeof entry === "string") {
      addWatchEmail(emails, entry);
      continue;
    }
    if (entry && typeof entry === "object" && "email" in entry) {
      addWatchEmail(emails, (entry as { email?: string | null }).email);
    }
  }
  return [...emails];
}

export function mergeWatchLeadRows(
  rows: Array<{
    leadId: string;
    tenantId: string;
    workspaceId: string;
    contactEmail?: string | null;
    recipientEmail?: string | null;
    alternateEmails?: unknown;
    firstSentAt?: Date | null;
    rfcMessageId?: string | null;
    emailKind?: string | null;
    threadRootMessageId?: string | null;
  }>,
): ReplyWatchLead[] {
  const byLead = new Map<string, ReplyWatchLead>();
  for (const row of rows) {
    const emails = collectWatchEmails({
      contactEmail: row.contactEmail,
      recipientEmail: row.recipientEmail,
      alternateEmails: row.alternateEmails,
    });
    const campaignIds = new Set<string>();
    addCampaignMessageId(campaignIds, row.rfcMessageId, row.emailKind);
    addCampaignMessageId(campaignIds, row.threadRootMessageId, null);
    const existing = byLead.get(row.leadId);
    const sentAt = row.firstSentAt ?? null;
    if (!existing) {
      byLead.set(row.leadId, {
        leadId: row.leadId,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        emails,
        firstSentAt: sentAt,
        campaignMessageIds: [...campaignIds],
      });
      continue;
    }
    for (const email of emails) {
      if (!existing.emails.includes(email)) existing.emails.push(email);
    }
    for (const id of campaignIds) {
      if (!existing.campaignMessageIds.includes(id)) existing.campaignMessageIds.push(id);
    }
    if (sentAt && (!existing.firstSentAt || sentAt < existing.firstSentAt)) {
      existing.firstSentAt = sentAt;
    }
  }
  return [...byLead.values()].filter((lead) => lead.emails.length > 0 || lead.campaignMessageIds.length > 0);
}

export function indexWatchLeadsByEmail(leads: ReplyWatchLead[]): Map<string, ReplyWatchLead> {
  const map = new Map<string, ReplyWatchLead>();
  for (const lead of leads) {
    for (const email of lead.emails) {
      if (!map.has(email)) map.set(email, lead);
    }
  }
  return map;
}

export function findWatchLeadForFrom(
  fromAddresses: Array<string | null | undefined>,
  index: Map<string, ReplyWatchLead>,
): ReplyWatchLead | undefined {
  for (const raw of fromAddresses) {
    const email = extractEmailAddress(raw);
    if (!email) continue;
    const lead = index.get(email);
    if (lead) return lead;
  }
  return undefined;
}

export function indexWatchLeadsByCampaignMessageId(leads: ReplyWatchLead[]): Map<string, ReplyWatchLead> {
  const map = new Map<string, ReplyWatchLead>();
  for (const lead of leads) {
    for (const id of lead.campaignMessageIds) {
      if (!map.has(id)) map.set(id, lead);
    }
  }
  return map;
}

export function findWatchLeadForCampaignThread(
  referencedIds: Array<string | null | undefined>,
  index: Map<string, ReplyWatchLead>,
): ReplyWatchLead | undefined {
  for (const raw of referencedIds) {
    const id = normalizeRfcMessageId(raw);
    if (!id) continue;
    const lead = index.get(id);
    if (lead) return lead;
  }
  return undefined;
}

/**
 * Attach only when In-Reply-To / References hits a campaign send we made.
 * If From belongs to a different watched lead, do not jump threads.
 */
export function resolveCampaignReplyLead(params: {
  fromAddresses: Array<string | null | undefined>;
  referencedIds: Array<string | null | undefined>;
  byMessageId: Map<string, ReplyWatchLead>;
  byEmail: Map<string, ReplyWatchLead>;
}): ReplyWatchLead | undefined {
  const threadLead = findWatchLeadForCampaignThread(params.referencedIds, params.byMessageId);
  if (!threadLead) return undefined;
  const fromLead = findWatchLeadForFrom(params.fromAddresses, params.byEmail);
  if (fromLead && fromLead.leadId !== threadLead.leadId) return undefined;
  return threadLead;
}

export function replyContentFromBodies(text?: string | null, html?: string | null): string {
  const trimmed = text?.trim() || "";
  const htmlText =
    typeof html === "string" && html.trim()
      ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
  return extractLatestReplyText(trimmed || htmlText);
}
