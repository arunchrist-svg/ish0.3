import {
  buildContactEmails,
  hasUsableEmail,
  isRejectedEmailEntry,
  parsePatternFromEnrichmentSource,
  refreshPermutationEmails,
  type ContactEmailEntry,
} from "@/lib/enrichment/contact-emails";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";

const WEAK_PERMUTATION_PATTERNS = new Set(["first", "last"]);
const PLACEHOLDER_LOCAL_PARTS = new Set([
  "firstname",
  "lastname",
  "first",
  "last",
  "name",
  "user",
  "email",
  "info",
  "admin",
  "test",
]);

type SendContact = {
  email?: string | null;
  emailStatus?: string | null;
  emailConfidence?: number | null;
  enrichmentSource?: string | null;
  enrichmentProvider?: string | null;
  alternateEmails?: ContactEmailEntry[] | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

export type SendRecipientIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  companyName?: string | null;
};

export function listedContactEmails(
  contact: SendContact,
  identity?: SendRecipientIdentity,
): ContactEmailEntry[] {
  const preservePrimary =
    contact.enrichmentProvider === "manual" || contact.enrichmentSource === "manual";
  const refreshed = identity
    ? refreshPermutationEmails({
        firstName: identity.firstName ?? contact.firstName,
        lastName: identity.lastName ?? contact.lastName,
        name: identity.name ?? contact.name,
        domain: identity.domain,
        website: identity.website,
        companyName: identity.companyName,
        primaryEmail: contact.email,
        emailStatus: contact.emailStatus,
        enrichmentProvider: contact.enrichmentProvider,
        enrichmentSource: contact.enrichmentSource,
        alternateEmails: contact.alternateEmails ?? [],
        preservePrimary,
      })
    : null;

  return buildContactEmails({
    primaryEmail: refreshed?.email ?? contact.email,
    emailStatus: refreshed?.emailStatus ?? contact.emailStatus,
    emailConfidence: contact.emailConfidence,
    enrichmentSource: refreshed?.enrichmentSource ?? contact.enrichmentSource,
    enrichmentProvider: refreshed?.enrichmentProvider ?? contact.enrichmentProvider,
    alternateEmails: refreshed?.alternateEmails ?? contact.alternateEmails ?? [],
  });
}

function displayByLower(entries: ContactEmailEntry[]): Map<string, string> {
  return new Map(entries.map((e) => [e.email.trim().toLowerCase(), e.email.trim()]));
}

function isSendableStoredEmail(entry: ContactEmailEntry): boolean {
  const email = entry.email?.trim();
  if (!email || email === "—" || !email.includes("@")) return false;
  return !isRejectedEmailEntry(entry);
}

/** firstname@domain / lastname@domain guesses, plus placeholder local parts like firstname@. */
export function isWeakGuessEmail(entry: {
  email?: string | null;
  pattern?: string | null;
  enrichmentProvider?: string | null;
  enrichmentSource?: string | null;
}): boolean {
  const pattern = entry.pattern ?? parsePatternFromEnrichmentSource(entry.enrichmentSource);
  if (pattern && WEAK_PERMUTATION_PATTERNS.has(pattern)) return true;
  const local = entry.email?.split("@")[0]?.trim().toLowerCase() ?? "";
  return PLACEHOLDER_LOCAL_PARTS.has(local);
}

export const EMPTY_SEND_TO_HINT =
  "To is empty. Pick an inbox from Send to, or add one. firstname@ and lastname@ guesses are not sent until you select them.";

export const REPLY_EMPTY_SEND_TO_HINT =
  "This reply needs a To address. Add the contact's email, then send.";

export const SELECT_NEW_SEND_TO_HINT = "Select a new email address to send to";

function isUsableRecipientAddress(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return Boolean(key) && key.includes("@") && key !== "—";
}

/** Last address we successfully mailed on this thread (not inbound, not bounced). */
export function lastOutboundRecipientEmail(
  events: { recipientEmail?: string | null; status?: string | null; kind?: string | null }[],
  barNodes?: { recipientEmail?: string | null; kind?: string | null }[],
): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const email = ev.recipientEmail?.trim();
    if (!email || !isUsableRecipientAddress(email)) continue;
    if (ev.kind === "inbound_reply") continue;
    if (ev.status === "sent" || ev.status === "opened") return email;
  }
  if (barNodes) {
    for (let i = barNodes.length - 1; i >= 0; i--) {
      const node = barNodes[i];
      const email = node.recipientEmail?.trim();
      if (!email || !isUsableRecipientAddress(email)) continue;
      if (node.kind === "sent") return email;
    }
  }
  return undefined;
}

export function defaultReplyRecipientEmails(
  contactEmail?: string,
  contactEmails?: ContactEmailEntry[],
  lastSent?: string | null,
): string[] {
  const sent = lastSent?.trim();
  if (sent && isUsableRecipientAddress(sent)) return [sent];
  return defaultSelectedContactEmails(contactEmail, contactEmails);
}

/**
 * How To: addresses relate to prior sends on this lead.
 * - reply / follow_up: keep the thread To (Email 1 / last outbound), including already-sent.
 * - outbound: "send to additional" only; drop addresses already used on this lead.
 */
export type SendRecipientMode = "reply" | "follow_up" | "outbound";

export function selectedEmailsForSend(
  selected: string[],
  alreadySent: Set<string>,
  mode: SendRecipientMode,
): string[] {
  const valid = selected.filter((raw) => isUsableRecipientAddress(raw)).map((raw) => raw.trim());
  if (mode === "reply" || mode === "follow_up") return valid;
  return valid.filter((email) => !alreadySent.has(email.trim().toLowerCase()));
}

/** True when send should reuse the prior outbound inbox (reply or Email 2/3). */
export function reusesThreadRecipient(mode: SendRecipientMode): boolean {
  return mode === "reply" || mode === "follow_up";
}

/** Keep explicit To: picks (including firstname@ and newly typed addresses). Fall back to auto-select. */
export function retainSelectedRecipientEmails(
  prev: string[],
  listedEmails: string[],
  alreadySent: Set<string>,
  fallback: string[],
  options?: { allowAlreadySent?: boolean },
): string[] {
  const allowAlreadySent = options?.allowAlreadySent === true;
  const listed = new Set(listedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const stillValid = prev.filter((raw) => {
    const key = raw.trim().toLowerCase();
    if (!isUsableRecipientAddress(raw)) return false;
    if (!allowAlreadySent && alreadySent.has(key)) return false;
    if (listed.has(key)) return true;
    return Boolean(sanitizeEmail(key));
  });
  if (stillValid.length) return stillValid;
  return fallback.filter((email) => allowAlreadySent || !alreadySent.has(email.trim().toLowerCase()));
}

function sendPreferenceScore(entry: ContactEmailEntry): number {
  if (isWeakGuessEmail(entry)) return -1;
  if (entry.emailStatus === "verified") return 100;
  if (entry.enrichmentProvider === "manual" || entry.enrichmentSource === "manual" || entry.pattern === "custom") {
    return 90;
  }
  if (entry.pattern === "first.last") return 70;
  if (hasUsableEmail(entry.email, entry.emailStatus)) return 60;
  return 40;
}

/** Auto-selected To: addresses. Never picks firstname@ / lastname@ permutation guesses. */
export function preferredSendRecipientEmails(entries: ContactEmailEntry[]): string[] {
  const sendable = entries.filter(isSendableStoredEmail);
  const ranked = [...sendable].sort((a, b) => sendPreferenceScore(b) - sendPreferenceScore(a));
  const chosen = ranked.find((entry) => sendPreferenceScore(entry) >= 0);
  return chosen ? [chosen.email.trim()] : [];
}

export function defaultSelectedContactEmails(
  contactEmail?: string,
  contactEmails?: ContactEmailEntry[],
): string[] {
  const primary = contactEmails?.find(
    (entry) => entry.email.trim().toLowerCase() === contactEmail?.trim().toLowerCase(),
  );
  const entries = contactEmails?.length
    ? contactEmails
    : contactEmail?.trim()
      ? [
          {
            email: contactEmail.trim(),
            emailStatus: "unverified" as const,
            enrichmentProvider: primary?.enrichmentProvider,
            enrichmentSource: primary?.enrichmentSource,
            pattern: primary?.pattern,
          },
        ]
      : [];
  return preferredSendRecipientEmails(entries);
}

export function alreadySentRecipientKeys(
  rows: { recipientEmail?: string | null; status?: string | null }[],
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.status === "sent" || row.status === "opened")
      .map((row) => row.recipientEmail?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
}

function toManualEntry(email: string): ContactEmailEntry {
  return {
    email,
    emailStatus: "unverified",
    emailConfidence: 40,
    enrichmentProvider: "manual",
    enrichmentSource: "manual",
    testStatus: "saved",
    pattern: "custom",
  };
}

/**
 * Resolve To: addresses for an outreach send.
 * Explicit selections must be valid. Addresses already on the contact, first.last
 * guesses shown in the Email tab, or newly typed valid addresses are sendable.
 * Bounced and rejected stored candidates are not.
 */
export function resolveSendRecipients(
  contact: SendContact,
  requested?: unknown,
  identity?: SendRecipientIdentity,
): { recipients: string[]; persistEmails?: string[]; error?: string } {
  const listed = listedContactEmails(contact, identity);
  const byLower = displayByLower(listed);
  const stored = new Map(listed.map((e) => [e.email.trim().toLowerCase(), e]));

  const rawList = Array.isArray(requested)
    ? requested.filter((v): v is string => typeof v === "string").map((e: string) => e.trim()).filter(Boolean)
    : [];
  const requestedEmails = [...new Set(rawList.map((e) => e.toLowerCase()))];

  if (requestedEmails.length === 0) {
    const preferred = preferredSendRecipientEmails(listed);
    if (!preferred.length) {
      const hasOnlyWeak = listed.some((e) => isSendableStoredEmail(e) && isWeakGuessEmail(e));
      return {
        recipients: [],
        error: hasOnlyWeak
          ? EMPTY_SEND_TO_HINT
          : "Contact has no usable email address. Add one with Add another email, then send.",
      };
    }
    return { recipients: preferred };
  }

  const persistEmails: string[] = [];
  const resolved: string[] = [];
  const invalid: string[] = [];
  const blocked: string[] = [];

  for (const key of requestedEmails) {
    const storedEntry = stored.get(key);
    if (storedEntry) {
      if (!isSendableStoredEmail(storedEntry)) {
        blocked.push(byLower.get(key) ?? key);
        continue;
      }
      resolved.push(byLower.get(key) ?? storedEntry.email.trim());
      continue;
    }

    const cleaned = sanitizeEmail(key);
    if (!cleaned) {
      invalid.push(key);
      continue;
    }
    persistEmails.push(cleaned);
    resolved.push(cleaned);
    stored.set(cleaned, toManualEntry(cleaned));
    byLower.set(cleaned, cleaned);
  }

  if (invalid.length) {
    return { recipients: [], error: `Invalid email address: ${invalid.join(", ")}` };
  }
  if (blocked.length) {
    return {
      recipients: [],
      error: `Cannot send to bounced or rejected address: ${blocked.join(", ")}`,
    };
  }
  if (!resolved.length) {
    return { recipients: [], error: "No recipients selected" };
  }

  return {
    recipients: resolved,
    persistEmails: persistEmails.length ? persistEmails : undefined,
  };
}

export function mergePersistedSendEmails(
  contact: SendContact,
  persistEmails: string[],
): { email: string | null; alternateEmails: ContactEmailEntry[] } {
  const listed = listedContactEmails(contact);
  const seen = new Set(listed.map((e) => e.email.trim().toLowerCase()));
  const extra = persistEmails
    .map((email) => sanitizeEmail(email))
    .filter((email): email is string => typeof email === "string" && email.length > 0 && !seen.has(email));

  const alternates = [
    ...((contact.alternateEmails as ContactEmailEntry[] | null) ?? []),
    ...extra.map(toManualEntry),
  ];

  return {
    email: contact.email?.trim() || extra[0] || null,
    alternateEmails: alternates,
  };
}
