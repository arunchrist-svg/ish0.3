import type { EnrichmentProviderId } from "./enrich-types";
import { hasApolloKey, hasHunterKey } from "./config";

export const FREE_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "website_email",
  "web_snippets",
  "ai_research",
  "google_places",
];

export const PAID_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "hunter",
  "apollo",
];

export const PAID_PROVIDER_IDS = new Set<EnrichmentProviderId>(PAID_ENRICH_PROVIDER_ORDER);

export function isProviderConfigured(id: EnrichmentProviderId): boolean {
  switch (id) {
    case "hunter":
      return hasHunterKey();
    case "apollo":
      return hasApolloKey();
    default:
      return true;
  }
}

export function hasAnyPaidProvider(): boolean {
  return PAID_ENRICH_PROVIDER_ORDER.some(isProviderConfigured);
}

export function hasAnyEnrichmentProvider(): boolean {
  return true;
}
