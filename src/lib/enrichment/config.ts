// Enrichment configuration — loaded from env at runtime, overridable via Settings UI
import { resolveGiftIntelConfig } from "@/lib/brand-intel/config";
import { DEFAULT_SCOUT_GEO, normalizeScoutGeo, type ScoutGeoSelection } from "@/lib/geo/india";
import { normalizeScoutAreasOfFocus, type ScoutAreaOfFocus } from "@/lib/geo/area-of-focus";

export type SearchProvider =
  | "agentic_ai"
  | "india_directories"
  | "google_places"
  | "tavily_ai"
  | "apollo";
export type PeopleSearchProvider = "tavily_ai" | "apollo" | "none";
export type EnrichProvider = "website_email" | "prospeo" | "apollo" | "hunter" | "none";
export type DataMode = "free" | "paid" | "auto";
/** How lead finding is operated when Company search is Agentic AI. */
export type AiOperatingMode = "agentic" | "classic";
/**
 * Data stack for Agentic AI Scout.
 * - tavily_directories: India directories via Tavily (default)
 * - places_apollo: Google Places companies + Apollo people (no Tavily)
 */
export type AgenticDataStack = "tavily_directories" | "places_apollo";

export type EnrichmentConfig = {
  searchProvider: SearchProvider;
  /**
   * How `searchProvider` was arrived at. Set by `resolveEnrichmentConfig`, which is the only
   * place a data-mode upgrade can happen — by the time callers read `searchProvider` the
   * original choice is gone, so the reason has to be captured here.
   */
  providerChoice?: ProviderChoice;
  peopleSearchProvider: PeopleSearchProvider;
  enrichProvider: EnrichProvider;
  fallbackToAI: boolean;
  enrichOnImport: boolean;
  dataMode: DataMode;
  /**
   * Mirrors Company search when Agentic AI is selected. Classic providers set this to classic.
   */
  aiOperatingMode?: AiOperatingMode;
  /** Only applies when searchProvider is agentic_ai. */
  agenticDataStack?: AgenticDataStack;
  scoutCompaniesLimit: number;
  scoutLeadsLimit: number;
  /**
   * When true, people search honors the user's seniority/department chips exactly:
   * no pack expand, no plant Manager query bias, no role waterfall / empty broaden.
   */
  strictPeopleFilters: boolean;
  apolloApiKey?: string;
  hunterApiKey?: string;
  prospeoApiKey?: string;
  /** @deprecated Prefer brandIntel* */
  giftIntelProductCategory?: string;
  /** @deprecated Prefer brandIntel* */
  giftIntelCompetitorBrands?: string[];
  brandIntelProductCategory?: string;
  brandIntelCompetitorBrands?: string[];
  scoutGeo?: ScoutGeoSelection;
  scoutAreaOfFocus?: ScoutAreaOfFocus | null;
  scoutAreasOfFocus?: ScoutAreaOfFocus[];
  scoutPeopleCities?: string[];
};

export const MAX_SCOUT_COMPANIES_LIMIT = 25;
export const MAX_SCOUT_LEADS_LIMIT = 10;

export const SCOUT_VOLUME_PRESETS = {
  lite: { companies: 1, leads: 1, label: "Minimum", desc: "1 company · 1 lead — lowest token use" },
  standard: { companies: 10, leads: 3, label: "Lite", desc: "Small batch · moderate token use" },
  max: { companies: MAX_SCOUT_COMPANIES_LIMIT, leads: MAX_SCOUT_LEADS_LIMIT, label: "Standard", desc: "Balanced coverage and cost" },
} as const;

function clampScoutLimit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampScoutCompaniesLimit(value: number): number {
  return clampScoutLimit(value, 1, MAX_SCOUT_COMPANIES_LIMIT, 1);
}

export function clampScoutLeadsLimit(value: number): number {
  return clampScoutLimit(value, 1, MAX_SCOUT_LEADS_LIMIT, 1);
}

export function getScoutCompaniesLimit(): number {
  const raw = process.env.SCOUT_COMPANIES_LIMIT ?? process.env.PROSPECTING_MAX_RESULTS ?? "1";
  return clampScoutCompaniesLimit(parseInt(raw, 10));
}

export function getScoutLeadsLimit(): number {
  const raw = process.env.SCOUT_LEADS_LIMIT ?? "1";
  return clampScoutLeadsLimit(parseInt(raw, 10));
}

export const SEARCH_PROVIDER_LABELS: Record<SearchProvider, { label: string; desc: string; badge: string }> = {
  agentic_ai: {
    label: "Agentic AI",
    desc: "Scout agent team in Scouting. Choose Directories (Tavily) or Places + Apollo under Agentic data stack",
    badge: "AI team",
  },
  india_directories: {
    label: "India + Tavily",
    desc: "Tavily searches JustDial, IndiaMART, Sulekha, ZaubaCorp, and TradeIndia for Indian companies",
    badge: "Tavily",
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

export const AI_OPERATING_MODE_OPTIONS: {
  value: AiOperatingMode;
  label: string;
  title: string;
  desc: string;
}[] = [
  {
    value: "agentic",
    label: "Agentic AI",
    title: "Scout agent team in the Scouting tab",
    desc: "Same Scouting UI: companies then leads. The agent team plans ICP, discovers with India-friendly defaults, retries thin passes, and quality-gates before you add leads.",
  },
  {
    value: "classic",
    label: "Classic",
    title: "Manual provider (Tavily, Places, Apollo)",
    desc: "Pick India directories, Places, Tavily, or Apollo yourself under Enrichment → Company search.",
  },
];

export const AGENTIC_DATA_STACK_OPTIONS: {
  value: AgenticDataStack;
  label: string;
  title: string;
  desc: string;
}[] = [
  {
    value: "tavily_directories",
    label: "Directories",
    title: "India directories via Tavily",
    desc: "Tavily searches JustDial, IndiaMART, and related directories, then finds people via Tavily or Apollo.",
  },
  {
    value: "places_apollo",
    label: "Places + Apollo",
    title: "No Tavily",
    desc: "Companies from Google Places; decision-makers from Apollo. Best for local plants when Apollo is keyed.",
  },
];

export function resolveAgenticDataStack(
  value: AgenticDataStack | string | null | undefined,
): AgenticDataStack {
  return value === "places_apollo" ? "places_apollo" : "tavily_directories";
}

export function isAgenticSearchProvider(
  provider: SearchProvider | string | null | undefined,
): boolean {
  return provider === "agentic_ai";
}

export function resolveAiOperatingMode(
  value: AiOperatingMode | string | null | undefined,
  searchProvider?: SearchProvider | string | null,
): AiOperatingMode {
  if (isAgenticSearchProvider(searchProvider)) return "agentic";
  if (value === "classic" || value === "agentic") return value;
  return "classic";
}

export function isAgenticLeadFinding(
  config: Pick<EnrichmentConfig, "aiOperatingMode" | "searchProvider"> | null | undefined,
): boolean {
  return isAgenticSearchProvider(config?.searchProvider);
}

/** True when this config (or Agentic stack) will spend Tavily credits on company search. */
export function configUsesTavilyForCompanies(
  config: Pick<EnrichmentConfig, "searchProvider" | "agenticDataStack">,
): boolean {
  if (isAgenticSearchProvider(config.searchProvider)) {
    return resolveAgenticDataStack(config.agenticDataStack) === "tavily_directories";
  }
  return searchProviderUsesTavily(config.searchProvider);
}

/**
 * Quality defaults for Agentic Scout discovery.
 * Directories stack → India directories + Tavily people.
 * Places + Apollo stack → Google Places + Apollo people, no Tavily.
 */
export function applyAgenticScoutDefaults(
  config: EnrichmentConfig,
): EnrichmentConfig {
  const stack = resolveAgenticDataStack(config.agenticDataStack);

  if (stack === "places_apollo") {
    const people =
      config.peopleSearchProvider === "tavily_ai" ? "apollo" : config.peopleSearchProvider;
    return {
      ...config,
      agenticDataStack: "places_apollo",
      aiOperatingMode: "agentic",
      dataMode: "auto",
      searchProvider: "google_places",
      peopleSearchProvider: people,
      fallbackToAI: false,
      enrichOnImport: true,
      // Do not force strict AND filters; plant seats need empty-result broaden.
      strictPeopleFilters: false,
      providerChoice: {
        provider: "google_places",
        configured: "agentic_ai",
        reason: "configured",
      },
    };
  }

  const people =
    config.peopleSearchProvider === "none" ? "tavily_ai" : config.peopleSearchProvider;
  return {
    ...config,
    agenticDataStack: "tavily_directories",
    aiOperatingMode: "agentic",
    dataMode: "auto",
    searchProvider: "india_directories",
    peopleSearchProvider: people,
    fallbackToAI: true,
    enrichOnImport: true,
    strictPeopleFilters: false,
    providerChoice: {
      provider: "india_directories",
      configured: isAgenticSearchProvider(config.searchProvider)
        ? "agentic_ai"
        : config.searchProvider,
      reason: "configured",
    },
  };
}

/** Expand Agentic AI into concrete providers before waterfall discovery. */
export function materializeDiscoveryConfig(config: EnrichmentConfig): EnrichmentConfig {
  if (!isAgenticSearchProvider(config.searchProvider)) return config;
  return applyAgenticScoutDefaults(config);
}

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
    title: "Prospeo + Apollo when keys are set",
    desc: "Prospeo verified email, then Apollo (requires API keys)",
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
  prospeo: {
    label: "Prospeo",
    desc: "Verified B2B email finder — best accuracy for work emails",
    badge: "Paid",
  },
  apollo: {
    label: "Apollo Enrichment",
    desc: "Apollo people match for named contacts with emails",
    badge: "Paid",
  },
  hunter: {
    label: "Hunter.io",
    desc: "Email finder + deliverability verification",
    badge: "Paid",
  },
  none: {
    label: "Skip Email Enrichment",
    desc: "Only use emails already found in search results",
    badge: "Free",
  },
};

export const PEOPLE_SEARCH_PROVIDER_LABELS: Record<
  PeopleSearchProvider,
  { label: string; desc: string; badge: string }
> = {
  tavily_ai: {
    label: "Tavily + AI",
    desc: "Google-style web and LinkedIn search for people",
    badge: "Usage based",
  },
  apollo: {
    label: "Apollo.io",
    desc: "Structured people search by company and title",
    badge: "Paid",
  },
  none: {
    label: "None",
    desc: "Do not search externally for people",
    badge: "No search",
  },
};

export function hasApolloKey(): boolean {
  return !!process.env.APOLLO_API_KEY;
}

export function hasHunterKey(): boolean {
  return !!process.env.HUNTER_API_KEY;
}

export function hasProspeoKey(): boolean {
  return Boolean(process.env.PROSPEO_API_KEY?.trim());
}

export function hasZintlrKeys(): boolean {
  const token = process.env.ZINTLR_ACCESS_TOKEN?.trim();
  const secret = process.env.ZINTLR_SECRET_KEY?.trim();
  return Boolean(token && secret);
}

/** Company providers that spend Tavily credits during discovery. */
export function searchProviderUsesTavily(provider: SearchProvider): boolean {
  return (
    provider === "agentic_ai" ||
    provider === "india_directories" ||
    provider === "tavily_ai"
  );
}

/**
 * Which providers may backfill from the Tavily-backed India registry directories
 * when a search comes up short.
 *
 * Apollo is included because `auto`/`paid` mode routes every scout to Apollo when an
 * Apollo key is present, and Apollo has almost no coverage of Indian tier-2/3 cities.
 * Without this, an Apollo miss on a city like Bellary left no working provider:
 * the directory fallback was gated off, Places was the only remaining fill, and the
 * Tavily AI fallback is skipped for Apollo — so the scout returned zero with no warning.
 *
 * Google Places stays out on purpose: its misses should not spend Tavily quota.
 * Agentic AI materializes to directories or Places depending on agenticDataStack.
 */
export function shouldFallbackToIndiaDirectories(provider: SearchProvider): boolean {
  return provider === "tavily_ai" || provider === "apollo";
}

/**
 * Why the effective search provider differs from the configured one.
 * `auto`/`paid` mode silently upgrades to Apollo whenever an Apollo key is present, which once
 * routed every Indian tier-2 scout to a provider with no coverage there. Surfacing the reason
 * makes that visible instead of leaving it to be discovered by debugging.
 */
export type ProviderChoiceReason =
  | "configured"
  | "auto_upgraded_apollo"
  | "paid_upgraded_apollo";

export type ProviderChoice = {
  provider: SearchProvider;
  configured: SearchProvider;
  reason: ProviderChoiceReason;
};

/** Human-readable explanation for the scout panel and telemetry. */
export function describeProviderChoice(choice: ProviderChoice): string {
  const label = SEARCH_PROVIDER_LABELS[choice.provider]?.label ?? choice.provider;
  if (choice.reason === "configured") return `Using ${label}.`;
  const from = SEARCH_PROVIDER_LABELS[choice.configured]?.label ?? choice.configured;
  const mode = choice.reason === "auto_upgraded_apollo" ? "Auto" : "Paid";
  return `Using ${label} — upgraded from ${from} because Data Mode is ${mode} and an Apollo key is present.`;
}

/** Resolve search provider from dataMode + configured default, keeping the reason. */
export function resolveSearchProviderWithReason(
  dataMode: DataMode,
  configured: SearchProvider,
): ProviderChoice {
  // Agentic AI owns its own India-friendly waterfall; never silent-upgrade to Apollo.
  if (isAgenticSearchProvider(configured)) {
    return { provider: "agentic_ai", configured: "agentic_ai", reason: "configured" };
  }
  if ((dataMode === "paid" || dataMode === "auto") && hasApolloKey() && configured !== "apollo") {
    return {
      provider: "apollo",
      configured,
      reason: dataMode === "auto" ? "auto_upgraded_apollo" : "paid_upgraded_apollo",
    };
  }
  return { provider: configured, configured, reason: "configured" };
}

/** Resolve search provider from dataMode + configured default */
export function resolveSearchProvider(dataMode: DataMode, configured: SearchProvider): SearchProvider {
  return resolveSearchProviderWithReason(dataMode, configured).provider;
}

/** Resolve the provider used only for people/contact discovery. */
export function resolvePeopleSearchProvider(
  dataMode: DataMode,
  configured: PeopleSearchProvider,
): PeopleSearchProvider {
  if ((dataMode === "paid" || dataMode === "auto") && hasApolloKey()) {
    return configured === "tavily_ai" ? "apollo" : configured;
  }
  return configured;
}

export function defaultPeopleSearchProvider(searchProvider: SearchProvider): PeopleSearchProvider {
  if (searchProvider === "apollo") return "apollo";
  return "tavily_ai";
}

/** Resolve enrich provider from dataMode + configured default */
export function resolveEnrichProvider(dataMode: DataMode, configured: EnrichProvider): EnrichProvider {
  if (dataMode === "paid" || dataMode === "auto") {
    if (hasProspeoKey()) return "prospeo";
    if (hasHunterKey()) return "hunter";
    if (hasApolloKey()) return "apollo";
  }
  return configured;
}

/** Load from env — used server-side at runtime */
export function getEnrichmentConfig(): EnrichmentConfig {
  const envProvider = (process.env.ENRICHMENT_SEARCH_PROVIDER as SearchProvider) ?? "agentic_ai";
  const agentic = isAgenticSearchProvider(envProvider);
  const agenticDataStack = agentic
    ? resolveAgenticDataStack(process.env.ENRICHMENT_AGENTIC_DATA_STACK)
    : undefined;
  return {
    searchProvider: envProvider,
    peopleSearchProvider:
      (process.env.ENRICHMENT_PEOPLE_SEARCH_PROVIDER as PeopleSearchProvider) ??
      defaultPeopleSearchProvider(envProvider),
    enrichProvider: (process.env.ENRICHMENT_ENRICH_PROVIDER as EnrichProvider) ?? "website_email",
    fallbackToAI: process.env.ENRICHMENT_FALLBACK_TO_AI !== "false",
    enrichOnImport: process.env.ENRICHMENT_ENRICH_ON_IMPORT !== "false",
    dataMode: (process.env.DEFAULT_DATA_MODE as DataMode) ?? "free",
    aiOperatingMode: agentic ? "agentic" : "classic",
    agenticDataStack,
    scoutCompaniesLimit: getScoutCompaniesLimit(),
    scoutLeadsLimit: getScoutLeadsLimit(),
    strictPeopleFilters: false,
    scoutGeo: { ...DEFAULT_SCOUT_GEO },
    scoutAreaOfFocus: null,
    scoutAreasOfFocus: [],
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
  const configuredPeopleSearch = override?.peopleSearchProvider ?? base.peopleSearchProvider;
  const configuredEnrich = override?.enrichProvider ?? base.enrichProvider;
  const fallbackToAI =
    configuredSearch === "google_places" ? false : Boolean(base.fallbackToAI);

  const giftIntel = resolveGiftIntelConfig(override ?? base);
  const scoutAreasOfFocus = normalizeScoutAreasOfFocus(base.scoutAreasOfFocus, base.scoutAreaOfFocus);
  // A provider selected in the UI is explicit. Data-mode upgrades only apply
  // to environment defaults, never to a user's provider choice.
  const providerChoice: ProviderChoice = override?.searchProvider
    ? { provider: configuredSearch, configured: configuredSearch, reason: "configured" }
    : resolveSearchProviderWithReason(mode, configuredSearch);

  const agentic = isAgenticSearchProvider(providerChoice.provider);
  const agenticDataStack = agentic
    ? resolveAgenticDataStack(override?.agenticDataStack ?? base.agenticDataStack)
    : undefined;
  const placesApollo = agentic && agenticDataStack === "places_apollo";

  let peopleSearchProvider: PeopleSearchProvider;
  if (agentic && placesApollo) {
    peopleSearchProvider =
      configuredPeopleSearch === "tavily_ai" ? "apollo" : configuredPeopleSearch;
  } else if (agentic) {
    peopleSearchProvider =
      configuredPeopleSearch === "none"
        ? "tavily_ai"
        : override?.peopleSearchProvider
          ? configuredPeopleSearch
          : resolvePeopleSearchProvider("auto", configuredPeopleSearch);
  } else if (override?.peopleSearchProvider) {
    peopleSearchProvider = configuredPeopleSearch;
  } else {
    peopleSearchProvider = resolvePeopleSearchProvider(mode, configuredPeopleSearch);
  }

  return {
    ...base,
    dataMode: agentic ? "auto" : mode,
    aiOperatingMode: agentic ? "agentic" : "classic",
    agenticDataStack,
    searchProvider: providerChoice.provider,
    providerChoice,
    peopleSearchProvider,
    enrichProvider: resolveEnrichProvider(agentic ? "auto" : mode, configuredEnrich),
    fallbackToAI: agentic ? !placesApollo : fallbackToAI,
    enrichOnImport: agentic ? true : Boolean(base.enrichOnImport),
    giftIntelProductCategory: giftIntel.productCategory || undefined,
    giftIntelCompetitorBrands: giftIntel.competitorBrands.length ? giftIntel.competitorBrands : undefined,
    brandIntelProductCategory: giftIntel.productCategory || undefined,
    brandIntelCompetitorBrands: giftIntel.competitorBrands.length ? giftIntel.competitorBrands : undefined,
    scoutGeo: normalizeScoutGeo(base.scoutGeo),
    scoutAreasOfFocus,
    scoutAreaOfFocus: scoutAreasOfFocus[0] ?? null,
    scoutCompaniesLimit: clampScoutCompaniesLimit(base.scoutCompaniesLimit),
    scoutLeadsLimit: clampScoutLeadsLimit(base.scoutLeadsLimit),
    strictPeopleFilters: Boolean(base.strictPeopleFilters),
  };
}
