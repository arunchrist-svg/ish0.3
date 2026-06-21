import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { tavilySearch } from "../tavily-client";
import { hasTavilyKeys } from "../tavily-keys";
import { pickBestEmail, pickBestPhone, sanitizeEmail, sanitizePhone } from "../validate-contact";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+91[\s.-]?)?(?:0)?[6-9]\d{9}\b/g;

function extractEmails(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const e = sanitizeEmail(raw);
    if (e) found.add(e);
  }
  return Array.from(found);
}

function extractPhones(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.match(PHONE_RE) ?? []) {
    const p = sanitizePhone(raw);
    if (p) found.add(p);
  }
  return Array.from(found);
}

export const webSnippetsProvider: EnrichmentProvider = {
  id: "web_snippets",
  name: "Web Snippet Search",
  capabilities: ["enrich"],
  isConfigured: () => hasTavilyKeys(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasTavilyKeys()) return null;

    const query = `"${input.name}" "${input.company}" ${input.title ?? "HR Admin"} email contact India`;
    const results = await tavilySearch(query, 5).catch(() => []);
    if (!results.length) return null;

    const blob = results.map((r) => `${r.title}\n${r.content}\n${r.url}`).join("\n");
    const email = pickBestEmail(extractEmails(blob));
    const phone = pickBestPhone(extractPhones(blob));
    if (!email && !phone) return null;

    return {
      providerId: "web_snippets",
      contact: {
        name: input.name,
        title: input.title,
        company: input.company,
        city: input.city,
        email,
        phone,
        linkedinUrl: input.linkedinUrl,
      },
      raw: results.slice(0, 3),
    };
  },
};
