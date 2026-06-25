import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { getHunterApiKey } from "../request-context";
import { domainFromCompany, domainFromWebsite, linkedinHandle, parseName } from "../provider-utils";
import { sanitizeEmail } from "../validate-contact";
import { hasHunterKey } from "../config";

const HUNTER_BASE = "https://api.hunter.io/v2";

async function hunterFetch(path: string, params: Record<string, string>) {
  const apiKey = getHunterApiKey();
  if (!apiKey) throw new Error("HUNTER_API_KEY not set");
  const query = new URLSearchParams({ ...params, api_key: apiKey });
  const res = await fetch(`${HUNTER_BASE}${path}?${query}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`Hunter API error (${res.status}): ${body.slice(0, 200)}`);
  return JSON.parse(body) as { data?: { email?: string; linkedin_url?: string; score?: number } };
}

export const hunterProvider: EnrichmentProvider = {
  id: "hunter",
  name: "Hunter.io Email Finder",
  capabilities: ["enrich"],
  isConfigured: () => hasHunterKey(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasHunterKey()) return null;

    const params: Record<string, string> = {};
    const handle = linkedinHandle(input.linkedinUrl);
    if (handle) {
      params.linkedin_handle = handle;
    } else {
      const { firstName, lastName } = parseName(input.name);
      if (firstName) params.first_name = firstName;
      if (lastName) params.last_name = lastName;
      const domain = domainFromWebsite(input.websiteUrl) ?? domainFromCompany(input.company);
      if (domain) params.domain = domain;
      else if (input.company) params.company = input.company;
    }

    if (!params.linkedin_handle && !params.domain && !params.company) return null;

    try {
      const response = await hunterFetch("/email-finder", params);
      const email = sanitizeEmail(response.data?.email);
      if (!email) return null;
      return {
        providerId: "hunter",
        contact: {
          name: input.name,
          title: input.title,
          company: input.company,
          city: input.city,
          email,
          linkedinUrl: response.data?.linkedin_url ?? input.linkedinUrl,
        },
        raw: response.data,
      };
    } catch (e) {
      console.error("[hunter] enrich failed:", e);
      return null;
    }
  },
};
