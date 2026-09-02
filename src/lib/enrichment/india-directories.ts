/**
 * India Directories provider
 * Searches JustDial, IndiaMART, Sulekha, ZaubaCorp, and TradeIndia
 * via Tavily — then extracts structured data with Gemini.
 * Falls back to heuristic parsing when AI is unavailable.
 */
import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import { normalizeLinkedInUrl } from "@/lib/utils";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { citySearchClause, expandCitySearchTerms, partitionCitiesForSearch } from "./city-search";
import { partitionIndustriesForSearch } from "./industry-search";
import {
  employeeSizeSearchClause,
  extractEmployeesFromHits,
  extractEmployeesFromText,
  normalizeEmployeeField,
} from "./employee-size";
import {
  cleanCompanyName,
  keepStrictCompaniesOnly,
  parseCompaniesFromDirectoryResults,
} from "./directory-parser";
import { searchPeopleViaTavily } from "./people-search";
import { hasLLMKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
import { freeCompanyFilterProvider } from "./filter-companies-llm";
import {
  isTavilyQuotaError,
  optimizedMaxResults,
  TavilyQuotaError,
  TAVILY_QUOTA_INDIA_DIRECTORIES_MSG,
  tavilySearch,
} from "./tavily-client";
import { mapWithConcurrency } from "@/lib/async";

const REGISTRY_SITES = ["site:zaubacorp.com", "site:zauba.com", "site:tofler.in"];
const LISTING_SITES = ["site:indiamart.com", "site:tradeindia.com", "site:justdial.com", "site:sulekha.com"];

export type DirectorySearchMeta = {
  warnings: string[];
};


function aiConfidenceThreshold(): number {
  const raw = process.env.PROSPECTING_AI_CONFIDENCE_THRESHOLD;
  const parsed = raw ? parseInt(raw, 10) : 40;
  return Number.isFinite(parsed) ? parsed : 40;
}

function rotatedQueryTerms<T>(items: T[], count: number, offset: number): T[] {
  if (!items.length || count <= 0) return [];
  const slots: T[] = [];
  for (let i = 0; i < Math.min(count, items.length); i++) {
    slots.push(items[(offset + i) % items.length]!);
  }
  return slots;
}

export function buildDirectoryQueries(
  cities: string[],
  industries: string[],
  fetchSeed = 0,
  employeeBands: string[] = [],
  searchKind: "industry" | "business" = "industry",
  /** Parent district cities for ZaubaCorp/registry queries (e.g. "Hosur" when chips are "SIPCOT Hosur").
   *  ZaubaCorp indexes by district city, not industrial area name. Provided by the caller from
   *  scoutAreasOfFocus.cityLabel so that neighborhood chips still yield registered company hits. */
  registryCities?: string[],
): string[] {
  const cityStr = citySearchClause(cities);
  const seed = Math.abs(fetchSeed);
  const indStr =
    industries.length > 0
      ? rotatedQueryTerms(industries, 3, seed).join(" OR ")
      : searchKind === "business"
        ? "establishments"
        : "corporate";
  const sizeStr = employeeSizeSearchClause(employeeBands);
  const sizeBit = sizeStr ? ` ${sizeStr}` : "";

  // Registry sites (ZaubaCorp, Zauba, Tofler) index by district city. When registryCities are
  // provided, combine with the neighborhood chips so both granularities are searched.
  const registryCityStr =
    registryCities?.length
      ? [...cities.map((c) => c.trim()).filter(Boolean), ...registryCities].join(" OR ")
      : cityStr;

  if (searchKind === "business") {
    const queries = [
      `(${LISTING_SITES.join(" OR ")}) ${indStr} ${cityStr} India`,
      `site:justdial.com ${indStr} ${cityStr} India`,
      `site:sulekha.com ${indStr} ${cityStr}`,
    ];
    for (const city of rotatedQueryTerms(expandCitySearchTerms(cities), 3, seed + 1)) {
      queries.push(`${indStr} ${city} India address phone`);
    }
    if (registryCities?.length) {
      for (const city of registryCities) {
        queries.push(`site:justdial.com ${indStr} ${city} India SIPCOT industrial`);
      }
    }
    const extras = [
      `site:justdial.com ${indStr} ${cityStr}${sizeBit}`,
      `${indStr} near ${cityStr} India`,
    ];
    const offset = Math.abs(fetchSeed) % extras.length;
    const rotatedExtras = [...extras.slice(offset), ...extras.slice(0, offset)];
    return [...queries, ...rotatedExtras];
  }

  const queries = [
    // Registry sites: use registryCityStr (includes parent city) so ZaubaCorp returns hits
    `(${REGISTRY_SITES.join(" OR ")}) ${indStr} private limited companies ${registryCityStr} India`,
    `site:zaubacorp.com ${indStr} ${registryCityStr} company CIN registered`,
    // Listing sites: use neighborhood chip names since JustDial/IndiaMART have locality data
    `(${LISTING_SITES.slice(0, 2).join(" OR ")}) ${indStr} Pvt Ltd manufacturers ${cityStr}${sizeBit}`,
    `(${LISTING_SITES.slice(2).join(" OR ")}) ${indStr} companies ${cityStr}${sizeBit} India`,
  ];

  const zasubaCities = registryCities?.length ? registryCities : expandCitySearchTerms(cities);
  for (const city of zasubaCities.slice(0, 2)) {
    queries.push(`site:zaubacorp.com ${indStr} companies ${city} India`);
  }

  const extras = [
    `site:thecompanycheck.com ${indStr} ${registryCityStr} private limited`,
    `site:indiamart.com ${indStr} ${cityStr}${sizeBit} company directory`,
    `site:tradeindia.com ${indStr} manufacturers ${cityStr}${sizeBit}`,
  ];
  const offset = Math.abs(fetchSeed) % extras.length;
  const rotatedExtras = [...extras.slice(offset), ...extras.slice(0, offset)];

  return [...queries, ...rotatedExtras];
}

export function directoryQueryBatchCount(limit: number, available: number): number {
  return Math.min(available, Math.max(3, Math.ceil(Math.max(limit, 1) / 20)));
}

/** Run enough Tavily searches to hit Zauba + listings, without burning the quota. */
export function directorySearchQueryCap(
  limit: number,
  available: number,
  opts?: { cityChunks?: number; industryChunks?: number },
): number {
  const needed = directoryQueryBatchCount(limit, available);
  const fanOut = Math.max(0, (opts?.cityChunks ?? 1) - 1) + Math.max(0, (opts?.industryChunks ?? 1) - 1);
  const maxQueries = (limit >= 25 ? 6 : 4) + Math.min(6, fanOut * 2);
  return Math.min(available, Math.max(needed, 3), maxQueries);
}

function dedupeCompaniesByName(companies: ScoutCompanyResult[]): ScoutCompanyResult[] {
  const seen = new Map<string, ScoutCompanyResult>();
  const order: string[] = [];
  for (const company of companies) {
    const key = company.name.trim().toLowerCase();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, company);
      order.push(key);
      continue;
    }
    if (!normalizeEmployeeField(existing.employees) && normalizeEmployeeField(company.employees)) {
      seen.set(key, { ...existing, employees: company.employees });
    }
  }
  return order.map((key) => seen.get(key)!);
}

function fillEmployeesFromHits(
  companies: ScoutCompanyResult[],
  hits: Array<{ title: string; content: string }>,
): ScoutCompanyResult[] {
  return companies.map((company) => {
    if (normalizeEmployeeField(company.employees)) return company;
    const extracted = extractEmployeesFromHits(company.name, hits);
    return extracted ? { ...company, employees: extracted } : company;
  });
}

function parseLLMCompanies(
  raw: string,
  limit: number,
): ScoutCompanyResult[] {
  const parsed = parseJsonArrayFromLLM(raw);
  const companies: ScoutCompanyResult[] = [];
  for (const c of parsed) {
    const name = typeof c.name === "string" ? cleanCompanyName(c.name.trim()) : null;
    if (!name) continue;
    companies.push({
      name,
      website: (c.website as string | null) ?? undefined,
      domain: c.website ? extractDomain(c.website as string) : undefined,
      industry: (c.industry as string | null) ?? undefined,
      city: (c.city as string | null) ?? undefined,
      employees:
        normalizeEmployeeField(c.employees as string | null) ||
        extractEmployeesFromText(`${c.name ?? ""} ${c.industry ?? ""} ${c.intelNotes ?? ""}`) ||
        undefined,
      intelNotes: buildIntelNotes(c),
      fitScore: estimateFitScore(c),
      dataSource: "india_directories",
    });
    if (companies.length >= limit) break;
  }
  return companies;
}

export async function indiaDirectoriesSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  meta?: DirectorySearchMeta;
  fetchSeed?: number;
  employeeBands?: string[];
  searchKind?: "industry" | "business";
  /** Parent district cities for ZaubaCorp registry queries when searching Focus Area neighborhoods.
   *  e.g. ["Hosur"] when chips are ["SIPCOT Hosur", "Bagalur Hosur"]. */
  focusCityLabels?: string[];
}): Promise<ScoutCompanyResult[]> {
  const limit = params.limit ?? 20;
  const meta = params.meta;
  const cityStr = citySearchClause(params.cities);
  const searchKind = params.searchKind ?? "industry";
  const indStr =
    params.industries.length > 0
      ? params.industries.slice(0, 3).join(" OR ")
      : searchKind === "business"
        ? "establishments"
        : "corporate";
  const sizeStr = employeeSizeSearchClause(params.employeeBands);

  if (!hasTavilyKey()) {
    throw new Error("TAVILY_API_KEY not set");
  }

  const fetchSeed = params.fetchSeed ?? 0;
  const cityChunks = partitionCitiesForSearch(params.cities);
  const industryChunks = partitionIndustriesForSearch(params.industries);
  const queries: string[] = [];
  let seed = fetchSeed;
  for (const cities of cityChunks) {
    for (const industries of industryChunks) {
      // Two queries per city×industry pair keeps fan-out bounded; cap trims further.
      queries.push(
        ...buildDirectoryQueries(
          cities,
          industries,
          seed++,
          params.employeeBands,
          searchKind,
          params.focusCityLabels,
        ).slice(0, 2),
      );
    }
  }
  const queryBatch = queries.slice(
    0,
    directorySearchQueryCap(limit, queries.length, {
      cityChunks: cityChunks.length,
      industryChunks: industryChunks.length,
    }),
  );
  const perQueryLimit = optimizedMaxResults(Math.ceil(limit / Math.max(queryBatch.length, 1)));

  let quotaExceeded = false;
  const searchErrors: Error[] = [];

  const batches = await mapWithConcurrency(queryBatch, 3, async (q) => {
    try {
      return await tavilySearch(q, perQueryLimit);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      searchErrors.push(err);
      console.error("[india-directories] Tavily search failed:", err.message);
      if (isTavilyQuotaError(err.message)) quotaExceeded = true;
      return [] as { title: string; url: string; content: string }[];
    }
  });

  const allResults = batches.flat();
  const lastError = searchErrors[searchErrors.length - 1] ?? null;

  if (!allResults.length) {
    if (quotaExceeded || (lastError && isTavilyQuotaError(lastError.message))) {
      throw new TavilyQuotaError(TAVILY_QUOTA_INDIA_DIRECTORIES_MSG);
    }
    meta?.warnings.push(
      `No directory listings found for ${cityStr}. Try another city or broader industry filters.`,
    );
    return [];
  }

  const heuristic = parseCompaniesFromDirectoryResults(allResults, params.cities, limit);
  const heuristicReady = fillEmployeesFromHits(heuristic, allResults);
  const strictHeuristic = keepStrictCompaniesOnly(heuristicReady);
  // Skip LLM only when we already have enough registered names (Pvt Ltd / Ltd).
  const heuristicFloor = Math.max(1, Math.min(8, Math.ceil(limit / 4)));
  if (strictHeuristic.length >= heuristicFloor) {
    return strictHeuristic.slice(0, limit);
  }

  const threshold = aiConfidenceThreshold();

  if (hasLLMKey()) {
    const context = allResults
      .slice(0, Math.min(allResults.length, Math.max(12, Math.ceil(limit / 4))))
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 600)}`)
      .join("\n\n");

    try {
      const raw = await callLLM({
        tier: "fast",
        provider: freeCompanyFilterProvider() ?? undefined,
        system: `You extract structured B2B company data for SaaS sales prospecting from Indian MCA / Zauba / directory listings.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item MUST have: { "name": string, "city": string, "industry": string, "employees": string | null, "website": string | null, "phone": string | null, "intelNotes": string | null }
Only include REAL named Indian companies (prefer "… Pvt Ltd" / "… Limited" from Zauba URLs). Do NOT invent companies.
Never use job-post titles, document blurbs, report titles, or review-site headings (Work Satisfaction, Company Culture, Salary) as company names.
Never use addresses, plot numbers, PIN codes, villages, SIPCOT/MIDC/SEZ estates, or "Industrial Area/Complex" labels as company names (e.g. Hosur-635126, Sipcot Industrial Complex).
Never use product titles, prices (INR / Approx), catalog items (name plates, air purifiers), or registry form fields (Company Class, Email ID, Address, Tax) as company names.
Never use UI labels, job categories, neighborhoods, building blocks, or NIC activity lines as company names (Quotations, Contact Number, BPO jobs, Bellandur, Flipkart B Block, LIMITED TECHNOLOGIES).
If a listing is a hiring or reviews page for Acme, return "Acme" only.
Minimum confidence score: ${threshold}.`,
        prompt: `Extract companies from these directory results. Prefer zaubacorp.com / tofler.in registered names.
Target: ${indStr} industry companies in ${cityStr}, India${sizeStr ? `. Scale target: ${sizeStr}` : ""}.
Include real businesses that match the industry and city.
Always fill "employees" with a headcount or one of: Micro Industries, Small scale, Medium scale, Large scale. Use null if unknown.
Skip job boards, articles, and address lists that are not companies.
Do not score or filter for corporate gifting.

${context}

Return up to ${limit} companies.`,
        maxTokens: 2048,
      });

      try {
        const llmResults = parseLLMCompanies(raw, limit);
        const merged = fillEmployeesFromHits(
          dedupeCompaniesByName([...llmResults, ...strictHeuristic, ...heuristicReady]),
          allResults,
        );
        const preferred = keepStrictCompaniesOnly(merged);
        const picked = (preferred.length >= Math.min(8, limit) ? preferred : merged).slice(0, limit);
        if (picked.length) return picked;
        meta?.warnings.push("AI extraction returned no companies — using directory parsing fallback.");
      } catch {
        console.error("[india-directories] parse failed, raw:", raw.slice(0, 200));
        meta?.warnings.push("AI response could not be parsed — using directory parsing fallback.");
      }
    } catch (e) {
      console.error("[india-directories] LLM failed:", e);
      meta?.warnings.push(llmErrorMessage(e));
    }
  } else {
    meta?.warnings.push("LLM API key not set — using Zauba / directory parsing fallback.");
  }

  // In neighborhood/Focus Area mode, JustDial results often have names without "Pvt Ltd",
  // so strictHeuristic may be empty even when heuristicReady has valid companies.
  // Return heuristicReady as the fallback rather than silently returning [].
  const finalFallback =
    params.focusCityLabels?.length && !strictHeuristic.length && heuristicReady.length
      ? heuristicReady
      : strictHeuristic;

  if (!finalFallback.length) {
    meta?.warnings.push(
      "Directory pages were found but no registered company names could be parsed. Try Zauba-friendly industries or another city.",
    );
  }
  return fillEmployeesFromHits(finalFallback, allResults);
}

export async function indiaDirectoriesSearchPeople(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  roleHints?: string[];
  cities?: string[];
  indiaOnly?: boolean;
  localOperators?: boolean;
  locationScope?: "focus" | "interest";
  strictPeopleFilters?: boolean;
  /** Plant-first: search plant city only. HQ corridor: Google-style metro seniors. */
  plantSeatPhase?: "plant" | "hq_corridor";
  goldFewShot?: string;
}): Promise<ScoutPersonResult[]> {
  return searchPeopleViaTavily({
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    limit: params.limit,
    dataSource: "india_directories",
    roleHints: params.roleHints,
    cities: params.cities,
    indiaOnly: params.indiaOnly,
    localOperators: params.localOperators,
    locationScope: params.locationScope,
    strictPeopleFilters: params.strictPeopleFilters,
    plantSeatPhase: params.plantSeatPhase,
    goldFewShot: params.goldFewShot,
  });
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function isKeyDM(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager"].some((k) =>
    t.includes(k),
  );
}

function estimateFitScore(c: Record<string, unknown>): number {
  let score = 58;
  const emp = c.employees as string | null;
  if (emp) {
    const n = parseInt(emp.replace(/[^0-9]/g, ""), 10);
    if (n > 1000) score += 22;
    else if (n > 200) score += 12;
    else if (n > 50) score += 5;
  }
  if (c.website) score += 7;
  return Math.min(score, 99);
}

function buildIntelNotes(c: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (c.phone) parts.push(`Phone: ${c.phone}`);
  if (c.website) parts.push(`Web: ${c.website}`);
  return parts.join(" · ") || undefined;
}
