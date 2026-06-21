import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";
import { scrapeWebsiteEmails } from "../website-email";
import { pickBestEmail, pickBestPhone, sanitizeEmail, sanitizePhone } from "../validate-contact";
import { domainFromWebsite, domainFromCompany } from "../provider-utils";

export const websiteEmailProvider: EnrichmentProvider = {
  id: "website_email",
  name: "Website Email Scraper",
  capabilities: ["enrich"],
  isConfigured: () => true,

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    const domain = domainFromWebsite(input.websiteUrl) ?? domainFromCompany(input.company);
    const scraped = await scrapeWebsiteEmails(domain).catch(() => null);
    const email = scraped?.bestEmail ? sanitizeEmail(scraped.bestEmail) : undefined;
    if (!email) return null;

    return {
      providerId: "website_email",
      contact: {
        name: input.name,
        title: input.title,
        company: input.company,
        city: input.city,
        email,
        websiteUrl: input.websiteUrl ?? `https://${domain}`,
      },
    };
  },
};
