import { extractEmailAddress } from "@/lib/email/email-address";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";

export type ReplyWatchLead = {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  emails: string[];
  firstSentAt: Date | null;
};

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
  }>,
): ReplyWatchLead[] {
  const byLead = new Map<string, ReplyWatchLead>();
  for (const row of rows) {
    const emails = collectWatchEmails({
      contactEmail: row.contactEmail,
      recipientEmail: row.recipientEmail,
      alternateEmails: row.alternateEmails,
    });
    const existing = byLead.get(row.leadId);
    const sentAt = row.firstSentAt ?? null;
    if (!existing) {
      byLead.set(row.leadId, {
        leadId: row.leadId,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        emails,
        firstSentAt: sentAt,
      });
      continue;
    }
    for (const email of emails) {
      if (!existing.emails.includes(email)) existing.emails.push(email);
    }
    if (sentAt && (!existing.firstSentAt || sentAt < existing.firstSentAt)) {
      existing.firstSentAt = sentAt;
    }
  }
  return [...byLead.values()].filter((lead) => lead.emails.length > 0);
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

export function replyContentFromBodies(text?: string | null, html?: string | null): string {
  const trimmed = text?.trim() || "";
  const htmlText =
    typeof html === "string" && html.trim()
      ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
  return extractLatestReplyText(trimmed || htmlText);
}
