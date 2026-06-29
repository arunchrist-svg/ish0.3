import { isEmailOutreachStarted } from "@/lib/pipeline-status";
import { isGenericCompanyEmail } from "@/lib/enrichment/validate-contact";

export type EmailTestStatus = "saved" | "sent" | "rejected";

export function parsePatternFromEnrichmentSource(source?: string | null): string | undefined {
  if (!source?.startsWith("name_domain_guess:")) return undefined;
  return source.slice("name_domain_guess:".length) || undefined;
}

export function formatEnrichmentSourceWithPattern(pattern: string): string {
  return `name_domain_guess:${pattern}`;
}

export type ContactEmailEntry = {
  email: string;
  emailStatus: "verified" | "unverified" | "generic" | "missing";
  emailConfidence?: number;
  enrichmentSource?: string;
  enrichmentProvider?: string;
  testStatus?: EmailTestStatus;
  pattern?: string;
};

export function normalizeEmailStatus(
  email?: string | null,
  emailStatus?: string | null,
): ContactEmailEntry["emailStatus"] {
  const normalized = email?.trim();
  if (!normalized || normalized === "—") return "missing";
  if (emailStatus === "verified" || emailStatus === "unverified" || emailStatus === "generic") {
    return emailStatus;
  }
  if (isGenericCompanyEmail(normalized)) return "generic";
  return "unverified";
}

export function hasUsableEmail(email?: string | null, emailStatus?: string | null): boolean {
  const normalized = email?.trim();
  if (!normalized || normalized === "—" || !normalized.includes("@")) return false;
  if (emailStatus === "generic" || isGenericCompanyEmail(normalized)) return false;
  return true;
}

export function buildContactEmails(params: {
  primaryEmail?: string | null;
  emailStatus?: string | null;
  emailConfidence?: number | null;
  enrichmentSource?: string | null;
  enrichmentProvider?: string | null;
  testStatus?: EmailTestStatus;
  pattern?: string;
  alternateEmails?: ContactEmailEntry[] | null;
}): ContactEmailEntry[] {
  const seen = new Set<string>();
  const out: ContactEmailEntry[] = [];

  const add = (entry: ContactEmailEntry) => {
    const key = entry.email.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  if (params.primaryEmail && params.primaryEmail !== "—") {
    const primaryKey = params.primaryEmail.trim().toLowerCase();
    const matchingAlt = (params.alternateEmails ?? []).find(
      (entry) => entry.email.trim().toLowerCase() === primaryKey,
    );
    add({
      email: params.primaryEmail,
      emailStatus: normalizeEmailStatus(params.primaryEmail, params.emailStatus),
      emailConfidence: params.emailConfidence ?? undefined,
      enrichmentSource: params.enrichmentSource ?? undefined,
      enrichmentProvider: params.enrichmentProvider ?? undefined,
      testStatus: params.testStatus ?? matchingAlt?.testStatus,
      pattern: params.pattern ?? matchingAlt?.pattern ?? parsePatternFromEnrichmentSource(params.enrichmentSource),
    });
  }

  for (const alt of params.alternateEmails ?? []) {
    if (alt.email) add(alt);
  }

  return out;
}

export function mergeAlternateEmails(
  primaryEmail: string | undefined,
  existing: ContactEmailEntry[] | null | undefined,
  discovered: ContactEmailEntry[],
): ContactEmailEntry[] {
  const primaryKey = primaryEmail?.trim().toLowerCase();
  const map = new Map<string, ContactEmailEntry>();

  for (const entry of [...(existing ?? []), ...discovered]) {
    const key = entry.email.trim().toLowerCase();
    if (!key || key === primaryKey) continue;
    const prev = map.get(key);
    if (!prev || (entry.emailConfidence ?? 0) > (prev.emailConfidence ?? 0)) {
      map.set(key, entry);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.emailConfidence ?? 0) - (a.emailConfidence ?? 0),
  );
}


export function shouldSuggestWriteEmail(
  email: string | undefined | null,
  emailStatus: string | undefined | null,
  status: string,
  hasDraft: boolean,
): boolean {
  return hasUsableEmail(email, emailStatus) && !isEmailOutreachStarted(status, hasDraft);
}

export function buildPermutationEmailEntry(email: string, pattern: string): ContactEmailEntry {
  return {
    email: email.trim(),
    emailStatus: "unverified",
    emailConfidence: 30,
    enrichmentSource: "name_domain_guess",
    enrichmentProvider: "permutation",
    testStatus: "saved",
    pattern,
  };
}

export type ContactEmailQueueState = {
  email?: string | null;
  emailStatus?: string | null;
  emailConfidence?: number | null;
  enrichmentSource?: string | null;
  enrichmentProvider?: string | null;
  alternateEmails?: ContactEmailEntry[] | null;
};

function normalizeAlternateList(alternateEmails?: ContactEmailEntry[] | null): ContactEmailEntry[] {
  return [...(alternateEmails ?? [])];
}

export function rejectPrimaryEmailCandidate(contact: ContactEmailQueueState): ContactEmailQueueState {
  const primaryEmail = contact.email?.trim();
  if (!primaryEmail) return contact;

  const rejectedPattern = parsePatternFromEnrichmentSource(contact.enrichmentSource) ?? "unknown";
  const rejected = buildPermutationEmailEntry(primaryEmail, rejectedPattern);
  rejected.testStatus = "rejected";
  rejected.emailStatus = "missing";

  const alternates = normalizeAlternateList(contact.alternateEmails).filter(
    (entry) => entry.email.trim().toLowerCase() !== primaryEmail.toLowerCase(),
  );
  alternates.push(rejected);

  return {
    ...contact,
    email: null,
    emailStatus: "missing",
    alternateEmails: alternates,
  };
}

export function promoteNextEmailCandidate(contact: ContactEmailQueueState): {
  updates: Partial<ContactEmailQueueState>;
  nextEmail?: string;
} {
  const alternates = normalizeAlternateList(contact.alternateEmails);
  const nextIndex = alternates.findIndex((entry) => entry.testStatus === "saved");
  if (nextIndex < 0) {
    return { updates: { alternateEmails: alternates } };
  }

  const [next] = alternates.splice(nextIndex, 1);
  return {
    updates: {
      email: next.email,
      emailStatus: next.emailStatus,
      emailConfidence: next.emailConfidence,
      enrichmentSource: next.pattern ? formatEnrichmentSourceWithPattern(next.pattern) : next.enrichmentSource,
      enrichmentProvider: next.enrichmentProvider,
      alternateEmails: alternates,
    },
    nextEmail: next.email,
  };
}

export function markPrimaryEmailCandidateSent(contact: ContactEmailQueueState): Partial<ContactEmailQueueState> {
  if (contact.enrichmentProvider !== "permutation") return {};
  return {
    enrichmentProvider: "permutation",
    enrichmentSource: contact.enrichmentSource ?? "name_domain_guess",
  };
}

