import type { EnrichmentProvider, EnrichmentProviderId } from "../enrich-types";
import { websiteEmailProvider } from "./website-email";
import { webSnippetsProvider } from "./web-snippets";
import { aiResearchProvider } from "./ai-research";
import { googlePlacesProvider } from "./google-places-phone";
import { hunterProvider } from "./hunter";
import { apolloEnrichProvider } from "./apollo-enrich";

const providers: Record<EnrichmentProviderId, EnrichmentProvider> = {
  website_email: websiteEmailProvider,
  web_snippets: webSnippetsProvider,
  ai_research: aiResearchProvider,
  google_places: googlePlacesProvider,
  hunter: hunterProvider,
  apollo: apolloEnrichProvider,
};

export function getProvider(id: EnrichmentProviderId): EnrichmentProvider {
  return providers[id];
}

export function getAllProviders(): EnrichmentProvider[] {
  return Object.values(providers);
}
