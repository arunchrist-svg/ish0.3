import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import {
  buildPermutationEmailEntry,
  promoteNextEmailCandidate,
  rejectEmailCandidate,
  rejectPrimaryEmailCandidate,
} from "@/lib/enrichment/contact-emails";

export type ContactEmailState = {
  email?: string | null;
  emailStatus?: string | null;
  emailConfidence?: number | null;
  enrichmentSource?: string | null;
  enrichmentProvider?: string | null;
  alternateEmails?: ContactEmailEntry[] | null;
};

export function buildSavedEmailCandidates(
  selectedEmails: string[],
  primaryEmail: string,
  patternByEmail: Map<string, string>,
): { primary: ContactEmailEntry; alternates: ContactEmailEntry[] } {
  const primaryKey = primaryEmail.trim().toLowerCase();
  const alternates: ContactEmailEntry[] = [];

  for (const raw of selectedEmails) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email || key === primaryKey) continue;
    alternates.push(buildPermutationEmailEntry(email, patternByEmail.get(key) ?? "unknown"));
  }

  return {
    primary: buildPermutationEmailEntry(primaryEmail, patternByEmail.get(primaryKey) ?? "unknown"),
    alternates,
  };
}

function buildManagedEntry(
  email: string,
  patternByEmail: Map<string, string>,
  existingByKey: Map<string, ContactEmailEntry>,
): ContactEmailEntry {
  const key = email.trim().toLowerCase();
  const prev = existingByKey.get(key);
  const pattern = patternByEmail.get(key) ?? prev?.pattern;
  if (pattern && pattern !== "custom" && pattern !== "unknown") {
    const entry = buildPermutationEmailEntry(email, pattern);
    return {
      ...entry,
      emailStatus: prev?.emailStatus ?? entry.emailStatus,
      emailConfidence: prev?.emailConfidence ?? entry.emailConfidence,
      testStatus: prev?.testStatus === "rejected" ? "saved" : prev?.testStatus ?? "saved",
    };
  }

  return {
    email: email.trim(),
    emailStatus: prev?.emailStatus && prev.emailStatus !== "bounced" ? prev.emailStatus : "unverified",
    emailConfidence: prev?.emailConfidence ?? 40,
    enrichmentProvider: prev?.enrichmentProvider ?? "manual",
    enrichmentSource: prev?.enrichmentSource ?? "manual",
    testStatus: prev?.testStatus === "rejected" ? "saved" : prev?.testStatus ?? "saved",
    pattern: "custom",
  };
}

/** Build primary + alternates from a managed (add/edit/delete) email list. */
export function buildManagedEmailCandidates(
  selectedEmails: string[],
  primaryEmail: string | undefined,
  opts: {
    patternByEmail?: Map<string, string>;
    existing?: ContactEmailEntry[] | null;
  } = {},
): { primary: ContactEmailEntry | null; alternates: ContactEmailEntry[] } {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of selectedEmails) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }

  if (!unique.length) return { primary: null, alternates: [] };

  const primaryKey =
    primaryEmail?.trim() && seen.has(primaryEmail.trim().toLowerCase())
      ? primaryEmail.trim().toLowerCase()
      : unique[0].toLowerCase();
  const primaryRaw = unique.find((email) => email.toLowerCase() === primaryKey) ?? unique[0];
  const patternByEmail = opts.patternByEmail ?? new Map<string, string>();
  const existingByKey = new Map(
    (opts.existing ?? []).map((entry) => [entry.email.trim().toLowerCase(), entry]),
  );

  const primary = buildManagedEntry(primaryRaw, patternByEmail, existingByKey);
  const alternates = unique
    .filter((email) => email.toLowerCase() !== primaryKey)
    .map((email) => buildManagedEntry(email, patternByEmail, existingByKey));

  return { primary, alternates };
}

export function isPermutationTestCandidate(contact: ContactEmailState): boolean {
  return contact.enrichmentProvider === "permutation" && Boolean(contact.email?.trim());
}

export function shouldHandleSendFailure(contact: ContactEmailState): boolean {
  return isPermutationTestCandidate(contact);
}

export function applySendRejectionUpdates(contact: ContactEmailState): {
  updates: Partial<ContactEmailState>;
  rejectedEmail: string;
  nextEmail?: string;
  canRetry: boolean;
} {
  const rejectedEmail = contact.email?.trim() ?? "";
  const afterReject = rejectPrimaryEmailCandidate(contact);
  const promoted = promoteNextEmailCandidate(afterReject);

  return {
    updates: promoted.updates,
    rejectedEmail,
    nextEmail: promoted.nextEmail,
    canRetry: Boolean(promoted.nextEmail),
  };
}

export function applyBounceRejectionUpdates(
  contact: ContactEmailState,
  bouncedEmail: string,
): {
  updates: Partial<ContactEmailState>;
  rejectedEmail: string;
  nextEmail?: string;
  canRetry: boolean;
} {
  const afterReject = rejectEmailCandidate(contact, bouncedEmail);
  const primaryGone =
    (contact.email?.trim().toLowerCase() ?? "") === bouncedEmail.trim().toLowerCase();
  const promoted = primaryGone
    ? promoteNextEmailCandidate(afterReject)
    : { updates: { alternateEmails: afterReject.alternateEmails }, nextEmail: undefined };

  return {
    updates: promoted.updates,
    rejectedEmail: bouncedEmail.trim(),
    nextEmail: promoted.nextEmail,
    canRetry: Boolean(promoted.nextEmail),
  };
}
