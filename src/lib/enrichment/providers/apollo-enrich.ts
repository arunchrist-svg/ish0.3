import { normalizeLinkedInUrl } from "@/lib/utils";
import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { parseName } from "../provider-utils";
import { sanitizeEmail, sanitizePhone } from "../validate-contact";
import { hasApolloKey } from "../config";

const BASE = "https://api.apollo.io/v1";

async function apolloPost(path: string, body: object) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{ person?: Record<string, unknown> }>;
}

export const apolloEnrichProvider: EnrichmentProvider = {
  id: "apollo",
  name: "Apollo.io People Match",
  capabilities: ["enrich"],
  isConfigured: () => hasApolloKey(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasApolloKey()) return null;

    const { firstName, lastName } = parseName(input.name);
    const payload: Record<string, unknown> = { reveal_personal_emails: true };

    if (input.email) {
      payload.email = input.email;
    } else if (input.linkedinUrl) {
      payload.linkedin_url = normalizeLinkedInUrl(input.linkedinUrl);
    } else if (firstName && lastName && input.company) {
      payload.first_name = firstName;
      payload.last_name = lastName;
      payload.organization_name = input.company;
    } else {
      return null;
    }

    try {
      const data = await apolloPost("/people/match", payload);
      const person = data.person;
      if (!person) return null;

      const phones = person.phone_numbers as Array<{ sanitized_number?: string; raw_number?: string }> | undefined;
      const email = sanitizeEmail(person.email as string | undefined);
      const phone = sanitizePhone(phones?.[0]?.sanitized_number ?? phones?.[0]?.raw_number);
      if (!email && !phone) return null;

      return {
        providerId: "apollo",
        contact: {
          name: (person.name as string) ?? input.name,
          title: (person.title as string) ?? input.title,
          company: input.company,
          city: input.city,
          email,
          phone,
          linkedinUrl: normalizeLinkedInUrl(person.linkedin_url as string | undefined) ?? input.linkedinUrl,
        },
        raw: person,
      };
    } catch (e) {
      console.error("[apollo-enrich] failed:", e);
      return null;
    }
  },
};
