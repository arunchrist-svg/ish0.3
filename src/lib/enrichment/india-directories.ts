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
import {
  citySearchBatches,
  citySearchClause,
  primaryCitiesForSearch,
  rotateCityBatches,
} from "./city-search";
import { isPlausibleCompanyName, parseCompaniesFromDirectoryResults } from "./directory-parser";
import { searchPeopleViaTavily } from "./people-search";
import { hasLLMKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
import { isTavilyQuotaError, optimizedMaxResults, TavilyQuotaError, tavilySearch } from "./tavily-client";

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

function industryClause(industries: string[]): string {
  return industries.length > 0 ? industries.slice(0, 3).join(" OR ") : "corporate";
}

function buildQueriesForBatches(cities: string[], industries: string[], fetchSeed = 0): string[] {
  const indStr = industryClause(industries);
  const batches = rotateCityBatches(citySearchBatches(cities, 6, 2), fetchSeed);
  const queries: string[] = [];

  batches.forEach((batch, batchIndex) => {
    const cityStr = citySearchClause(batch);
    const primaries = primaryCitiesForSearch(batch);
    queries.push(
      `(${DIRECTORIES.slice(0, 2).join(" OR ")}) ${indStr} companies ${cityStr} India`,
    );
    const focus = primaries.length
      ? primaries[Math.abs(fetchSeed + batchIndex) % primaries.length]
      : undefined;
    if (focus && focus !== "India") {
      queries.push(
        `(site:justdial.com OR site:indiamart.com) ${indStr} companies ${focus} India`,
      );
    }
  });

  return queries.slice(0, 4);
}

function parseLLMCompanies(
  raw: string,
  limit: number,
): ScoutCompanyResult[] {
  const parsed = parseJsonArrayFromLLM(raw);
  return parsed
    .filter((c) => typeof c.name === "string" && isPlausibleCompanyName(c.name.trim()))
    .slice(0, limit)
    .map((c) => ({
    name: (c.name as string).trim(),
    website: (c.website as string | null) ?? undefined,
    domain: c.website ? extractDomain(c.website as string) : undefined,
    industry: (c.industry as string | null) ?? undefined,
    city: (c.city as string | null) ?? undefined,
    employees: (c.employees as string | null) ?? undefined,
    intelNotes: buildIntelNotes(c),
    fitScore: estimateFitScore(c),
    dataSource: "india_directories",
  }));
}

export async function indiaDirectoriesSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  meta?: DirectorySearchMeta;
  fetchSeed?: number;
}): Promise<ScoutCompanyResult[]> {
  const limit = params.limit ?? 20;
  const meta = params.meta;
  const cityStr = citySearchClause(params.cities);
  const indStr =
    params.industries.length > 0
      ? params.industries.slice(0, 3).join(" OR ")
      : "corporate";

  if (!hasTavilyKey()) {
    throw new Error("TAVILY_API_KEY not set");
  }

  const fetchSeed = params.fetchSeed ?? 0;
  const queryBatch = buildQueriesForBatches(params.cities, params.industries, fetchSeed);
  const perQueryLimit = optimizedMaxResults(Math.ceil(limit / 3));

  let quotaExceeded = false;
  const searchErrors: Error[] = [];

  const batches = await Promise.all(
    queryBatch.map(async (q) => {
      try {
        return await tavilySearch(q, perQueryLimit);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        searchErrors.push(err);
        console.error("[india-directories] Tavily search failed:", err.message);
        if (isTavilyQuotaError(err.message)) quotaExceeded = true;
        return [] as { title: string; url: string; content: string }[];
      }
    }),
  );

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

  const threshold = aiConfidenceThreshold();

  if (hasLLMKey()) {
    const context = allResults
      .slice(0, 12)
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
If a listing is a hiring or reviews page for Acme, return "Acme" only.
Minimum confidence score: ${threshold}.`,
        prompt: `Extract companies from these directory results.
Target: ${indStr} industry companies in ${cityStr}, India.
Include real businesses of any size that match the industry and city.
Skip job boards, articles, and address lists that are not companies.
Do not score or filter for corporate gifting.

${context}

Return up to ${limit} companies.`,
        maxTokens: 2048,
      });

      try {
        const llmResults = parseLLMCompanies(raw, limit);
        if (llmResults.length) return llmResults;
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
  return heuristic;
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
