import type { DataMode, ScoutCompanyResult, ScoutPersonResult } from "./types";
import type { EnrichmentConfig } from "./config";
import { resolveEnrichmentConfig } from "./config";
import { apolloSearchCompanies, apolloSearchPeople } from "./apollo";
import { tavilySearchCompanies } from "./tavily";
import { googlePlacesSearchCompanies } from "./google-places";
import { indiaDirectoriesSearchCompanies, indiaDirectoriesSearchPeople } from "./india-directories";
import { companyCityMatchesSelection } from "./city-search";
import { isTavilyQuotaError } from "./tavily-client";
import { hasTavilyKeys } from "./tavily-keys";
import { fetchTavilyAccountUsage } from "./tavily-account";
import { allTavilyKeysExhausted, takeTavilyKeySwitchMessage } from "./tavily-usage";
import { mapWithConcurrency } from "@/lib/async";
import { db } from "@/db";
import { eq, and, inArray, ilike, or } from "drizzle-orm";
import { accounts, contacts } from "@/db/schema";

const BUYING_TITLES = [
  "HR Director", "HR Manager", "HR Head", "Chief People Officer", "CPO",
  "Admin Head", "Admin Director", "Administration Manager",
  "Procurement Manager", "Procurement Head", "VP HR",
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
            params.cities.length > 0 ? inArray(accounts.city, params.cities) : undefined,
          ),
        )
        .limit(limit);
    } catch (e) {
      console.error("[waterfall:name_search_db] failed:", e);
      warnings.push("Could not search saved companies from the database.");
    }

    const dbMapped = filterExcluded(dbResults.map(dbToResult), excludeNames);
    const external: ScoutCompanyResult[] = [];

    // Search external source with the exact company name as query
    if (dbMapped.length < limit) {
      const remaining = limit - dbMapped.length;
      const cityStr = params.cities.slice(0, 2).join(", ");
      const searchQuery = cityStr ? `${nameQuery} ${cityStr}` : nameQuery;

      if (!tavilyQuotaHit([...warnings, ...errors])) {
        await runStep("name_search_tavily", () =>
          tavilySearchCompanies({
            cities: params.cities,
            industries: params.industries,
            limit: remaining,
            meta: searchMeta,
            nameQuery: searchQuery,
          }),
          external, remaining, excludeNames, warnings, errors,
        );
        appendTavilyKeySwitchWarning(warnings);
      }
    }

    // Sort: exact match first, then partial matches
    const allResults = [...dbMapped, ...filterExcluded(external, dbMapped.map((r) => r.name))];
    const lowerQuery = nameQuery.toLowerCase();
    allResults.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerQuery ? 0 : a.name.toLowerCase().includes(lowerQuery) ? 1 : 2;
      const bExact = b.name.toLowerCase() === lowerQuery ? 0 : b.name.toLowerCase().includes(lowerQuery) ? 1 : 2;
      return aExact - bExact;
    });

    return {
      companies: filterBySelectedCities(allResults, params.cities).slice(0, limit),
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
            params.cities.length > 0 ? inArray(accounts.city, params.cities) : undefined,
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
  const external: ScoutCompanyResult[] = [];

  // ── Step 2: Primary search provider (resolved from dataMode) ─────────────
  switch (cfg.searchProvider) {
    case "india_directories":
      await runStep("india_directories", () =>
        indiaDirectoriesSearchCompanies({
          cities: params.cities,
          industries: params.industries,
          limit: remaining,
          meta: searchMeta,
          fetchSeed: params.fetchSeed,
        }),
        external, remaining, excludeNames, warnings, errors,
      );
      break;

    case "google_places":
      await runStep("google_places", () =>
        googlePlacesSearchCompanies({ cities: params.cities, industries: params.industries, limit: remaining }),
        external, remaining, excludeNames, warnings, errors,
      );
      break;

    case "apollo":
      await runStep("apollo", () =>
        apolloSearchCompanies({ cities: params.cities, industries: params.industries, limit: remaining }),
        external, remaining, excludeNames, warnings, errors,
      );
      break;

    case "tavily_ai":
      await runStep("tavily_ai", () =>
        tavilySearchCompanies({
          cities: params.cities,
          industries: params.industries,
          limit: remaining,
          meta: searchMeta,
        }),
        external, remaining, excludeNames, warnings, errors,
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
        () => googlePlacesSearchCompanies({ cities: params.cities, industries: params.industries, limit: remaining }),
        external,
        remaining,
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
        cities: params.cities,
        industries: params.industries,
        limit: remaining - external.length,
        meta: searchMeta,
      }),
      external, remaining, excludeNames, warnings, errors,
    );
    appendTavilyKeySwitchWarning(warnings);
  }

  const merged = [...dbMapped, ...external];
  const companies = filterBySelectedCities(merged, params.cities).slice(0, limit);
  if (merged.length > 0 && companies.length === 0 && params.cities.length > 0) {
    warnings.push(
      `Found ${merged.length} candidate${merged.length === 1 ? "" : "s"} but none had a verified city matching ${params.cities.join(", ")}. Try a nearby city or leave industries unselected.`,
    );
  }
  return {
    companies,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

export type PeopleDiscoveryResult = {
  people: ScoutPersonResult[];
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

// Maps UI seniority labels → search title keywords
const SENIORITY_TITLES: Record<string, string[]> = {
  "C-Level": ["CEO", "COO", "CHRO", "CPO", "CXO", "Chief"],
  "Founders": ["Founder", "Co-Founder", "Co-founder", "Founding"],
  "VP": ["VP", "Vice President"],
  "Director": ["Director"],
  "Manager": ["Manager", "Head"],
};

// Maps UI department labels → search title keywords
const DEPARTMENT_TITLES: Record<string, string[]> = {
  "HR": ["HR", "Human Resources", "People", "CHRO", "CPO"],
  "Admin": ["Admin", "Administration"],
  "Procurement": ["Procurement", "Purchase", "Sourcing"],
  "Facilities": ["Facilities", "Facility"],
  "Marketing": ["Marketing"],
  "Operations": ["Operations"],
  "Leadership": ["CEO", "MD", "Managing Director", "COO", "CXO"],
};

function buildRoleTitleHints(seniority: string[], departments: string[]): string[] {
  const hints = new Set<string>();
  for (const s of seniority) {
    for (const t of SENIORITY_TITLES[s] ?? []) hints.add(t);
  }
  for (const d of departments) {
    for (const t of DEPARTMENT_TITLES[d] ?? []) hints.add(t);
  }
  return [...hints];
}

const NON_SENIOR_TITLE_PATTERNS = [
  /\bjunior\b/i,
  /\bintern\b/i,
  /\btrainee\b/i,
  /\bassociate\b/i,
  /\bentry[- ]level\b/i,
  /\bgraduate\b/i,
  /\bassistant\b/i,
];

function isNonSeniorTitle(title: string): boolean {
  return NON_SENIOR_TITLE_PATTERNS.some((re) => re.test(title));
}

function filterPeopleByRoles(
  people: ScoutPersonResult[],
  seniority: string[],
  departments: string[],
): ScoutPersonResult[] {
  if (!seniority.length && !departments.length) return people;
  return people.filter((p) => personMatchesRoles(p, seniority, departments));
}

function personMatchesRoles(person: ScoutPersonResult, seniority: string[], departments: string[]): boolean {
  if (!seniority.length && !departments.length) return true;
  const titleLower = (person.title ?? "").toLowerCase();
  if (seniority.length > 0 && titleLower && isNonSeniorTitle(titleLower)) return false;
  const senLower = (person.seniority ?? "").toLowerCase();
  const deptLower = (person.department ?? "").toLowerCase();

  const senMatch = seniority.length === 0 || seniority.some((s) => {
    const keywords = SENIORITY_TITLES[s] ?? [s];
    return keywords.some((k) => titleLower.includes(k.toLowerCase()) || senLower.includes(k.toLowerCase()));
  });

  const deptMatch = departments.length === 0 || departments.some((d) => {
    const keywords = DEPARTMENT_TITLES[d] ?? [d];
    return keywords.some((k) => titleLower.includes(k.toLowerCase()) || deptLower.includes(k.toLowerCase()));
  });

  // Both must match if both filters are active; either if only one is
  if (seniority.length > 0 && departments.length > 0) return senMatch && deptMatch;
  return senMatch || deptMatch;
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
  tenantAccounts?: (typeof accounts.$inferSelect)[];
}): Promise<PeopleDiscoveryResult> {
  const cfg = resolveEnrichmentConfig(params.dataMode, params.config);
  const limit = params.limit ?? 15;
  const warnings: string[] = [];
  const errors: string[] = [];
  const resolvedDomain = params.companyDomain ?? domainFromWebsite(params.companyWebsite);
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
    if (filtered.length === 0 && (activeSeniority.length > 0 || activeDepartments.length > 0)) {
      warnings.push("No contacts match the selected seniority and department filters for this company.");
    }
    return { people: filtered.slice(0, limit), warnings, errors };
  }

  const remaining = limit - companyContacts.length;
  const external: ScoutPersonResult[] = [];

  // ── Step 2: Primary people search ────────────────────────────────────────
  const effectiveTitles = roleHints.length > 0 ? roleHints : BUYING_TITLES;

  if (cfg.searchProvider === "apollo" && resolvedDomain) {
    await runStep(
      "apollo_people",
      () => apolloSearchPeople({ companyDomain: resolvedDomain, titles: effectiveTitles, limit: remaining }),
      external,
      remaining,
      [],
      warnings,
      errors,
    );
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

  // ── Step 3: Filter + rank by selected roles ─────────────────────────────
  const allPeople = [...companyContacts.map(contactToResult), ...external];
  let finalPeople: ScoutPersonResult[];
  if (activeSeniority.length > 0 || activeDepartments.length > 0) {
    finalPeople = filterPeopleByRoles(allPeople, activeSeniority, activeDepartments);
    if (finalPeople.length === 0 && allPeople.length > 0) {
      warnings.push("No contacts match the selected seniority and department filters for this company.");
    }
  } else {
    finalPeople = allPeople;
  }

  return {
    people: finalPeople.slice(0, limit),
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
    giftScore: a.giftScore ?? undefined,
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
