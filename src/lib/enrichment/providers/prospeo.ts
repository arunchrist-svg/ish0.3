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

function revealedVerifiedEmail(person: ProspeoPerson | null | undefined): string | undefined {
  const block = person?.email;
  if (!block?.revealed) return undefined;
  if (String(block.status ?? "").toUpperCase() !== "VERIFIED") return undefined;
  return sanitizeEmail(block.email ?? undefined);
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

    try {
      const res = await fetch(PROSPEO_ENRICH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KEY": apiKey,
        },
        body: JSON.stringify({
          only_verified_email: true,
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

      const email = revealedVerifiedEmail(body.person);
      if (!email) return null;

      const fullName =
        body.person.full_name?.trim() ||
        [body.person.first_name, body.person.last_name].filter(Boolean).join(" ").trim() ||
        input.name;

      return {
        providerId: "prospeo",
        contact: {
          name: fullName,
          title: body.person.current_job_title?.trim() || input.title,
          company: input.company,
          city: input.city,
          email,
          linkedinUrl:
            normalizeLinkedInUrl(body.person.linkedin_url ?? undefined) ?? input.linkedinUrl,
        },
        raw: body,
      };
    } catch (e) {
      console.error("[prospeo] enrich failed:", e);
      return null;
    }
  },
};
