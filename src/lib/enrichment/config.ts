// Enrichment configuration — loaded from env at runtime, overridable via Settings UI

export type SearchProvider = "india_directories" | "google_places" | "tavily_ai" | "apollo";
export type EnrichProvider = "website_email" | "apollo" | "hunter" | "none";
export type DataMode = "free" | "paid" | "auto";

export type EnrichmentConfig = {
  searchProvider: SearchProvider;
  enrichProvider: EnrichProvider;
  fallbackToAI: boolean;
  enrichOnImport: boolean;
  dataMode: DataMode;
  scoutCompaniesLimit: number;
  scoutLeadsLimit: number;
};

export const SCOUT_VOLUME_PRESETS = {
  lite: { companies: 1, leads: 1, label: "Minimum", desc: "1 company · 1 lead — lowest token use" },
  standard: { companies: 10, leads: 3, label: "Lite", desc: "Small batch · moderate token use" },
  max: { companies: 25, leads: 8, label: "Standard", desc: "Balanced coverage and cost" },
} as const;

function clampScoutLimit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function getScoutCompaniesLimit(): number {
  const raw = process.env.SCOUT_COMPANIES_LIMIT ?? process.env.PROSPECTING_MAX_RESULTS ?? "1";
  return clampScoutLimit(parseInt(raw, 10), 1, 100, 1);
}

export function getScoutLeadsLimit(): number {
  const raw = process.env.SCOUT_LEADS_LIMIT ?? "1";
  return clampScoutLimit(parseInt(raw, 10), 1, 25, 1);
}

export const SEARCH_PROVIDER_LABELS: Record<SearchProvider, { label: string; desc: string; badge: string }> = {
  india_directories: {
    label: "India Directories",
    desc: "JustDial, IndiaMART, Sulekha, ZaubaCorp — best free coverage for Indian SMBs",
    badge: "Free",
  },
  google_places: {
    label: "Google Places",
    desc: "Google Maps business listings — great for local Bangalore/Hosur companies",
    badge: "Free tier",
  },
  tavily_ai: {
    label: "Tavily + AI",
    desc: "Web search + Gemini extraction — broad coverage, slower",
    badge: "Free",
  },
  apollo: {
    label: "Apollo.io",
    desc: "Best structured data: industry, employees, emails — requires paid key",
    badge: "Paid",
  },
};

export const DATA_MODE_OPTIONS: { value: DataMode; label: string; title: string; desc: string }[] = [
  {
    value: "free",
    label: "Free",
    title: "India directories + AI fallback",
    desc: "India Directories + Tavily + AI fallback",
  },
  {
    value: "paid",
    label: "Paid",
    title: "Apollo + Hunter when keys are set",
    desc: "Apollo + Hunter (requires API keys)",
  },
  {
    value: "auto",
    label: "Auto",
    title: "Paid if keys set, else Free",
    desc: "Paid if API keys set, else Free",
  },
];

export const ENRICH_PROVIDER_LABELS: Record<EnrichProvider, { label: string; desc: string; badge: string }> = {
  website_email: {
    label: "Website Email Scrape",
    desc: "Crawl company website for contact emails — completely free",
    badge: "Free",
  },
  apollo: {
    label: "Apollo Enrichment",
    desc: "Apollo people search for named HR/Admin contacts with emails",
    badge: "Paid",
  },
  hunter: {
    label: "Hunter.io",
    desc: "Email finder + deliverability verification — best accuracy",
    badge: "Paid",
  },
  none: {
    label: "Skip Email Enrichment",
    desc: "Only use emails already found in search results",
    badge: "Free",
  },
};

export function hasApolloKey(): boolean {
  return !!process.env.APOLLO_API_KEY;
}

export function hasHunterKey(): boolean {
  return !!process.env.HUNTER_API_KEY;
}

/** Resolve search provider from dataMode + configured default */
export function resolveSearchProvider(dataMode: DataMode, configured: SearchProvider): SearchProvider {
  if (dataMode === "paid" || dataMode === "auto") {
    if (hasApolloKey()) return "apollo";
  }
  if (configured === "apollo" && !hasApolloKey()) {
    return "india_directories";
  }
  return configured;
}

/** Resolve enrich provider from dataMode + configured default */
export function resolveEnrichProvider(dataMode: DataMode, configured: EnrichProvider): EnrichProvider {
  if (dataMode === "paid" || dataMode === "auto") {
    if (hasHunterKey()) return "hunter";
    if (hasApolloKey()) return "apollo";
  }
  return configured;
}

/** Load from env — used server-side at runtime */
export function getEnrichmentConfig(): EnrichmentConfig {
  return {
    searchProvider: (process.env.ENRICHMENT_SEARCH_PROVIDER as SearchProvider) ?? "india_directories",
    enrichProvider: (process.env.ENRICHMENT_ENRICH_PROVIDER as EnrichProvider) ?? "website_email",
    fallbackToAI: process.env.ENRICHMENT_FALLBACK_TO_AI !== "false",
    enrichOnImport: process.env.ENRICHMENT_ENRICH_ON_IMPORT !== "false",
    dataMode: (process.env.DEFAULT_DATA_MODE as DataMode) ?? "free",
    scoutCompaniesLimit: getScoutCompaniesLimit(),
    scoutLeadsLimit: getScoutLeadsLimit(),
  };
}

/** Merge env config with UI overrides and dataMode routing */
export function resolveEnrichmentConfig(
  dataMode?: DataMode,
  override?: Partial<EnrichmentConfig>,
): EnrichmentConfig {
  const base = { ...getEnrichmentConfig(), ...override };
  const mode = dataMode ?? base.dataMode;
  const configuredSearch = override?.searchProvider ?? base.searchProvider;
  const configuredEnrich = override?.enrichProvider ?? base.enrichProvider;

  return {
    ...base,
    dataMode: mode,
    searchProvider: resolveSearchProvider(mode, configuredSearch),
    enrichProvider: resolveEnrichProvider(mode, configuredEnrich),
  };
}
