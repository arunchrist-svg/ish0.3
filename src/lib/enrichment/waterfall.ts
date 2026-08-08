import type { DataMode, ScoutCompanyResult, ScoutPersonResult } from "./types";
import { sortPeopleByScore } from "./seniority-score";
import type { EnrichmentConfig } from "./config";
import { resolveEnrichmentConfig } from "./config";
import { apolloSearchCompanies, apolloSearchPeople, isApolloAuthError } from "./apollo";
import { tavilySearchCompanies } from "./tavily";
import { googlePlacesSearchCompanies } from "./google-places";
import { indiaDirectoriesSearchCompanies, indiaDirectoriesSearchPeople } from "./india-directories";
import {
  companyCityMatchesSelection,
  expandCityMatchTerms,
  isNationwideSelection,
  personLocationMatchesSelection,
  primaryCitiesForSearch,
  rankCompaniesByFitAndDiversity,
  rankPeopleByCityMatch,
} from "./city-search";
import { isTavilyQuotaError } from "./tavily-client";
import { hasTavilyKeys } from "./tavily-keys";
import { fetchTavilyAccountUsage } from "./tavily-account";
import { allTavilyKeysExhausted, takeTavilyKeySwitchMessage } from "./tavily-usage";
import { mapWithConcurrency } from "@/lib/async";
import { db } from "@/db";
import { eq, and, inArray, ilike, or } from "drizzle-orm";
import { accounts, contacts } from "@/db/schema";
import { resolveCompanyDomain } from "./resolve-company-domain";
import { filterCompaniesMatchingQuery, isGeographicEntity } from "./company-name-match";
import { buildRoleTitleHints, filterPeopleByRoles } from "./people-role-filter";

function roleRelaxWarning(
  companyName: string,
  relaxed: "or" | "untitled" | "unfiltered",
): string {
  if (relaxed === "or") {
    return `Few exact role matches at ${companyName}. Showing people who match seniority or department.`;
  }
  if (relaxed === "untitled") {
    return `Titles were missing for ${companyName} contacts. Showing LinkedIn profiles to review.`;
  }
  return `Role filters were too tight for ${companyName}. Showing the best people found.`;
}

const BUYING_TITLES = [
  "Director", "Manager", "Head", "VP", "Vice President",
  "Founder", "CEO", "CTO", "CMO", "COO",
  "Sales Director", "Operations Head", "HR Director",
];

export type DiscoveryResult = {
  companies: ScoutCompanyResult[];
  warnings: string[];
  errors: string[];
};

function tavilyQuotaHit(messages: string[]): boolean {
  return messages.some(isTavilyQuotaError);
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



function filterBySelectedCities(
  results: ScoutCompanyResult[],
  cities: string[],
): ScoutCompanyResult[] {
  if (cities.length === 0) return results;
  return results.filter((c) => companyCityMatchesSelection(c.city, cities));
}

function filterExcluded<T extends { name: string }>(results: T[], excludeNames: string[]): T[] {
  if (!excludeNames.length) return results;
  const excluded = new Set(excludeNames.map(normalizeName));
  return results.filter((r) => !excluded.has(normalizeName(r.name)));
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
  skipInternal?: boolean;
  fetchSeed?: number;
  companyName?: string;
}): Promise<DiscoveryResult> {
  const cfg = resolveEnrichmentConfig(params.dataMode, params.config);
  const limit = params.limit ?? parseInt(process.env.PROSPECTING_MAX_RESULTS ?? "25", 10);
  const useAI = process.env.SCOUT_USE_AI_PROSPECTING !== "false";
  const excludeNames = params.excludeNames ?? [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const searchMeta = { warnings };
  const isNameSearch = !!params.companyName?.trim();
  const selectionLabels = params.cities;
  const nationwide = isNationwideSelection(selectionLabels);
  const queryCities = selectionLabels;
  const matchCities = expandCityMatchTerms(selectionLabels);
  const locationHint = primaryCitiesForSearch(selectionLabels)
    .filter((c) => c !== "India")
    .slice(0, 2);

  // ── SEARCH MODE: targeted lookup by company name ──────────────────────────
  if (isNameSearch) {
    const nameQuery = params.companyName!.trim();
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
          cities: selectionLabels,
          industries: params.industries,
          limit: remaining,
          meta: searchMeta,
          nameQuery,
        }),
        external, remaining, excludeNames, warnings, errors,
      );
      appendTavilyKeySwitchWarning(warnings);
    }

    const matched = filterCompaniesMatchingQuery(
      [...dbMapped, ...filterExcluded(external, dbMapped.map((r) => r.name))],
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

    return {
      companies: matched.slice(0, limit),
      warnings: [...new Set(warnings)],
      errors: [...new Set(errors)],
    };
  }

  // ── AUTOPILOT MODE: broad discovery ──────────────────────────────────────

  let dbResults: (typeof accounts.$inferSelect)[] = [];

  // ── Step 1: Internal DB (skip when loading more external results) ─────────
  if (!params.skipInternal) {
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

  const dbMapped = filterExcluded(dbResults.map(dbToResult), excludeNames);

  if (dbMapped.length >= limit) {
    return { companies: dbMapped.slice(0, limit), warnings, errors };
  }

  const remaining = limit - dbMapped.length;
  const fetchLimit = Math.min(Math.max(remaining * 2, remaining), 40);
  const external: ScoutCompanyResult[] = [];

  // ── Step 2: Primary search provider (resolved from dataMode) ─────────────
  switch (cfg.searchProvider) {
    case "india_directories":
      await runStep("india_directories", () =>
        indiaDirectoriesSearchCompanies({
          cities: queryCities,
          industries: params.industries,
          limit: fetchLimit,
          meta: searchMeta,
          fetchSeed: params.fetchSeed,
        }),
        external, fetchLimit, excludeNames, warnings, errors,
      );
      break;

    case "google_places":
      await runStep("google_places", () =>
        googlePlacesSearchCompanies({ cities: queryCities, industries: params.industries, limit: fetchLimit }),
        external, fetchLimit, excludeNames, warnings, errors,
      );
      break;

    case "apollo":
      await runStep("apollo", () =>
        apolloSearchCompanies({ cities: queryCities, industries: params.industries, limit: fetchLimit }),
        external, fetchLimit, excludeNames, warnings, errors,
      );
      break;

    case "tavily_ai":
      await runStep("tavily_ai", () =>
        tavilySearchCompanies({
          cities: queryCities,
          industries: params.industries,
          limit: fetchLimit,
          meta: searchMeta,
          fetchSeed: params.fetchSeed,
        }),
        external, fetchLimit, excludeNames, warnings, errors,
      );
      break;
  }

  appendTavilyKeySwitchWarning(warnings);

  const tavilyAccount = hasTavilyKeys() ? await fetchTavilyAccountUsage() : [];

  // ── Step 2b: Google Places fallback when ALL Tavily keys are exhausted ────
  if (external.length === 0 && tavilyQuotaHit([...warnings, ...errors]) && allTavilyKeysExhausted(tavilyAccount)) {
    if (hasGooglePlacesKey()) {
      await runStep(
        "google_places_fallback",
        () => googlePlacesSearchCompanies({ cities: queryCities, industries: params.industries, limit: fetchLimit }),
        external,
        fetchLimit,
        excludeNames,
        warnings,
        errors,
      );
      if (external.length > 0) {
        const keptWarnings = warnings.filter((w) => !isTavilyQuotaError(w));
        warnings.length = 0;
        warnings.push(...keptWarnings, "All Tavily keys exhausted — switched to Google Places for company discovery.");
        const keptErrors = errors.filter((e) => !isTavilyQuotaError(e));
        errors.length = 0;
        errors.push(...keptErrors);
      }
    } else if (!errors.some((e) => isTavilyQuotaError(e))) {
      errors.push(
        "All Tavily keys exhausted. Add TAVILY_API_KEY_2 in .env.local, GOOGLE_PLACES_API_KEY, or wait for monthly reset.",
      );
    }
  }

  // ── Step 3: Fallback to AI (Tavily+Gemini) if enabled and results short ──
  if (
    useAI &&
    cfg.fallbackToAI &&
    external.length < Math.floor(remaining * 0.5) &&
    cfg.searchProvider !== "tavily_ai" &&
    !tavilyQuotaHit([...warnings, ...errors])
  ) {
    await runStep("tavily_ai_fallback", () =>
      tavilySearchCompanies({
        cities: queryCities,
        industries: params.industries,
        limit: Math.max(fetchLimit - external.length, remaining),
        meta: searchMeta,
        fetchSeed: params.fetchSeed,
      }),
      external, fetchLimit, excludeNames, warnings, errors,
    );
    appendTavilyKeySwitchWarning(warnings);
  }

  const merged = [...dbMapped, ...external];
  const filtered = filterBySelectedCities(merged, selectionLabels);
  const companies = rankCompaniesByFitAndDiversity(filtered, selectionLabels, limit);
  if (merged.length > 0 && companies.length === 0 && selectionLabels.length > 0 && !nationwide) {
    warnings.push(
      `Found ${merged.length} candidate${merged.length === 1 ? "" : "s"} but none had a verified city matching ${selectionLabels.join(", ")}. Try a nearby city or leave industries unselected.`,
    );
  } else if (selectionLabels.length >= 3 && companies.length > 0 && !nationwide) {
    const groups = new Set(
      companies.map((c) => {
        for (const label of selectionLabels) {
          if (companyCityMatchesSelection(c.city, [label])) return label.toLowerCase();
        }
        return (c.city ?? "").trim().toLowerCase() || "unknown";
      }),
    );
    if (groups.size <= 1) {
      const cityLabel = companies[0]?.city?.trim() || "one city";
      warnings.push(
        `Results are concentrated in ${cityLabel} even though ${selectionLabels.length} locations were selected. Refresh or Load More to cover more cities.`,
      );
    }
  }
  return {
    companies,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

export type PeopleDiscoveryResult = {
  people: ScoutPersonResult[];
  resolvedDomain?: string;
  resolvedWebsite?: string;
  warnings: string[];
  errors: string[];
};

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

function domainFromWebsite(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
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
}): Promise<PeopleDiscoveryResult> {
  const cfg = resolveEnrichmentConfig(params.dataMode, params.config);
  const limit = params.limit ?? 15;
  const warnings: string[] = [];
  const errors: string[] = [];
  const domainResolution = await resolveCompanyDomain({
    companyName: params.companyName,
    domain: params.companyDomain,
    website: params.companyWebsite,
  });
  const resolvedDomain = domainResolution.domain;
  const resolvedWebsite = domainResolution.website ?? params.companyWebsite;
  if (domainResolution.source !== "provided" && domainResolution.source !== "unresolved" && resolvedDomain) {
    warnings.push(`Resolved domain for ${params.companyName}: ${resolvedDomain} (${domainResolution.source})`);
  } else if (!resolvedDomain) {
    warnings.push(`No website domain for ${params.companyName}. People search may be less accurate.`);
  }
  const activeSeniority = params.seniority ?? [];
  const activeDepartments = params.departments ?? [];
  const roleHints = buildRoleTitleHints(activeSeniority, activeDepartments);

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
        .limit(limit);
    }
  } catch (e) {
    console.error("[waterfall:internal_contacts] failed:", e);
    warnings.push("Could not read saved contacts from the database.");
  }

  if (companyContacts.length >= limit) {
    const filtered = filterPeopleByRoles(
      companyContacts.map(contactToResult),
      activeSeniority,
      activeDepartments,
    );
    if (filtered.relaxed) {
      warnings.push(roleRelaxWarning(params.companyName, filtered.relaxed));
    }
    return { people: filtered.people.slice(0, limit), resolvedDomain, resolvedWebsite, warnings, errors };
  }

  const remaining = limit - companyContacts.length;
  const external: ScoutPersonResult[] = [];

  // ── Step 2: Primary people search ────────────────────────────────────────
  const effectiveTitles = roleHints.length > 0 ? roleHints : BUYING_TITLES;

  if (cfg.searchProvider === "apollo" && resolvedDomain) {
    try {
      const apolloPeople = await apolloSearchPeople({
        companyDomain: resolvedDomain,
        titles: effectiveTitles,
        limit: remaining,
        cities: params.cities,
      });
      const seen = new Set(external.map((p) => normalizeName(p.name)));
      for (const person of apolloPeople) {
        if (external.length >= remaining) break;
        const key = normalizeName(person.name);
        if (seen.has(key)) continue;
        external.push(person);
        seen.add(key);
      }
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
      warnings.push(`No website domain for ${params.companyName} — searching LinkedIn instead of Apollo.`);
    }
    await runStep(
      "people_search",
      () =>
        indiaDirectoriesSearchPeople({
          companyName: params.companyName,
          companyDomain: resolvedDomain,
          limit: remaining,
          roleHints: roleHints.length > 0 ? roleHints : undefined,
          cities: params.cities,
        }),
      external,
      remaining,
      [],
      warnings,
      errors,
    );
    appendTavilyKeySwitchWarning(warnings);
  }

  if (external.length === 0) {
    const combined = [...warnings, ...errors];
    const quotaHit = tavilyQuotaHit(combined);
    const hasActionable = combined.some((m) =>
      /missing|failed|quota|usage limit|exhausted|rejected|people search needs tavily|switched to backup key/i.test(m),
    );

    const tavilyAccount = hasTavilyKeys() ? await fetchTavilyAccountUsage() : [];

    if (quotaHit && allTavilyKeysExhausted(tavilyAccount)) {
      const allExhaustedMsg =
        "All Tavily keys exhausted for people search. Add TAVILY_API_KEY_2 in .env.local, switch to Apollo mode, or wait for monthly reset.";
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

  // ── Step 3: Filter + rank by selected roles / city ──────────────────────
  const allPeople = [...companyContacts.map(contactToResult), ...external];
  let finalPeople: ScoutPersonResult[];
  if (activeSeniority.length > 0 || activeDepartments.length > 0) {
    const filtered = filterPeopleByRoles(allPeople, activeSeniority, activeDepartments);
    finalPeople = filtered.people;
    if (filtered.relaxed) {
      warnings.push(roleRelaxWarning(params.companyName, filtered.relaxed));
    }
  } else {
    finalPeople = allPeople;
  }

  const scoutCities = params.cities ?? [];
  if (scoutCities.length) {
    const localPeople = finalPeople.filter((person) =>
      personLocationMatchesSelection(person.location, scoutCities),
    );
    if (localPeople.some((person) => person.location?.trim())) {
      finalPeople = localPeople;
    } else if (localPeople.length > 0) {
      finalPeople = localPeople;
    } else if (finalPeople.length > 0) {
      warnings.push(
        `No decision-makers clearly in ${scoutCities.join(", ")} for ${params.companyName}. Showing best matches anyway.`,
      );
    }
    finalPeople = rankPeopleByCityMatch(finalPeople, scoutCities);
  }

  return {
    people: sortPeopleByScore(finalPeople).slice(0, limit),
    resolvedDomain,
    resolvedWebsite,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
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
  concurrency?: number;
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
  const { companies, concurrency = 5, ...discoverParams } = params;

  await mapWithConcurrency(companies, concurrency, async (company) => {
    results[company.id] = await discoverPeople({
      ...discoverParams,
      companyName: company.companyName,
      companyDomain: company.companyDomain,
      companyWebsite: company.companyWebsite,
      tenantAccounts,
    });
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
    concurrency?: number;
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

  const { companies, concurrency = 5, ...discoverParams } = params;

  await mapWithConcurrency(companies, concurrency, async (company) => {
    const result = await discoverPeople({
      ...discoverParams,
      companyName: company.companyName,
      companyDomain: company.companyDomain,
      companyWebsite: company.companyWebsite,
      tenantAccounts,
    });
    await onResult(company.id, result);
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
      const key = normalizeName(r.name);
      if (!seen.has(key)) {
        acc.push(r as ScoutCompanyResult & ScoutPersonResult);
        seen.add(key);
      }
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
