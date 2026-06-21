export type EnrichmentProviderId =
  | "website_email"
  | "web_snippets"
  | "ai_research"
  | "google_places"
  | "hunter"
  | "apollo";

export type EnrichmentSource =
  | "website"
  | "web_snippets"
  | "ai_research"
  | "google_places"
  | "hunter"
  | "apollo";

export interface EnrichedContact {
  name?: string;
  title?: string;
  company?: string;
  city?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}

export interface EnrichmentInput {
  name: string;
  title?: string;
  company: string;
  city?: string;
  email?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}

export interface EnrichmentResult {
  contact: Partial<EnrichedContact>;
  providerId: EnrichmentProviderId;
  raw?: unknown;
}

export interface EnrichmentProvider {
  id: EnrichmentProviderId;
  name: string;
  capabilities: ("enrich")[];
  isConfigured(): boolean;
  enrich(input: EnrichmentInput): Promise<EnrichmentResult | null>;
}

export function providerToSource(id: EnrichmentProviderId): EnrichmentSource {
  const map: Record<EnrichmentProviderId, EnrichmentSource> = {
    website_email: "website",
    web_snippets: "web_snippets",
    ai_research: "ai_research",
    google_places: "google_places",
    hunter: "hunter",
    apollo: "apollo",
  };
  return map[id];
}
