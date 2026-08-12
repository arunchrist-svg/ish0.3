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
import { citySearchClause, expandCitySearchTerms } from "./city-search";
import {
  employeeSizeSearchClause,
  extractEmployeesFromHits,
  extractEmployeesFromText,
  normalizeEmployeeField,
} from "./employee-size";
import { cleanCompanyName, parseCompaniesFromDirectoryResults } from "./directory-parser";
import { searchPeopleViaTavily } from "./people-search";
import { hasLLMKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
import { isTavilyQuotaError, optimizedMaxResults, TavilyQuotaError, tavilySearch } from "./tavily-client";
import { mapWithConcurrency } from "@/lib/async";

const DIRECTORIES = [
  "site:justdial.com",
  "site:indiamart.com",
  "site:sulekha.com",
  "site:zauba.com",
  "site:tradeindia.com",
];

export type DirectorySearchMeta = {
  warnings: string[];
};


function aiConfidenceThreshold(): number {
  const raw = process.env.PROSPECTING_AI_CONFIDENCE_THRESHOLD;
  const parsed = raw ? parseInt(raw, 10) : 40;
  return Number.isFinite(parsed) ? parsed : 40;
}

function buildQueries(cities: string[], industries: string[], fetchSeed = 0, employeeBands: string[] = []): string[] {
  const cityStr = citySearchClause(cities);
  const indStr =
    industries.length > 0 ? industries.slice(0, 3).join(" OR ") : "corporate";
  const sizeStr = employeeSizeSearchClause(employeeBands);
  const sizeBit = sizeStr ? ` ${sizeStr}` : "";

  const queries = [
    `(${DIRECTORIES.slice(0, 2).join(" OR ")}) ${indStr} companies ${cityStr}${sizeBit} India`,
    `(${DIRECTORIES.slice(2, 4).join(" OR ")}) ${indStr} businesses ${cityStr}${sizeBit}`,
    `ZaubaCorp ${indStr} ${cityStr} India registered companies`,
  ];

  // Per-city queries improve coverage for smaller cities like Hosur
  for (const city of expandCitySearchTerms(cities).slice(0, 3)) {
    queries.push(
      `(site:justdial.com OR site:indiamart.com) ${indStr} companies ${city}${sizeBit} India`,
    );
  }

  const extras = [
    `site:indiamart.com ${indStr} ${cityStr}${sizeBit} company directory`,
    `site:tradeindia.com ${indStr} manufacturers ${cityStr}${sizeBit}`,
    `site:sulekha.com ${indStr} companies ${cityStr}${sizeBit}`,
  ];
  const offset = Math.abs(fetchSeed) % extras.length;
  const rotatedExtras = [...extras.slice(offset), ...extras.slice(0, offset)];

  return [...queries, ...rotatedExtras];
}

export function directoryQueryBatchCount(limit: number, available: number): number {
  return Math.min(available, Math.max(2, Math.ceil(Math.max(limit, 1) / 8)));
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
}): Promise<ScoutCompanyResult[]> {
  const limit = params.limit ?? 20;
  const meta = params.meta;
  const cityStr = citySearchClause(params.cities);
  const indStr =
    params.industries.length > 0
      ? params.industries.slice(0, 3).join(" OR ")
      : "corporate";
  const sizeStr = employeeSizeSearchClause(params.employeeBands);

  if (!hasTavilyKey()) {
    throw new Error("TAVILY_API_KEY not set");
  }

  const fetchSeed = params.fetchSeed ?? 0;
  const queries = buildQueries(params.cities, params.industries, fetchSeed, params.employeeBands);
  // Cap at 2 queries for Scout speed (was up to ceil(limit/8)).
  const queryBatch = queries.slice(0, Math.min(2, directoryQueryBatchCount(limit, queries.length)));
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
      throw new TavilyQuotaError();
    }
    meta?.warnings.push(
      `No directory listings found for ${cityStr}. Try another city or broader industry filters.`,
    );
    return [];
  }

  const heuristic = parseCompaniesFromDirectoryResults(allResults, params.cities, limit);
  const heuristicReady = fillEmployeesFromHits(heuristic, allResults);
  // Heuristic-first: skip LLM extract when directory parse already has enough companies.
  const heuristicFloor = Math.max(1, Math.ceil(limit / 2));
  if (heuristicReady.length >= heuristicFloor) {
    return heuristicReady.slice(0, limit);
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
        system: `You extract structured B2B company data for SaaS sales prospecting from Indian business directory listings.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item MUST have: { "name": string, "city": string, "industry": string, "employees": string | null, "website": string | null, "phone": string | null, "intelNotes": string | null }
Only include REAL named Indian companies. Do NOT invent companies.
Never use job-post titles, document blurbs, report titles, or review-site headings (Work Satisfaction, Company Culture, Salary) as company names.
Never use addresses, plot numbers, PIN codes, villages, SIPCOT/MIDC/SEZ estates, or "Industrial Area/Complex" labels as company names (e.g. Hosur-635126, Sipcot Industrial Complex).
Never use product titles, prices (INR / Approx), catalog items (name plates, air purifiers), or registry form fields (Company Class, Email ID, Address, Tax) as company names.
Never use UI labels, job categories, neighborhoods, building blocks, or NIC activity lines as company names (Quotations, Contact Number, BPO jobs, Bellandur, Flipkart B Block, LIMITED TECHNOLOGIES).
If a listing is a hiring or reviews page for Acme, return "Acme" only.
Minimum confidence score: ${threshold}.`,
        prompt: `Extract companies from these directory results.
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
          dedupeCompaniesByName([...llmResults, ...heuristic]),
          allResults,
        ).slice(0, limit);
        if (merged.length) return merged;
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
    meta?.warnings.push("LLM API key not set — using directory parsing fallback.");
  }

  if (!heuristic.length) {
    meta?.warnings.push(
      "Directory pages were found but no company names could be parsed. Try different cities or industries.",
    );
  }
  return fillEmployeesFromHits(heuristic, allResults);
}

export async function indiaDirectoriesSearchPeople(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  roleHints?: string[];
  cities?: string[];
}): Promise<ScoutPersonResult[]> {
  return searchPeopleViaTavily({
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    limit: params.limit,
    dataSource: "india_directories",
    roleHints: params.roleHints,
    cities: params.cities,
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
