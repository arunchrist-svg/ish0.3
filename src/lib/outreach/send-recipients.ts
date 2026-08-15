import {
  buildContactEmails,
  hasUsableEmail,
  isRejectedEmailEntry,
  type ContactEmailEntry,
} from "@/lib/enrichment/contact-emails";

type SendContact = {
  email?: string | null;
  emailStatus?: string | null;
  emailConfidence?: number | null;
  enrichmentSource?: string | null;
  enrichmentProvider?: string | null;
  alternateEmails?: ContactEmailEntry[] | null;
};

export function listedContactEmails(contact: SendContact): ContactEmailEntry[] {
  return buildContactEmails({
    primaryEmail: contact.email,
    emailStatus: contact.emailStatus,
    emailConfidence: contact.emailConfidence,
    enrichmentSource: contact.enrichmentSource,
    enrichmentProvider: contact.enrichmentProvider,
    alternateEmails: contact.alternateEmails ?? [],
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

/**
 * Resolve To: addresses for an outreach send.
 * Explicit selections must exist on the contact. Manually added unverified/generic
 * addresses are sendable; bounced and rejected candidates are not.
 */
export function resolveSendRecipients(
  contact: SendContact,
  requested?: unknown,
): { recipients: string[]; error?: string } {
  const listed = listedContactEmails(contact);
  const byLower = displayByLower(listed);
  const stored = new Map(listed.map((e) => [e.email.trim().toLowerCase(), e]));

  const rawList = Array.isArray(requested)
    ? requested.filter((v): v is string => typeof v === "string")
    : [];
  const requestedEmails = [...new Set(rawList.map((e) => e.trim().toLowerCase()).filter(Boolean))];

  if (requestedEmails.length === 0) {
    const preferred = listed.find(
      (e) => isSendableStoredEmail(e) && hasUsableEmail(e.email, e.emailStatus),
    );
    const fallback = listed.find((e) => isSendableStoredEmail(e));
    const chosen = preferred ?? fallback;
    if (!chosen) {
      return { recipients: [], error: "Contact has no usable email address" };
    }
    return { recipients: [chosen.email.trim()] };
  }

  const unknown = requestedEmails.filter((e) => !stored.has(e));
  if (unknown.length) {
    return {
      recipients: [],
      error: `Email not on this contact: ${unknown.join(", ")}`,
    };
  }

  const blocked = requestedEmails.filter((e) => {
    const entry = stored.get(e);
    return !entry || !isSendableStoredEmail(entry);
  });
  if (blocked.length) {
    return {
      recipients: [],
      error: `Cannot send to bounced or rejected address: ${blocked.join(", ")}`,
    };
  }

  return {
    recipients: requestedEmails.map((e) => byLower.get(e) ?? e),
  };
}
