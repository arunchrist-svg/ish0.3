import type { DataMode, ScoutCompanyResult, ScoutPersonResult } from "./types";
import type { EnrichmentConfig } from "./config";
import { hasApolloKey, resolveEnrichmentConfig, MAX_SCOUT_LEADS_LIMIT } from "./config";
import { apolloSearchCompanies, apolloSearchPeople, isApolloAuthError } from "./apollo";
import { tavilySearchCompanies } from "./tavily";
import { googlePlacesSearchCompanies, type PlacesLocationBias } from "./google-places";
import { indiaDirectoriesSearchCompanies, indiaDirectoriesSearchPeople } from "./india-directories";
import {
  companyMatchesScoutSelection,
  expandCityMatchTerms,
  expandCitySearchTerms,
  isNationwideSelection,
  includeHqCorridorForScoutPeople,
  mentionsSelectedLocality,
  peopleFilterUsesHqCorridor,
  shouldApplyPlacesFocusBias,
  nearbyLabelsForScoutCities,
  parentCitiesForNeighborhoods,
  rankCompaniesByLocalityMention,
  selectPeopleForLeadLocation,
  selectionLooksLikeNeighborhoods,
} from "./city-search";
import { placesLocationBiasFromFocuses } from "@/lib/geo/area-of-focus";
import { companyDomainAliases } from "./company-domain-aliases";
import { buildRoleTitleHints, filterPeopleByRoles } from "./people-role-filter";
import { rankPeopleForScout, trimPeopleToHighConfidence } from "./people-diversity";
import { applyGoldDensityEarlyStop, sortCompaniesByAccountScore } from "./account-score";
import {
  allowsHqCorridor,
  allowsSoftCityRecover,
  effectiveGeoPolicy,
  scoutQualityProfileFor,
  type ScoutGeoPolicy,
} from "./quality-profile";
import { applySellerPollutionFilter } from "./seller-pollution";
import { loadScoutQualityLearning } from "./quality-learning";
import { isTavilyQuotaError } from "./tavily-client";
import { hasTavilyKeys } from "./tavily-keys";
import { fetchTavilyAccountUsage } from "./tavily-account";
import { allTavilyKeysExhausted, syncSessionKeysFromAccount, takeTavilyKeySwitchMessage } from "./tavily-usage";
import { mapWithConcurrency } from "@/lib/async";
import { db } from "@/db";
import { eq, and, inArray, ilike, or } from "drizzle-orm";
import { accounts, contacts, tenants, workspaces } from "@/db/schema";
import { resolveCompanyDomain } from "./resolve-company-domain";
import { filterCompaniesMatchingQuery, isGeographicEntity } from "./company-name-match";
import { personLooksOpenToWork } from "./person-company-match";
import { withCleanedCompanyName } from "./directory-parser";
import { filterCompaniesWithLlm, shouldSkipCompaniesLlmFilter } from "./filter-companies-llm";
import { filterBySelectedBusinesses } from "./business-match";
import { filterBySelectedIndustries } from "./industry-search";
import {
  type AccountMatchShape,
  filterNewScoutCompanies,
  scoutCompanyMatchesSaved,
} from "@/lib/scout/account-match";
import { listTenantAccountShapes } from "@/lib/scout/save-leads";
import { logScoutQualityEvent, SCOUT_QUALITY_EVENT } from "@/lib/scout/quality-events";
import {
  filterPeopleAgainstGoldDrops,
  formatGoldCasesFewShot,
  goldCasesForPlantCity,
  parsePlantSeatGoldCases,
} from "@/lib/scout/plant-seat-gold";
import { isPlantSeatScout, selectPeoplePlantThenCorridor, corridorOnlyLabels } from "@/lib/scout/plant-seat";
import { loadUserPreferenceProfile } from "@/lib/settings/preference-profile";
import {
  officialWebsiteForScoutCompany,
  rankCompaniesWithOfficialSitesFirst,
} from "./company-domain-quality";
import {
  applyLeadability,
  probeCompanyLeadability,
} from "./company-leadability";
import {
  extractEmployeesFromText,
  normalizeEmployeeBandIds,
  normalizeEmployeeField,
  rankAndFilterByEmployeeBands,
} from "./employee-size";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { isSweetsGiftingSlug } from "@/lib/brand/vertical-catalog";
import {
  defaultIcpSummary,
  expandPeopleFiltersForOffer,
  icpCompanyFilterInstructions,
  resolvePlatformIntent,
  scoutDefaultsForIntent,
} from "@/lib/brand/platform-intent";

const BUYING_TITLES = [
  "Director", "Manager", "Head", "VP", "Vice President",
  "Founder", "CEO", "CTO", "CMO", "COO",
  "Sales Director", "Operations Head", "HR Director",
];

export type DiscoveryResult = {
  companies: ScoutCompanyResult[];
  warnings: string[];
  errors: string[];
  qualityMetrics?: {
    empty: boolean;
    returned: number;
    requested: number;
    earlyStop: string | null;
    softCityRecover: boolean;
  };
};

export type ScoutQualityContext = {
  userId?: string | null;
  sessionId?: string | null;
};

async function loadScoutBrandIcp(workspaceId: string): Promise<{
  icpSummary?: string;
  platformIntent?: ReturnType<typeof resolvePlatformIntent>;
  productSummary?: string;
  buyerPersonas: string[];
  sweetsGifting: boolean;
  verticalPackOrSlug?: string | null;
} | null> {
  try {
    const [email, tenantRow] = await Promise.all([
      getResolvedEmailConfig(workspaceId),
      db
        .select({ slug: tenants.slug })
        .from(workspaces)
        .innerJoin(tenants, eq(tenants.id, workspaces.tenantId))
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    const sweetsGifting =
      isSweetsGiftingSlug(email.brandConfig.brandSlug) ||
      isSweetsGiftingSlug(email.brandConfig.verticalPackId) ||
      isSweetsGiftingSlug(tenantRow?.slug);
    let platformIntent = resolvePlatformIntent(
      email.brandConfig.platformIntent,
      email.brandConfig.verticalPackId ?? email.brandConfig.brandSlug,
    );
    if (sweetsGifting) platformIntent = "corporate_gifting";
    const personas = email.brandConfig.buyerPersonas?.length
      ? email.brandConfig.buyerPersonas
      : scoutDefaultsForIntent(platformIntent).buyerPersonas;
    return {
      platformIntent,
      icpSummary:
        email.brandConfig.websiteInsights?.icpSummary?.trim() || defaultIcpSummary(platformIntent),
      productSummary: email.brandConfig.productSummary,
      buyerPersonas: personas,
      sweetsGifting,
      verticalPackOrSlug:
        email.brandConfig.verticalPackId ?? email.brandConfig.brandSlug ?? tenantRow?.slug ?? null,
    };
  } catch {
    return null;
  }
}

function finalizeScoutCompanies(companies: ScoutCompanyResult[]): ScoutCompanyResult[] {
  return rankCompaniesWithOfficialSitesFirst(companies.map(officialWebsiteForScoutCompany));
}

/**
 * Scout list discovery often returns Zauba names without a website. Google finds
 * aronuniversal.com in one query; resolve those here so tiles and people probe get a domain.
 */
async function hydrateMissingCompanyWebsites(
  companies: ScoutCompanyResult[],
  opts?: { limit?: number; concurrency?: number },
): Promise<ScoutCompanyResult[]> {
  const cap = Math.min(companies.length, Math.max(opts?.limit ?? 12, 1));
  const concurrency = opts?.concurrency ?? 3;
  const head = companies.slice(0, cap);
  const tail = companies.slice(cap);
  const hydrated = await mapWithConcurrency(head, concurrency, async (company) => {
    if (company.domain?.trim() || company.website?.trim()) return company;
    try {
      const resolved = await resolveCompanyDomain({
        companyName: company.name,
        city: company.city ?? undefined,
        allowExternal: true,
      });
      if (!resolved.domain) return company;
      return {
        ...company,
        domain: resolved.domain,
        website: resolved.website ?? `https://www.${resolved.domain}`,
      };
    } catch (e) {
      console.warn("[waterfall:hydrate_website] failed:", company.name, e);
      return company;
    }
  });
  return finalizeScoutCompanies([...hydrated, ...tail]);
}

function tavilyQuotaHit(messages: string[]): boolean {
  return messages.some(isTavilyQuotaError);
}

/** Only stop the batch when Tavily reports every configured key is out of credits. */
let tavilyExhaustionCache: { at: number; exhausted: boolean } | null = null;
const TAVILY_EXHAUSTION_CACHE_MS = 30_000;

/** Below this many city-matched hits, backfill from India registry directories or Places. */
const DIRECTORY_FALLBACK_FLOOR = 8;

async function shouldStopBatchForTavilyQuota(messages: string[]): Promise<boolean> {
  if (!tavilyQuotaHit(messages)) return false;
  if (!hasTavilyKeys()) return true;

  const now = Date.now();
  if (tavilyExhaustionCache && now - tavilyExhaustionCache.at < TAVILY_EXHAUSTION_CACHE_MS) {
    return tavilyExhaustionCache.exhausted;
  }

  const account = await fetchTavilyAccountUsage();
  syncSessionKeysFromAccount(account);
  const exhausted = allTavilyKeysExhausted(account);
  tavilyExhaustionCache = { at: now, exhausted };
  return exhausted;
}

function appendTavilyKeySwitchWarning(warnings: string[]): void {
  const switchMsg = takeTavilyKeySwitchMessage();
  if (switchMsg && !warnings.includes(switchMsg)) {
    warnings.push(switchMsg);
  }
}

function hasGooglePlacesKey(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Preferred cities for LeadScore / location fit (Focus chips + parent district). */
function peoplePreferredCities(params: {
  scoutCities: string[];
  focusParentCities: string[];
  locationScope?: "focus" | "interest";
  peopleCities?: string[];
}): string[] {
  if (params.locationScope === "focus") {
    return [...new Set([...params.scoutCities, ...params.focusParentCities])];
  }
  if (params.peopleCities?.length) return params.peopleCities;
  return params.scoutCities;
}



function filterBySelectedCities(
  results: ScoutCompanyResult[],
  cities: string[],
  searchKind?: "industry" | "business",
  geoPolicy?: ScoutGeoPolicy,
): ScoutCompanyResult[] {
  if (cities.length === 0) return results;
  if (selectionLooksLikeNeighborhoods(cities)) {
    if (geoPolicy === "focus_strict") {
      const kept = results.filter(
        (c) =>
          mentionsSelectedLocality(
            `${c.city ?? ""} ${c.intelNotes ?? ""} ${c.industry ?? ""}`.toLowerCase(),
            cities,
          ) ||
          companyMatchesScoutSelection(c, cities, {
            searchKind,
            geoVerified: c.scoutGeoVerified,
          }),
      );
      return rankCompaniesByLocalityMention(kept, cities);
    }
    return rankCompaniesByLocalityMention(results, cities);
  }
  return rankCompaniesByLocalityMention(
    results.filter((c) =>
      companyMatchesScoutSelection(c, cities, {
        searchKind,
        geoVerified: c.scoutGeoVerified,
      }),
    ),
    cities,
  );
}

function filterExcluded<T extends ScoutCompanyResult>(
  results: T[],
  excludeNames: string[],
  savedAccounts: AccountMatchShape[] = [],
): T[] {
  const excluded = new Set(excludeNames.map(normalizeName));
  const out: T[] = [];
  for (const r of results) {
    const cleaned = withCleanedCompanyName(r);
    if (!cleaned || isGeographicEntity(cleaned.name)) continue;
    if (excluded.size && excluded.has(normalizeName(cleaned.name))) continue;
    if (scoutCompanyMatchesSaved(cleaned, savedAccounts)) continue;
    out.push(cleaned);
  }
  return out;
}

function hydrateEmployees(company: ScoutCompanyResult): ScoutCompanyResult {
  if (normalizeEmployeeField(company.employees)) return company;
  const extracted = extractEmployeesFromText(
    [company.name, company.intelNotes].filter(Boolean).join(" "),
  );
  return extracted ? { ...company, employees: extracted } : company;
}

export async function discoverCompanies(params: {
  tenantId: string;
  workspaceId: string;
  cities: string[];
  industries: string[];
  dataMode?: DataMode;
  config?: Partial<EnrichmentConfig>;
  limit?: number;
  excludeNames?: string[];
  excludeSavedAccounts?: boolean;
  skipInternal?: boolean;
  fetchSeed?: number;
  companyName?: string;
  employeeBands?: string[];
  seniority?: string[];
  departments?: string[];
  locationScope?: "focus" | "interest";
  searchKind?: "industry" | "business";
  /** Emit usable companies as soon as a provider step yields them (streaming Scout). */
  onPartial?: (companies: ScoutCompanyResult[]) => void | Promise<void>;
  qualityContext?: ScoutQualityContext;
}): Promise<DiscoveryResult> {
  const cfg = resolveEnrichmentConfig(params.dataMode, params.config);
  const limit = params.limit ?? parseInt(process.env.PROSPECTING_MAX_RESULTS ?? "25", 10);
  const employeeBands = normalizeEmployeeBandIds(params.employeeBands);
  const useAI = process.env.SCOUT_USE_AI_PROSPECTING !== "false";
  const excludeNames = params.excludeNames ?? [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const isNameSearch = !!params.companyName?.trim();
  const excludeSavedAccounts = params.excludeSavedAccounts ?? !isNameSearch;
  const skipInternal = excludeSavedAccounts ? true : params.skipInternal ?? false;
  let savedAccounts: AccountMatchShape[] = [];
  if (excludeSavedAccounts) {
    try {
      savedAccounts = await listTenantAccountShapes({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });
    } catch (e) {
      console.error("[waterfall:saved_accounts] failed:", e);
      warnings.push("Could not load saved companies to skip duplicates.");
    }
  }
  const searchMeta = { warnings };
  const brandIcp = await loadScoutBrandIcp(params.workspaceId);
  const qualityProfile = scoutQualityProfileFor(
    brandIcp?.platformIntent,
    brandIcp?.verticalPackOrSlug,
  );
  const geoPolicy = effectiveGeoPolicy(qualityProfile, params.locationScope);
  const learning = await loadScoutQualityLearning(params.workspaceId).catch(() => undefined);
  const weightDeltas = learning?.deltasByIntent?.[qualityProfile.intent] ?? null;
  const selectionLabels = params.cities;
  const nationwide = isNationwideSelection(selectionLabels);
  const matchCities = expandCityMatchTerms(selectionLabels);
  // For Focus Area (neighborhood chips), ZaubaCorp needs the parent district city ("Hosur",
  // "Bengaluru") to find registered companies — it does not index by industrial area name.
  // Prefer the user's explicitly configured scoutAreasOfFocus.cityLabel; fall back to
  // LOCALITY_CATALOG lookup for unconfigured edge cases.
  const isNeighborhoodSearch = selectionLooksLikeNeighborhoods(selectionLabels);
  const focusCityLabels: string[] | undefined = isNeighborhoodSearch
    ? (cfg.scoutAreasOfFocus?.length
        ? [...new Set(cfg.scoutAreasOfFocus.map((f) => f.cityLabel).filter(Boolean))]
        : parentCitiesForNeighborhoods(selectionLabels))
    : undefined;
  // Providers that filter by city string (Apollo, Places text search) return nothing for a
  // bare locality, so carry the parent metro alongside the chips. Post-filters still use
  // selectionLabels, so this widens the search without widening what we keep.
  const queryCities = [
    ...new Set([...expandCitySearchTerms(selectionLabels), ...(focusCityLabels ?? [])]),
  ];

  // ── SEARCH MODE: targeted lookup by company name ──────────────────────────
  if (isNameSearch) {
    const nameQuery = params.companyName!.trim();
    const locationHint = queryCities.filter((c) => !isNationwideSelection([c])).slice(0, 2);
    let dbResults: (typeof accounts.$inferSelect)[] = [];
    try {
      dbResults = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, params.tenantId),
            or(
              ilike(accounts.name, `%${nameQuery}%`),
            ),
          ),
        )
        .limit(Math.max(limit * 3, 10));
    } catch (e) {
      console.error("[waterfall:name_search_db] failed:", e);
      warnings.push("Could not search saved companies from the database.");
    }

    const dbMapped = filterExcluded(
      filterCompaniesMatchingQuery(dbResults.map(dbToResult), nameQuery),
      excludeNames,
      savedAccounts,
    );
    const external: ScoutCompanyResult[] = [];

    if (dbMapped.length < limit && !isGeographicEntity(nameQuery)) {
      try {
        const resolved = await resolveCompanyDomain({
          companyName: nameQuery,
          city: locationHint[0],
        });
        if (resolved.domain) {
          external.push({
            name: nameQuery,
            domain: resolved.domain,
            website: resolved.website,
            city: locationHint[0],
            industry: params.industries[0],
            dataSource: resolved.source === "unresolved" ? "tavily+llm" : resolved.source,
            fitScore: 72,
          });
        }
      } catch (e) {
        console.warn("[waterfall:name_search_domain] failed:", e);
      }
    }

    if (dbMapped.length + external.length < limit && !tavilyQuotaHit([...warnings, ...errors])) {
      const remaining = limit - dbMapped.length - external.length;
      await runStep("name_search_tavily", () =>
        tavilySearchCompanies({
          cities: queryCities,
          industries: params.industries,
          limit: remaining,
          meta: searchMeta,
          nameQuery,
        }),
        external, remaining, excludeNames, savedAccounts, warnings, errors,
      );
      appendTavilyKeySwitchWarning(warnings);
    }

    const matched = filterCompaniesMatchingQuery(
      [...dbMapped, ...filterExcluded(external, dbMapped.map((r) => r.name), savedAccounts)],
      nameQuery,
    );
    const lowerQuery = nameQuery.toLowerCase();
    matched.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerQuery ? 0 : a.name.toLowerCase().includes(lowerQuery) ? 1 : 2;
      const bExact = b.name.toLowerCase() === lowerQuery ? 0 : b.name.toLowerCase().includes(lowerQuery) ? 1 : 2;
      return aExact - bExact;
    });

    if (matched.length === 0) {
      const where = locationHint.length ? ` in ${locationHint.join(", ")}` : "";
      warnings.push(`No company matching "${nameQuery}"${where}.`);
    }

    const companies = finalizeScoutCompanies(matched).slice(0, limit);
    void logScoutQualityEvent({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.qualityContext?.userId,
      sessionId: params.qualityContext?.sessionId,
      eventType: SCOUT_QUALITY_EVENT.companiesCompleted,
      metadata: {
        mode: "search",
        requested: limit,
        returned: companies.length,
        empty: companies.length === 0,
      },
    });
    return {
      companies,
      warnings: [...new Set(warnings)],
      errors: [...new Set(errors)],
      qualityMetrics: {
        empty: companies.length === 0,
        returned: companies.length,
        requested: limit,
        earlyStop: null,
        softCityRecover: false,
      },
    };
  }

  // ── AUTOPILOT MODE: broad discovery ──────────────────────────────────────

  let dbResults: (typeof accounts.$inferSelect)[] = [];

  // ── Step 1: Internal DB (skip when loading more external results) ─────────
  if (!skipInternal) {
    try {
      dbResults = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, params.tenantId),
            params.cities.length > 0 && !nationwide
              ? inArray(accounts.city, matchCities.slice(0, 120))
              : undefined,
          ),
        )
        .limit(limit);
    } catch (e) {
      console.error("[waterfall:internal_db] failed:", e);
      warnings.push("Could not read saved companies from the database.");
    }
  }

  const dbMapped = filterExcluded(dbResults.map(dbToResult), excludeNames, savedAccounts);
  const rankedDb = rankAndFilterByEmployeeBands(dbMapped, employeeBands);
  const knownDbMatches = rankedDb.companies.length - rankedDb.unknownCount;

  if (!employeeBands.length && dbMapped.length >= limit) {
    return { companies: dbMapped.slice(0, limit), warnings, errors };
  }
  if (employeeBands.length && knownDbMatches >= limit) {
    return { companies: rankedDb.companies.slice(0, limit), warnings, errors };
  }

  const remaining = Math.max(limit - (employeeBands.length ? knownDbMatches : dbMapped.length), 0) || limit;
  const stepLimit = Math.min(Math.max(remaining * 2, remaining + 8), 120);
  const searchKind = params.searchKind ?? "industry";
  const useFocusBias = shouldApplyPlacesFocusBias(params.locationScope, selectionLabels);
  const focusesForBias = cfg.scoutAreasOfFocus?.length
    ? cfg.scoutAreasOfFocus
    : cfg.scoutAreaOfFocus
      ? [cfg.scoutAreaOfFocus]
      : [];
  const locationBias: PlacesLocationBias | undefined = useFocusBias
    ? placesLocationBiasFromFocuses(focusesForBias, selectionLabels)
    : undefined;
  const external: ScoutCompanyResult[] = [];
  const providerParams = {
    cities: queryCities,
    industries: params.industries,
    limit: stepLimit,
    employeeBands,
    searchKind,
    fetchSeed: params.fetchSeed ?? 0,
    ...(locationBias ? { locationBias } : {}),
  };
  const fillFloor = Math.min(limit, Math.max(DIRECTORY_FALLBACK_FLOOR, Math.ceil(limit * 0.5)));
  const discardedByCity: ScoutCompanyResult[] = [];
  const cityUsable = (rows: ScoutCompanyResult[]) => {
    const cityed = filterBySelectedCities(rows, selectionLabels, searchKind, geoPolicy);
    return searchKind === "business"
      ? filterBySelectedBusinesses(cityed, params.industries)
      : filterBySelectedIndustries(cityed, params.industries);
  };
  /** Free slot capacity for later providers; stash city misses for soft-fail recovery. */
  const keepCityUsableExternal = () => {
    if (selectionLooksLikeNeighborhoods(selectionLabels)) return;
    const kept: ScoutCompanyResult[] = [];
    for (const row of external) {
      if (cityUsable([row]).length > 0) kept.push(row);
      else discardedByCity.push(row);
    }
    external.splice(0, external.length, ...kept);
  };

  // ── Step 2: Primary search provider (resolved from dataMode) ─────────────
  switch (cfg.searchProvider) {
    case "india_directories":
      await runStep("india_directories", () =>
        indiaDirectoriesSearchCompanies({
          ...providerParams,
          meta: searchMeta,
          fetchSeed: params.fetchSeed,
          ...(focusCityLabels ? { focusCityLabels } : {}),
        }),
        external, stepLimit, excludeNames, savedAccounts, warnings, errors,
      );
      break;

    case "google_places":
      await runStep("google_places", () =>
        googlePlacesSearchCompanies(providerParams),
        external, stepLimit, excludeNames, savedAccounts, warnings, errors,
      );
      break;

    case "apollo":
      await runStep("apollo", () =>
        apolloSearchCompanies(providerParams),
        external, stepLimit, excludeNames, savedAccounts, warnings, errors,
      );
      break;

    case "tavily_ai":
      await runStep("tavily_ai", () =>
        tavilySearchCompanies({
          ...providerParams,
          meta: searchMeta,
        }),
        external, stepLimit, excludeNames, savedAccounts, warnings, errors,
      );
      break;
  }

  // Scout under Focus Area: supplement directory/Tavily hits with geo-biased Places.
  // Only when the selected chips are neighborhoods. District clusters must not
  // inherit a leftover Kasturi Nagar / Bengaluru pin.
  if (locationBias && cfg.searchProvider !== "google_places" && hasGooglePlacesKey()) {
    const placesLimit = Math.max(stepLimit - cityUsable(external).length, Math.min(limit, 20));
    if (placesLimit > 0) {
      await runStep(
        "google_places_focus",
        () =>
          googlePlacesSearchCompanies({
            ...providerParams,
            limit: placesLimit,
          }),
        external,
        stepLimit,
        excludeNames,
        savedAccounts,
        warnings,
        errors,
      );
    }
  }

  keepCityUsableExternal();

  // Tier-2/3 cities return thin results from Apollo/Tavily/Places. Registry directories
  // (Zauba, Tofler) index them far better, so backfill whenever city-matched hits are short.
  if (
    cityUsable(external).length < fillFloor &&
    cfg.searchProvider !== "india_directories" &&
    !tavilyQuotaHit([...warnings, ...errors])
  ) {
    const fallbackLimit = Math.max(stepLimit - external.length, limit);
    await runStep(
      "india_directories_fallback",
      () =>
        indiaDirectoriesSearchCompanies({
          ...providerParams,
          limit: fallbackLimit,
          meta: searchMeta,
          fetchSeed: params.fetchSeed,
          ...(focusCityLabels ? { focusCityLabels } : {}),
        }),
      external,
      stepLimit,
      excludeNames,
      savedAccounts,
      warnings,
      errors,
    );
    keepCityUsableExternal();
  }

  appendTavilyKeySwitchWarning(warnings);

  // Only hit Tavily usage API on quota errors — avoids multi-second stalls on every Scout.
  const quotaHitAfterPrimary = tavilyQuotaHit([...warnings, ...errors]);
  const tavilyAccount =
    quotaHitAfterPrimary && hasTavilyKeys() ? await fetchTavilyAccountUsage() : [];

  // Places fill: Tavily quota, or a one-company Tavily hit on a district cluster.
  // Drop leftover Focus Area locationBias so Madras+6 is not pinned to Bengaluru.
  if (cityUsable(external).length < fillFloor && hasGooglePlacesKey()) {
    const placesFillLimit = Math.max(stepLimit - external.length, limit);
    if (placesFillLimit > 0) {
      const beforePlaces = external.length;
      await runStep(
        "google_places_fallback",
        () =>
          googlePlacesSearchCompanies({
            ...providerParams,
            limit: placesFillLimit,
            ...(useFocusBias && locationBias ? { locationBias } : { locationBias: undefined }),
          }),
        external,
        stepLimit,
        excludeNames,
        savedAccounts,
        warnings,
        errors,
      );
      keepCityUsableExternal();
      if (
        quotaHitAfterPrimary &&
        allTavilyKeysExhausted(tavilyAccount) &&
        external.length > beforePlaces
      ) {
        const keptWarnings = warnings.filter((w) => !isTavilyQuotaError(w));
        warnings.length = 0;
        warnings.push(...keptWarnings, "All Tavily keys exhausted. Switched to Google Places for company discovery.");
        const keptErrors = errors.filter((e) => !isTavilyQuotaError(e));
        errors.length = 0;
        errors.push(...keptErrors);
      }
    }
  } else if (
    cityUsable(external).length === 0 &&
    quotaHitAfterPrimary &&
    allTavilyKeysExhausted(tavilyAccount) &&
    !hasGooglePlacesKey() &&
    !errors.some((e) => isTavilyQuotaError(e))
  ) {
    errors.push(
      "All Tavily keys exhausted. Add more keys (TAVILY_API_KEY_2, TAVILY_API_KEY_3, ...) or TAVILY_API_KEYS in .env.local, set GOOGLE_PLACES_API_KEY, or wait for monthly reset.",
    );
  }

  // ── Step 3: Fallback to AI (Tavily+Gemini) if enabled and results short ──
  if (
    useAI &&
    cfg.fallbackToAI &&
    cityUsable(external).length < Math.floor(remaining * 0.5) &&
    cfg.searchProvider !== "tavily_ai" &&
    !tavilyQuotaHit([...warnings, ...errors])
  ) {
    await runStep("tavily_ai_fallback", () =>
      tavilySearchCompanies({
        cities: queryCities,
        industries: params.industries,
        limit: Math.max(stepLimit - external.length, 1),
        meta: searchMeta,
        employeeBands,
        searchKind,
      }),
      external, stepLimit, excludeNames, savedAccounts, warnings, errors,
    );
    keepCityUsableExternal();
    appendTavilyKeySwitchWarning(warnings);
  }

  const merged = [...dbMapped, ...external]
    .map(withCleanedCompanyName)
    .filter((c): c is ScoutCompanyResult => c != null && !isGeographicEntity(c.name))
    .map(hydrateEmployees);
  let cityFiltered = filterBySelectedCities(merged, selectionLabels, params.searchKind ?? "industry", geoPolicy);
  let softCityFail = false;
  if (
    allowsSoftCityRecover(geoPolicy) &&
    cityFiltered.length === 0 &&
    selectionLabels.length > 0 &&
    !nationwide &&
    (merged.length > 0 || discardedByCity.length > 0)
  ) {
    softCityFail = true;
    const recovered = [...merged, ...discardedByCity]
      .map(withCleanedCompanyName)
      .filter((c): c is ScoutCompanyResult => c != null && !isGeographicEntity(c.name))
      .map(hydrateEmployees);
    cityFiltered = rankCompaniesByLocalityMention(recovered, selectionLabels);
    warnings.push(
      `Found ${cityFiltered.length} candidate${cityFiltered.length === 1 ? "" : "s"} but none had a verified city matching ${selectionLabels.slice(0, 4).join(", ")}${selectionLabels.length > 4 ? ", and more" : ""}. Showing best available matches.`,
    );
  }
  const verticalFiltered =
    params.searchKind === "business"
      ? filterBySelectedBusinesses(cityFiltered, params.industries)
      : filterBySelectedIndustries(cityFiltered, params.industries);
  const ranked = rankAndFilterByEmployeeBands(verticalFiltered, employeeBands);
  // Restrictive scale filters: smaller overfetch so less work feeds the LLM gate.
  const overfetchTarget = employeeBands.length
    ? limit + 8
    : Math.max(limit * 2, limit + 25);
  const overfetch = Math.min(overfetchTarget, ranked.companies.length);
  let companies = ranked.companies.slice(0, overfetch);

  if (params.onPartial && companies.length) {
    const partial = filterNewScoutCompanies(companies.slice(0, limit), savedAccounts);
    if (partial.length) await params.onPartial(partial);
  }

  // Second directory pass only when nearly empty — Large scale soft-filter used to
  // trigger a full duplicate Tavily+LLM cycle for little gain.
  if (
    companies.length < 2 &&
    cfg.searchProvider === "india_directories" &&
    !tavilyQuotaHit([...warnings, ...errors])
  ) {
    const extra: ScoutCompanyResult[] = [];
    const extraLimit = Math.min(Math.max(limit * 2, 16), 80);
    await runStep(
      "india_directories_more",
      () =>
        indiaDirectoriesSearchCompanies({
          cities: queryCities,
          industries: params.industries,
          limit: extraLimit,
          meta: searchMeta,
          fetchSeed: (params.fetchSeed ?? 0) + 1,
          employeeBands,
          searchKind: params.searchKind ?? "industry",
          ...(focusCityLabels ? { focusCityLabels } : {}),
        }),
      extra,
      extraLimit,
      [...excludeNames, ...companies.map((c) => c.name)],
      savedAccounts,
      warnings,
      errors,
    );
    const extraRanked = rankAndFilterByEmployeeBands(
      filterBySelectedCities(
        [...companies, ...extra]
          .map(withCleanedCompanyName)
          .filter((c): c is ScoutCompanyResult => c != null && !isGeographicEntity(c.name))
          .map(hydrateEmployees),
        selectionLabels,
        params.searchKind ?? "industry",
        geoPolicy,
      ),
      employeeBands,
    );
    companies = extraRanked.companies.slice(0, overfetchTarget);
    appendTavilyKeySwitchWarning(warnings);
    if (params.onPartial && companies.length) {
      const partial = filterNewScoutCompanies(companies.slice(0, limit), savedAccounts);
      if (partial.length) await params.onPartial(partial);
    }
  }

  const businessLabels =
    params.searchKind === "business"
      ? params.industries.map((s) => s.trim()).filter(Boolean)
      : [];
  const businessIcp =
    businessLabels.length > 0
      ? `Selected establishment types only: ${businessLabels.join(", ")}. Drop restaurants, cafes, food shops, retail stores, and anything that is not one of those types.`
      : null;
  const icpMeta = {
    warnings,
    icpSummary: [brandIcp?.icpSummary, businessIcp].filter(Boolean).join("\n") || brandIcp?.icpSummary,
    platformIntent: brandIcp?.platformIntent,
    productSummary: brandIcp?.productSummary,
  };
  companies = finalizeScoutCompanies(companies);
  const runIcpGate = Boolean(icpCompanyFilterInstructions(icpMeta));
  if (runIcpGate || !shouldSkipCompaniesLlmFilter(companies, limit)) {
    const beforeLlmFilter = companies;
    companies = finalizeScoutCompanies(await filterCompaniesWithLlm(companies, icpMeta));
    // Backstop: never surface zero when the pipeline had candidates going in.
    if (companies.length === 0 && beforeLlmFilter.length > 0) {
      warnings.push("AI company filter returned no results. Showing unfiltered candidates.");
      companies = beforeLlmFilter.slice(0, overfetchTarget);
    }
  } else {
    companies = companies.slice(0, overfetchTarget);
  }

  companies = applySellerPollutionFilter(companies, qualityProfile, params.searchKind);

  if (!tavilyQuotaHit([...warnings, ...errors])) {
    companies = await hydrateMissingCompanyWebsites(companies, {
      limit: Math.min(companies.length, Math.max(limit, 10)),
      concurrency: 3,
    });
  }

  const selectedSeniority = params.seniority ?? [];
  const selectedDepartments = params.departments ?? [];
  // Corporate modes: probe reachability using scout roles or pack defaults so AccountScore
  // can rank even when the UI left seniority empty (dept-first stacks).
  const probeRoles = cfg.strictPeopleFilters
    ? {
        seniority: selectedSeniority,
        departments: selectedDepartments,
        expanded: false as const,
      }
    : expandPeopleFiltersForOffer(
        brandIcp?.platformIntent,
        selectedSeniority,
        selectedDepartments,
        {
          treatAsGifting: brandIcp?.sweetsGifting,
          searchKind: params.searchKind,
          businesses: params.searchKind === "business" ? params.industries : undefined,
        },
      );
  const shouldProbeLeadability =
    params.searchKind !== "business" &&
    companies.length > 0 &&
    (probeRoles.departments.length > 0 || probeRoles.seniority.length > 0);

  if (shouldProbeLeadability) {
    const probeCount = Math.min(companies.length, Math.max(limit, Math.min(limit + 6, 16)));
    let quotaStop = false;
    const unknownLeadability = {
      leadabilityScore: 0,
      leadabilityBand: "unknown" as const,
      leadabilityMatchedPeople: 0,
      leadabilityMatchedInCity: 0,
    };
    const probed = await mapWithConcurrency(companies.slice(0, probeCount), 4, async (company) => {
      if (quotaStop) return applyLeadability(company, unknownLeadability);
      try {
        const leadability = await probeCompanyLeadability({
          company,
          seniority: probeRoles.seniority,
          departments: probeRoles.departments,
          cities: selectionLabels,
          platformIntent: brandIcp?.platformIntent,
          treatAsGifting: brandIcp?.sweetsGifting,
          searchKind: params.searchKind,
          businesses: params.searchKind === "business" ? params.industries : undefined,
          locationScope: params.locationScope,
        });
        return applyLeadability(company, leadability);
      } catch (e) {
        const msg = stepFailureMessage("leadability_probe", e);
        if (isTavilyQuotaError(msg)) quotaStop = true;
        return applyLeadability(company, unknownLeadability);
      }
    });
    companies = [
      ...probed,
      ...companies.slice(probeCount).map((company) =>
        applyLeadability(company, {
          leadabilityScore: 0,
          leadabilityBand: "unknown",
          leadabilityMatchedPeople: 0,
          leadabilityMatchedInCity: 0,
        }),
      ),
    ];
  }

  const rankedAccounts = sortCompaniesByAccountScore(companies, {
    profile: qualityProfile,
    selectedCities: selectionLabels,
    employeeBands,
    selectedIndustries: params.industries,
    locationScope: params.locationScope,
    searchKind: params.searchKind ?? "industry",
    geoPolicy,
    weightDeltas,
  });
  const goldCut = applyGoldDensityEarlyStop(rankedAccounts, {
    limit,
    enabled: !isNameSearch,
  });
  companies = goldCut.companies;
  if (goldCut.earlyStop) {
    warnings.push("Stopped adding lower-fit companies once gold density flattened.");
  }

  if (merged.length > 0 && cityFiltered.length === 0 && selectionLabels.length > 0 && !nationwide && !softCityFail) {
    warnings.push(
      `Found ${merged.length} candidate${merged.length === 1 ? "" : "s"} but none had a verified city matching ${selectionLabels.join(", ")}. Try a nearby city or leave industries unselected.`,
    );
  } else if (employeeBands.length && cityFiltered.length > 0 && companies.length === 0) {
    warnings.push(
      `Found ${cityFiltered.length} candidate${cityFiltered.length === 1 ? "" : "s"} but none matched the selected company scale. Try a wider scale range.`,
    );
  } else if (companies.length < limit && companies.length > 0) {
    warnings.push(
      `Found ${companies.length} of ${limit} companies for these filters. Load more or widen city or scale.`,
    );
  }

  companies = filterNewScoutCompanies(companies, savedAccounts);
  if (
    excludeSavedAccounts &&
    savedAccounts.length &&
    merged.length > 0 &&
    companies.length === 0 &&
    !warnings.some((w) => /already saved/i.test(w))
  ) {
    warnings.push(
      "All matches were companies you already saved. Load more or try different cities or industries.",
    );
  }

  const qualityMetrics = {
    empty: companies.length === 0,
    returned: companies.length,
    requested: limit,
    earlyStop: goldCut.earlyStop ? "gold_density" : null,
    softCityRecover: softCityFail,
  };
  void logScoutQualityEvent({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.qualityContext?.userId,
    sessionId: params.qualityContext?.sessionId,
    eventType: SCOUT_QUALITY_EVENT.companiesCompleted,
    metadata: {
      mode: "autopilot",
      ...qualityMetrics,
      geoPolicy,
      sellerPollution: qualityProfile.sellerPollution,
    },
  });

  return {
    companies,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    qualityMetrics,
  };
}

export type PeopleDiscoveryResult = {
  people: ScoutPersonResult[];
  resolvedDomain?: string;
  resolvedWebsite?: string;
  warnings: string[];
  errors: string[];
  qualityMetrics?: {
    empty: boolean;
    returned: number;
    requested: number;
    goldKept: number;
    goldShown: number;
    broadenStages: string[];
  };
};

function finishPeopleDiscovery(params: {
  tenantId: string;
  workspaceId: string;
  qualityContext?: ScoutQualityContext;
  ranked: ScoutPersonResult[];
  limit: number;
  resolvedDomain?: string;
  resolvedWebsite?: string;
  warnings: string[];
  errors: string[];
  broadenStages: string[];
}): PeopleDiscoveryResult {
  const goldKept = params.ranked.filter((p) => (p.matchScore ?? 0) >= 35).length;
  const people = trimPeopleToHighConfidence(params.ranked, params.limit);
  const qualityMetrics = {
    empty: people.length === 0,
    returned: people.length,
    requested: params.limit,
    goldKept,
    goldShown: people.length,
    broadenStages: params.broadenStages,
  };
  void logScoutQualityEvent({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.qualityContext?.userId,
    sessionId: params.qualityContext?.sessionId,
    eventType: SCOUT_QUALITY_EVENT.peopleCompleted,
    metadata: qualityMetrics,
  });
  return {
    people,
    resolvedDomain: params.resolvedDomain,
    resolvedWebsite: params.resolvedWebsite,
    warnings: [...new Set(params.warnings)],
    errors: [...new Set(params.errors)],
    qualityMetrics,
  };
}

function accountNameMatches(stored: string, target: string): boolean {
  const clean = (s: string) =>
    normalizeName(s)
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(pvt|ltd|limited|llp|inc|corp)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = clean(stored);
  const b = clean(target);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export async function discoverPeople(params: {
  tenantId: string;
  workspaceId: string;
  companyName: string;
  companyDomain?: string;
  companyWebsite?: string;
  dataMode?: DataMode;
  config?: Partial<EnrichmentConfig>;
  limit?: number;
  seniority?: string[];
  departments?: string[];
  cities?: string[];
  tenantAccounts?: (typeof accounts.$inferSelect)[];
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
  /** Optional explicit people-area filter (e.g. ["South India"]). When set, people must be
   *  located in this area regardless of company city. Defaults to the company scout cities. */
  peopleCities?: string[];
  qualityContext?: ScoutQualityContext;
}): Promise<PeopleDiscoveryResult> {
  const cfg = resolveEnrichmentConfig(params.dataMode, params.config);
  const limit = Math.max(1, Math.min(params.limit ?? 15, MAX_SCOUT_LEADS_LIMIT));
  // Headroom for role + city filters. Plant-city scouts with buyer-dept filters often
  // discard most raw Tavily hits, so we fetch more candidates up front.
  const fetchLimit = Math.min(18, Math.max(limit + 5, limit));
  const warnings: string[] = [];
  const errors: string[] = [];
  const scoutCities = params.cities ?? [];
  const hasDomainHint = Boolean(params.companyDomain || params.companyWebsite);
  const [domainResolution, brandIcp] = await Promise.all([
    resolveCompanyDomain({
      companyName: params.companyName,
      domain: params.companyDomain,
      website: params.companyWebsite,
      city: scoutCities[0],
      allowExternal: !hasDomainHint,
    }),
    loadScoutBrandIcp(params.workspaceId),
  ]);
  const resolvedDomain = domainResolution.domain;
  const resolvedWebsite = domainResolution.website ?? params.companyWebsite;
  if (domainResolution.source !== "provided" && domainResolution.source !== "unresolved" && resolvedDomain) {
    warnings.push(`Resolved domain for ${params.companyName}: ${resolvedDomain} (${domainResolution.source})`);
  } else if (!resolvedDomain) {
    warnings.push(`No website domain for ${params.companyName}. People search may be less accurate.`);
  }
  const localOperators = params.searchKind === "business";
  const qualityProfile = scoutQualityProfileFor(
    brandIcp?.platformIntent,
    brandIcp?.verticalPackOrSlug,
  );
  const geoPolicy = effectiveGeoPolicy(qualityProfile, params.locationScope);
  const includeHqCorridor = includeHqCorridorForScoutPeople({
    cities: scoutCities,
    locationScope: params.locationScope,
    localOperators,
    allowHqCorridor: allowsHqCorridor(geoPolicy),
  });
  const focusArea =
    params.locationScope === "focus" || selectionLooksLikeNeighborhoods(scoutCities);
  // In Focus Area mode, people must be physically in the focus area.
  // Build a city list that includes the neighborhood chips AND their parent district city
  // (e.g. "Hosur" when chips are "SIPCOT Hosur") so LinkedIn profiles that say just
  // "Hosur" still match the filter. This overrides the global peopleCities setting
  // which would otherwise return people from anywhere in "South India".
  const focusAreaIsNeighborhood = selectionLooksLikeNeighborhoods(scoutCities);
  const focusParentCities: string[] =
    params.locationScope === "focus" && focusAreaIsNeighborhood
      ? (cfg.scoutAreasOfFocus?.length
          ? [...new Set(cfg.scoutAreasOfFocus.map((f) => f.cityLabel).filter(Boolean))]
          : parentCitiesForNeighborhoods(scoutCities))
      : focusAreaIsNeighborhood
        ? parentCitiesForNeighborhoods(scoutCities)
        : [];
  const roleOpts = {
    searchKind: params.searchKind,
    businesses: params.businesses,
    strict: Boolean(cfg.strictPeopleFilters),
  };
  const expandedRoles = cfg.strictPeopleFilters
    ? {
        seniority: params.seniority ?? [],
        departments: params.departments ?? [],
        expanded: false as const,
        note: "Strict people filters: using your seniority and department chips only.",
      }
    : expandPeopleFiltersForOffer(
        brandIcp?.platformIntent,
        params.seniority ?? [],
        params.departments ?? [],
        { treatAsGifting: brandIcp?.sweetsGifting, searchKind: params.searchKind, businesses: params.businesses },
      );
  const activeSeniority = expandedRoles.seniority;
  const activeDepartments = expandedRoles.departments;
  const sweetsGiftingPeople =
    Boolean(brandIcp?.sweetsGifting) && !localOperators && !cfg.strictPeopleFilters;
  const broadenStages: string[] = [];
  const allowPeopleBroaden = qualityProfile.broadenPeopleWhenEmpty && !cfg.strictPeopleFilters;
  const plantSeatMode = isPlantSeatScout(scoutCities) && !localOperators;
  // Plant-first: search the plant city before corridor HQ. Neighborhood Focus still
  // includes parent metro in the query. Non-plant scouts keep prior corridor behavior.
  const peopleSearchCities = plantSeatMode
    ? scoutCities.map((c) => c.trim()).filter(Boolean)
    : includeHqCorridor
      ? nearbyLabelsForScoutCities(scoutCities)
      : [...new Set([...scoutCities.map((c) => c.trim()).filter(Boolean), ...focusParentCities])];
  const roleHints = buildRoleTitleHints(activeSeniority, activeDepartments, roleOpts);
  if (expandedRoles.note) warnings.push(expandedRoles.note);

  let goldFewShot = "";
  let goldCases = parsePlantSeatGoldCases([]);
  try {
    const profile = await loadUserPreferenceProfile(params.workspaceId);
    goldCases = parsePlantSeatGoldCases(profile.plantSeatGoldCases);
    if (plantSeatMode && scoutCities[0]) {
      goldFewShot = formatGoldCasesFewShot(goldCasesForPlantCity(goldCases, scoutCities[0]!));
    }
  } catch (e) {
    console.warn("[waterfall:gold_cases] load failed:", e);
  }

  // ── Step 1: Internal DB contacts for this company ───────────────────────
  let companyContacts: (typeof contacts.$inferSelect)[] = [];
  try {
    const tenantAccounts =
      params.tenantAccounts ??
      (await db.select().from(accounts).where(eq(accounts.tenantId, params.tenantId)));

    const account = tenantAccounts.find((a) => accountNameMatches(a.name, params.companyName));
    if (account) {
      companyContacts = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.tenantId, params.tenantId), eq(contacts.accountId, account.id)))
        .limit(fetchLimit);
    }
  } catch (e) {
    console.error("[waterfall:internal_contacts] failed:", e);
    warnings.push("Could not read saved contacts from the database.");
  }

  if (companyContacts.length >= fetchLimit) {
    const filtered = filterPeopleByRoles(
      companyContacts.map(contactToResult),
      activeSeniority,
      activeDepartments,
      roleOpts,
    );
    let localized = filtered.people;
    if (scoutCities.length) {
      if (plantSeatMode) {
        localized = selectPeoplePlantThenCorridor(filtered.people, scoutCities).people;
      } else {
        localized = selectPeopleForLeadLocation(filtered.people, scoutCities, { includeHqCorridor }).people;
      }
    }
    // Saved HQ contacts in Delhi/Mumbai must not short-circuit a plant-city scout.
    if (localized.length > 0 || !scoutCities.length) {
      if (filtered.people.length === 0 && (activeSeniority.length > 0 || activeDepartments.length > 0)) {
        warnings.push(
          sweetsGiftingPeople
            ? `No HR or Procurement people found at ${params.companyName}${scoutCities.length ? ` in ${scoutCities.join(", ")}` : ""}.`
            : "No contacts match the selected seniority and department filters for this company.",
        );
      } else if (filtered.relaxed && !sweetsGiftingPeople) {
        warnings.push(
          "Few exact seniority + department matches. Showing closest decision-makers for this company.",
        );
      }
      const ranked = rankPeopleForScout(localized, {
        seniority: activeSeniority,
        departments: activeDepartments,
        buyerPersonas: brandIcp?.buyerPersonas,
        preferredCities: peoplePreferredCities({
          scoutCities,
          focusParentCities,
          locationScope: params.locationScope,
          peopleCities: params.peopleCities,
        }),
        preferDmTitles: qualityProfile.preferDmTitles,
      });
      return finishPeopleDiscovery({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        qualityContext: params.qualityContext,
        ranked,
        limit,
        resolvedDomain,
        resolvedWebsite,
        warnings,
        errors,
        broadenStages,
      });
    }
  }

  const remaining = fetchLimit - companyContacts.length;
  const external: ScoutPersonResult[] = [];
  const domainAliases = companyDomainAliases({
    companyName: params.companyName,
    domain: resolvedDomain,
    extraDomains: domainResolution.aliases,
  });
  const apolloDomain = resolvedDomain ?? domainAliases[0];

  // ── Step 2: Primary people search ────────────────────────────────────────
  const effectiveTitles = roleHints.length > 0 ? roleHints : BUYING_TITLES;

  const pullApolloPeople = async () => {
    if (!apolloDomain) return;
    const apolloPeople = await apolloSearchPeople({
      companyDomain: apolloDomain,
      companyDomains: domainAliases,
      titles: effectiveTitles,
      limit: remaining,
    });
    const seen = new Set(external.map((p) => normalizeName(p.name)));
    for (const person of apolloPeople) {
      if (external.length >= remaining) break;
      const key = normalizeName(person.name);
      if (seen.has(key)) continue;
      external.push(person);
      seen.add(key);
    }
  };

  if (cfg.searchProvider === "apollo" && apolloDomain) {
    try {
      await pullApolloPeople();
    } catch (e) {
      if (isApolloAuthError(e)) {
        warnings.push("Apollo key invalid, using web search.");
      } else {
        errors.push(stepFailureMessage("apollo_people", e));
      }
    }
  }

  if (external.length === 0) {
    if (cfg.searchProvider === "apollo" && !resolvedDomain) {
      warnings.push(`No website domain for ${params.companyName}. Searching LinkedIn instead of Apollo.`);
    }
    await runStep(
      "people_search",
      () =>
        indiaDirectoriesSearchPeople({
          companyName: params.companyName,
          companyDomain: resolvedDomain,
          limit: remaining,
          roleHints: roleHints.length > 0 ? roleHints : undefined,
          cities: peopleSearchCities.length ? peopleSearchCities : params.cities,
          localOperators,
          locationScope: params.locationScope,
          strictPeopleFilters: cfg.strictPeopleFilters,
          plantSeatPhase: plantSeatMode ? "plant" : undefined,
          goldFewShot: goldFewShot || undefined,
        }),
      external,
      remaining,
      [],
      [],
      warnings,
      errors,
    );
    appendTavilyKeySwitchWarning(warnings);
  }

  if (external.length === 0 && hasApolloKey() && cfg.searchProvider !== "apollo" && apolloDomain) {
    try {
      await pullApolloPeople();
    } catch (e) {
      if (isApolloAuthError(e)) {
        warnings.push("Apollo key invalid, using web search.");
      } else {
        errors.push(stepFailureMessage("apollo_people", e));
      }
    }
  }

  if (external.length === 0) {
    const combined = [...warnings, ...errors];
    const quotaHit = tavilyQuotaHit(combined);
    const hasActionable = combined.some((m) =>
      /missing|failed|quota|usage limit|exhausted|rejected|people search needs tavily|switched to (?:backup|next) key/i.test(m),
    );

    // Only hit Tavily usage API when we actually saw a quota error — otherwise this
    // adds multi-second stalls on every empty company during a 20-company fetch.
    const tavilyAccount =
      quotaHit && hasTavilyKeys() ? await fetchTavilyAccountUsage() : [];

    if (quotaHit && allTavilyKeysExhausted(tavilyAccount)) {
      const allExhaustedMsg =
        "All Tavily keys exhausted for people search. Add more keys (TAVILY_API_KEY_2, ...) or TAVILY_API_KEYS in .env.local, switch to Apollo mode, or wait for monthly reset.";
      if (!combined.some((m) => /all tavily keys exhausted/i.test(m))) {
        errors.push(allExhaustedMsg);
      }
    } else if (quotaHit) {
      const quotaMsg = combined.find(isTavilyQuotaError);
      if (quotaMsg && !warnings.some(isTavilyQuotaError)) {
        warnings.push(quotaMsg);
      }
    } else if (!hasTavilyKeys()) {
      errors.push("TAVILY_API_KEY is missing. Add it in .env.local to search LinkedIn for decision-makers.");
    } else if (!hasActionable) {
      if (!resolvedDomain) {
        warnings.push(
          `No decision-makers found for ${params.companyName}. Add a company website for better LinkedIn matching, or try larger brands (e.g. Bosch, Infosys).`,
        );
      } else {
        warnings.push(
          `No LinkedIn profiles found for ${params.companyName}. Try well-known brands with public LinkedIn presence, or verify the company name and website.`,
        );
      }
    }
  }

  // Email/phone enrichment runs on save (save-leads.ts) — skip here for faster scout preview.

  // ── Step 3: Filter by buyer roles, then by city ──────────────────────────
  // For sweets gifting: role filter must come FIRST so city relaxation only sees buyer-dept people.
  // A Finance Director in Bangalore is NOT a valid relaxation for a Hosur plant scout.
  const allPeople = [...companyContacts.map(contactToResult), ...external];
  let roleFilteredPeople: ScoutPersonResult[];
  if (localOperators || activeSeniority.length > 0 || activeDepartments.length > 0) {
    const filtered = filterPeopleByRoles(allPeople, activeSeniority, activeDepartments, roleOpts);
    roleFilteredPeople = filtered.people;
    if (roleFilteredPeople.length === 0 && allPeople.length > 0) {
      if (localOperators) {
        warnings.push(
          `No branch or local senior people found at ${params.companyName}${scoutCities.length ? ` in ${scoutCities.join(", ")}` : ""}.`,
        );
      } else if (sweetsGiftingPeople) {
        warnings.push(
          `No HR, Procurement, Admin, or Facilities people found at ${params.companyName}. LinkedIn may not list plant-level HR publicly — try a larger brand in this city.`,
        );
      } else {
        warnings.push("No contacts match the selected seniority and department filters for this company.");
      }
    } else if (filtered.relaxed && !sweetsGiftingPeople && !localOperators) {
      warnings.push(
        "Few exact seniority + department matches. Showing closest decision-makers for this company.",
      );
    }
  } else {
    roleFilteredPeople = allPeople;
  }

  // Controlled broaden (pack): when seniority+dept returned nobody, retry departments only once.
  if (
    allowPeopleBroaden &&
    !localOperators &&
    roleFilteredPeople.length === 0 &&
    allPeople.length > 0 &&
    activeSeniority.length > 0 &&
    activeDepartments.length > 0
  ) {
    const deptOnly = filterPeopleByRoles(allPeople, [], activeDepartments, roleOpts);
    if (deptOnly.people.length > 0) {
      roleFilteredPeople = deptOnly.people;
      broadenStages.push("dept_only");
      warnings.push(
        "No exact seniority matches. Showing department decision-makers for this company.",
      );
    }
  }

  let finalPeople = roleFilteredPeople;
  finalPeople = filterPeopleAgainstGoldDrops(finalPeople, params.companyName, goldCases);

  // Neighborhood Focus Area: keep parent-metro HQ (Bengaluru for Kasturi Nagar).
  // LinkedIn almost never lists the ward name. Do not widen to the whole state.
  const peopleCityFilter = peoplePreferredCities({
    scoutCities,
    focusParentCities,
    locationScope: params.locationScope,
    peopleCities: params.peopleCities,
  });
  const peopleIncludeHqCorridor = peopleFilterUsesHqCorridor({
    locationScope: params.locationScope,
    cities: scoutCities,
    peopleCities: params.peopleCities,
    localOperators,
    allowHqCorridor: allowsHqCorridor(geoPolicy),
  });

  if (plantSeatMode && scoutCities.length) {
    let seated = selectPeoplePlantThenCorridor(finalPeople, scoutCities);
    // Stage B: deep HQ corridor search only when plant stage returned nobody.
    if (
      seated.people.length === 0 &&
      !tavilyQuotaHit([...warnings, ...errors]) &&
      hasTavilyKeys()
    ) {
      const corridorCities = corridorOnlyLabels(scoutCities);
      if (corridorCities.length) {
        const hqHits: ScoutPersonResult[] = [];
        await runStep(
          "people_search_hq_corridor",
          () =>
            indiaDirectoriesSearchPeople({
              companyName: params.companyName,
              companyDomain: resolvedDomain,
              limit: remaining,
              roleHints: roleHints.length > 0 ? roleHints : undefined,
              cities: corridorCities,
              localOperators: false,
              locationScope: params.locationScope,
              strictPeopleFilters: cfg.strictPeopleFilters,
              plantSeatPhase: "hq_corridor",
              goldFewShot: goldFewShot || undefined,
            }),
          hqHits,
          remaining,
          external.map((p) => p.name),
          [],
          warnings,
          errors,
        );
        appendTavilyKeySwitchWarning(warnings);
        if (hqHits.length) {
          const merged = [...allPeople, ...hqHits];
          const hqRoleFiltered =
            localOperators || activeSeniority.length > 0 || activeDepartments.length > 0
              ? filterPeopleByRoles(merged, activeSeniority, activeDepartments, roleOpts).people
              : merged;
          finalPeople = filterPeopleAgainstGoldDrops(hqRoleFiltered, params.companyName, goldCases);
          seated = selectPeoplePlantThenCorridor(finalPeople, scoutCities);
        }
      }
    }

    finalPeople = seated.people;
    if (seated.usedHqFallback) {
      broadenStages.push("hq_corridor");
      warnings.push(
        `No plant LinkedIn in ${scoutCities.join(", ")}. Showing Nearby HQ in ${seated.corridorLabels.slice(0, 2).join(" / ")} (not Delhi or NYC).`,
      );
    } else if (finalPeople.length === 0 && allPeople.length > 0) {
      warnings.push(
        `Searched plant city ${scoutCities.join(", ")} and nearby HQ corridor (${corridorOnlyLabels(scoutCities).slice(0, 2).join(" / ") || "metro"}). No matching decision-makers.`,
      );
    }
  } else if (peopleCityFilter.length) {
    const selected = selectPeopleForLeadLocation(finalPeople, peopleCityFilter, {
      includeHqCorridor: peopleIncludeHqCorridor,
    });
    const filterLabel = peopleCityFilter.join(", ");
    if (selected.relaxedToIndia && selected.people.length > 0 && peopleIncludeHqCorridor) {
      warnings.push(
        `Including ${params.companyName} people at nearby HQ (not Delhi or NYC). HR and Procurement often sit in the regional HQ, not at the plant.`,
      );
    } else if (selected.people.length === 0 && finalPeople.length > 0) {
      // Controlled broaden: parent-city-only location when chips+parent still empty.
      if (
        allowPeopleBroaden &&
        focusParentCities.length > 0 &&
        params.locationScope === "focus"
      ) {
        const parentOnly = selectPeopleForLeadLocation(finalPeople, focusParentCities, {
          includeHqCorridor: false,
        });
        if (parentOnly.people.length > 0) {
          finalPeople = parentOnly.people;
          broadenStages.push("parent_city");
          warnings.push(
            `No people matched the exact Focus Area pin. Showing decision-makers in ${focusParentCities.join(", ")}.`,
          );
        } else {
          warnings.push(
            localOperators || focusArea
              ? `No people found in ${filterLabel} for ${params.companyName}. Leads stay inside ${focusArea ? "this Focus Area" : "this area"}.${focusArea && !peopleIncludeHqCorridor ? " Switch to Area of Interest to include nearby HQ." : ""}`
              : sweetsGiftingPeople
                ? `HR/Procurement people found at ${params.companyName} but all had cities outside ${filterLabel} or could not be verified. LinkedIn often omits plant location. If this keeps happening, try Area of Interest instead of Focus Area.`
                : `No decision-makers found in ${filterLabel} for ${params.companyName}. Try another company or nearby city.`,
          );
          finalPeople = [];
        }
      } else {
        warnings.push(
          localOperators || focusArea
            ? `No people found in ${filterLabel} for ${params.companyName}. Leads stay inside ${focusArea ? "this Focus Area" : "this area"}.${focusArea && !peopleIncludeHqCorridor ? " Switch to Area of Interest to include nearby HQ." : ""}`
            : sweetsGiftingPeople
              ? `HR/Procurement people found at ${params.companyName} but all had cities outside ${filterLabel} or could not be verified. LinkedIn often omits plant location. If this keeps happening, try Area of Interest instead of Focus Area.`
              : `No decision-makers found in ${filterLabel} for ${params.companyName}. Try another company or nearby city.`,
        );
        finalPeople = [];
      }
    } else {
      finalPeople = selected.people;
    }
  }

  finalPeople = finalPeople.filter((person) => !personLooksOpenToWork(person));

  const ranked = rankPeopleForScout(finalPeople, {
    seniority: activeSeniority,
    departments: activeDepartments,
    buyerPersonas: brandIcp?.buyerPersonas,
    preferredCities: peopleCityFilter,
    preferDmTitles: qualityProfile.preferDmTitles,
  });

  return finishPeopleDiscovery({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    qualityContext: params.qualityContext,
    ranked,
    limit,
    resolvedDomain,
    resolvedWebsite,
    warnings,
    errors,
    broadenStages,
  });
}


export type DiscoverPeopleBatchItem = {
  id: string;
  companyName: string;
  companyDomain?: string;
  companyWebsite?: string;
};

export async function discoverPeopleBatch(params: {
  tenantId: string;
  workspaceId: string;
  companies: DiscoverPeopleBatchItem[];
  dataMode?: DataMode;
  config?: Partial<EnrichmentConfig>;
  limit?: number;
  seniority?: string[];
  departments?: string[];
  cities?: string[];
  peopleCities?: string[];
  concurrency?: number;
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
}): Promise<Record<string, PeopleDiscoveryResult>> {
  let tenantAccounts: (typeof accounts.$inferSelect)[] = [];
  try {
    tenantAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, params.tenantId));
  } catch (e) {
    console.error("[waterfall:batch_accounts] failed:", e);
  }

  const results: Record<string, PeopleDiscoveryResult> = {};
  const { companies, concurrency = 3, ...discoverParams } = params;
  let quotaStop = false;

  await mapWithConcurrency(companies, concurrency, async (company) => {
    if (quotaStop) {
      results[company.id] = {
        people: [],
        warnings: [],
        errors: [`Skipped ${company.companyName}: Tavily quota after earlier companies.`],
      };
      return;
    }
    try {
      const result = await discoverPeople({
        ...discoverParams,
        companyName: company.companyName,
        companyDomain: company.companyDomain,
        companyWebsite: company.companyWebsite,
        tenantAccounts,
      });
      if (await shouldStopBatchForTavilyQuota([...result.warnings, ...result.errors])) quotaStop = true;
      results[company.id] = result;
    } catch (e) {
      const msg = stepFailureMessage("people_search", e);
      if (await shouldStopBatchForTavilyQuota([msg])) quotaStop = true;
      results[company.id] = { people: [], warnings: [], errors: [msg] };
    }
  });

  return results;
}

export async function discoverPeopleBatchStream(
  params: {
    tenantId: string;
    workspaceId: string;
    companies: DiscoverPeopleBatchItem[];
    dataMode?: DataMode;
    config?: Partial<EnrichmentConfig>;
    limit?: number;
    seniority?: string[];
    departments?: string[];
    cities?: string[];
    peopleCities?: string[];
    concurrency?: number;
    searchKind?: "industry" | "business";
    businesses?: string[];
    locationScope?: "focus" | "interest";
  },
  onResult: (companyId: string, result: PeopleDiscoveryResult) => void | Promise<void>,
): Promise<void> {
  let tenantAccounts: (typeof accounts.$inferSelect)[] = [];
  try {
    tenantAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, params.tenantId));
  } catch (e) {
    console.error("[waterfall:batch_accounts] failed:", e);
  }

  const { companies, concurrency = 3, ...discoverParams } = params;
  let quotaStop = false;

  await mapWithConcurrency(companies, concurrency, async (company) => {
    if (quotaStop) {
      await onResult(company.id, {
        people: [],
        warnings: [],
        errors: [`Skipped ${company.companyName}: Tavily quota after earlier companies.`],
      });
      return;
    }
    try {
      const result = await discoverPeople({
        ...discoverParams,
        companyName: company.companyName,
        companyDomain: company.companyDomain,
        companyWebsite: company.companyWebsite,
        tenantAccounts,
      });
      if (await shouldStopBatchForTavilyQuota([...result.warnings, ...result.errors])) quotaStop = true;
      await onResult(company.id, result);
    } catch (e) {
      const msg = stepFailureMessage("people_search", e);
      if (await shouldStopBatchForTavilyQuota([msg])) quotaStop = true;
      await onResult(company.id, { people: [], warnings: [], errors: [msg] });
    }
  });
}

function stepFailureMessage(label: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/TAVILY_API_KEY not set/i.test(msg)) {
    return "TAVILY_API_KEY is missing. Add it in .env.local for company and people search via Tavily.";
  }
  if (/APOLLO_API_KEY/i.test(msg)) {
    return "APOLLO_API_KEY is missing. Switch Data Mode to Free or add your Apollo key.";
  }
  if (isApolloAuthError(err) || /apollo.*(401|403|invalid api key|unauthorized|authentication failed)/i.test(msg)) {
    return "Apollo key invalid, using web search.";
  }
  if (/GOOGLE_PLACES_API_KEY/i.test(msg)) {
    return "GOOGLE_PLACES_API_KEY is missing. Switch search provider or add a Google Places key.";
  }
  if (/tavily api quota|usage limit/i.test(msg)) return msg;
  if (/quota|429|rate.?limit/i.test(msg)) {
    return `${label} hit an API rate limit. Try again shortly.`;
  }
  return `${label} failed: ${msg}`;
}

/** Runs a search step, dedupes by name, appends to accumulator */
async function runStep(
  label: string,
  fn: () => Promise<ScoutCompanyResult[] | ScoutPersonResult[]>,
  acc: (ScoutCompanyResult | ScoutPersonResult)[],
  limit: number,
  excludeNames: string[] = [],
  savedAccounts: AccountMatchShape[] = [],
  warnings: string[] = [],
  errors: string[] = [],
): Promise<void> {
  try {
    const results = await fn();
    const seen = new Set([
      ...acc.map((r) => normalizeName(r.name)),
      ...excludeNames.map(normalizeName),
    ]);
    for (const r of results) {
      if (acc.length >= limit) break;
      if (label.includes("people")) {
        const key = normalizeName(r.name);
        if (!seen.has(key)) {
          acc.push(r as ScoutCompanyResult & ScoutPersonResult);
          seen.add(key);
        }
        continue;
      }
      const cleaned = withCleanedCompanyName(r as ScoutCompanyResult);
      if (!cleaned || isGeographicEntity(cleaned.name)) continue;
      const key = normalizeName(cleaned.name);
      if (seen.has(key)) continue;
      if (scoutCompanyMatchesSaved(cleaned, savedAccounts)) continue;
      acc.push(cleaned as ScoutCompanyResult & ScoutPersonResult);
      seen.add(key);
    }
  } catch (e) {
    console.error(`[waterfall:${label}] failed:`, e);
    errors.push(stepFailureMessage(label, e));
  }
}

function dbToResult(a: typeof accounts.$inferSelect): ScoutCompanyResult {
  return {
    name: a.name,
    domain: a.domain ?? undefined,
    website: a.website ?? undefined,
    industry: a.industry ?? undefined,
    city: a.city ?? undefined,
    employees: a.employees ?? undefined,
    logo: a.logo ?? undefined,
    fitScore: a.fitScore ?? undefined,
    intelNotes: a.intelNotes ?? undefined,
    dataSource: "internal",
    externalId: a.id,
  };
}

function contactToResult(c: typeof contacts.$inferSelect): ScoutPersonResult {
  return {
    name: c.name,
    firstName: c.firstName ?? undefined,
    lastName: c.lastName ?? undefined,
    title: c.title ?? undefined,
    department: c.department ?? undefined,
    seniority: c.seniority ?? undefined,
    email: c.email ?? undefined,
    emailStatus: c.emailStatus ?? "missing",
    phone: c.phone ?? undefined,
    linkedIn: c.linkedIn ?? undefined,
    bio: c.bio ?? undefined,
    isKeyDM: c.isKeyDM ?? false,
    matchScore: c.matchScore ?? undefined,
    dataSource: "internal",
    externalId: c.id,
  };
}
