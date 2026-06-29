import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import {
  buildPermutationEmailEntry,
  promoteNextEmailCandidate,
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
