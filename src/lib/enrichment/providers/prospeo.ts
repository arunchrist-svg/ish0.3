import { normalizeLinkedInUrl } from "@/lib/utils";
import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { getProspeoApiKey } from "../request-context";
import { domainFromWebsite, parseName } from "../provider-utils";
import { sanitizeEmail } from "../validate-contact";
import { hasProspeoKey } from "../config";

const PROSPEO_ENRICH_URL = "https://api.prospeo.io/enrich-person";

type ProspeoEmail = {
  status?: string;
  revealed?: boolean;
  email?: string | null;
};

type ProspeoPerson = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  linkedin_url?: string | null;
  current_job_title?: string | null;
  email?: ProspeoEmail | null;
};

type ProspeoResponse = {
  error?: boolean;
  error_code?: string;
  person?: ProspeoPerson | null;
};

function companyWebsite(input: EnrichmentInput): string | undefined {
  return domainFromWebsite(input.websiteUrl);
}

function buildMatchData(input: EnrichmentInput): Record<string, string> | null {
  const linkedIn = normalizeLinkedInUrl(input.linkedinUrl);
  const data: Record<string, string> = {};

  if (linkedIn && /linkedin\.com\/in\//i.test(linkedIn)) {
    data.linkedin_url = linkedIn;
  }

  const { firstName, lastName } = parseName(input.name);
  if (firstName && lastName) {
    data.first_name = firstName;
    data.last_name = lastName;
  } else if (input.name.trim()) {
    data.full_name = input.name.trim();
  }

  const website = companyWebsite(input);
  if (website) data.company_website = website;
  if (input.company.trim()) data.company_name = input.company.trim();

  if (data.linkedin_url) return data;
  if ((data.first_name && data.last_name) || data.full_name) {
    if (data.company_website || data.company_name) return data;
  }
  return null;
}

function emailStatus(person: ProspeoPerson | null | undefined): string {
  return String(person?.email?.status ?? "").toUpperCase();
}

/** Prefer verified reveals; LinkedIn matches may still return a usable revealed address. */
function revealedEmail(
  person: ProspeoPerson | null | undefined,
  options?: { allowUnverified?: boolean },
): string | undefined {
  const block = person?.email;
  if (!block?.revealed) return undefined;
  const status = emailStatus(person);
  if (status === "VERIFIED") return sanitizeEmail(block.email ?? undefined);
  if (!options?.allowUnverified) return undefined;
  if (status === "UNAVAILABLE") return undefined;
  return sanitizeEmail(block.email ?? undefined);
}

async function prospeoEnrichRequest(
  apiKey: string,
  data: Record<string, string>,
  onlyVerifiedEmail: boolean,
): Promise<ProspeoResponse | null> {
  const res = await fetch(PROSPEO_ENRICH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": apiKey,
    },
    body: JSON.stringify({
      only_verified_email: onlyVerifiedEmail,
      // India mobiles stay on Zintlr. Prospeo mobile unlocks cost 10 credits.
      enrich_mobile: false,
      data,
    }),
  });

  const body = (await res.json().catch(() => null)) as ProspeoResponse | null;
  if (!res.ok || body?.error || !body?.person) {
    if (body?.error_code && body.error_code !== "NO_MATCH") {
      console.error("[prospeo] enrich failed:", body.error_code, res.status);
    }
    return null;
  }
  return body;
}

function toEnrichmentResult(
  input: EnrichmentInput,
  body: ProspeoResponse,
  email: string,
): EnrichmentResult {
  const person = body.person!;
  const fullName =
    person.full_name?.trim() ||
    [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
    input.name;

  return {
    providerId: "prospeo",
    contact: {
      name: fullName,
      title: person.current_job_title?.trim() || input.title,
      company: input.company,
      city: input.city,
      email,
      linkedinUrl: normalizeLinkedInUrl(person.linkedin_url ?? undefined) ?? input.linkedinUrl,
    },
    raw: body,
  };
}

function hasClassicNameMatch(data: Record<string, string>): boolean {
  const hasName = Boolean((data.first_name && data.last_name) || data.full_name);
  return hasName && Boolean(data.company_website || data.company_name);
}

function withoutLinkedIn(data: Record<string, string>): Record<string, string> | null {
  const { linkedin_url: _linkedin, ...rest } = data;
  return hasClassicNameMatch(rest) ? rest : null;
}

async function resolveProspeoEmail(
  apiKey: string,
  data: Record<string, string>,
  options: { allowUnverified: boolean },
): Promise<{ body: ProspeoResponse; email: string } | null> {
  const verifiedBody = await prospeoEnrichRequest(apiKey, data, true);
  const verified = revealedEmail(verifiedBody?.person);
  if (verifiedBody && verified) return { body: verifiedBody, email: verified };

  if (!options.allowUnverified) return null;

  const fallbackBody = await prospeoEnrichRequest(apiKey, data, false);
  const fallback = revealedEmail(fallbackBody?.person, { allowUnverified: true });
  if (!fallbackBody || !fallback) return null;
  return { body: fallbackBody, email: fallback };
}

export const prospeoProvider: EnrichmentProvider = {
  id: "prospeo",
  name: "Prospeo Email Finder",
  capabilities: ["enrich"],
  isConfigured: () => hasProspeoKey(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasProspeoKey()) return null;

    const data = buildMatchData(input);
    if (!data) return null;

    const apiKey = getProspeoApiKey();
    if (!apiKey) return null;
    const matchedViaLinkedIn = Boolean(data.linkedin_url);

    try {
      // 1) LinkedIn-first when present (same credits path as before)
      const primary = await resolveProspeoEmail(apiKey, data, {
        allowUnverified: matchedViaLinkedIn,
      });
      if (primary) return toEnrichmentResult(input, primary.body, primary.email);

      // 2) Classic lead lookup: first + last + company/website (like Scout enrich without LI)
      const classic = matchedViaLinkedIn ? withoutLinkedIn(data) : null;
      if (!classic) return null;

      const byName = await resolveProspeoEmail(apiKey, classic, { allowUnverified: true });
      if (!byName) return null;
      return toEnrichmentResult(input, byName.body, byName.email);
    } catch (e) {
      console.error("[prospeo] enrich failed:", e);
      return null;
    }
  },
};
