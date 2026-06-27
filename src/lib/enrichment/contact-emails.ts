import { isEmailOutreachStarted } from "@/lib/pipeline-status";
import { isGenericCompanyEmail } from "@/lib/enrichment/validate-contact";

export type ContactEmailEntry = {
  email: string;
  emailStatus: "verified" | "unverified" | "generic" | "missing";
  emailConfidence?: number;
  enrichmentSource?: string;
  enrichmentProvider?: string;
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
    add({
      email: params.primaryEmail,
      emailStatus: normalizeEmailStatus(params.primaryEmail, params.emailStatus),
      emailConfidence: params.emailConfidence ?? undefined,
      enrichmentSource: params.enrichmentSource ?? undefined,
      enrichmentProvider: params.enrichmentProvider ?? undefined,
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
