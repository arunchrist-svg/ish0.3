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
import { parseCompaniesFromDirectoryResults } from "./directory-parser";
import { searchPeopleViaTavily } from "./people-search";
import { hasGeminiKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
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

function buildQueries(cities: string[], industries: string[], fetchSeed = 0): string[] {
  const cityStr = citySearchClause(cities);
  const indStr =
    industries.length > 0 ? industries.slice(0, 3).join(" OR ") : "corporate";

  const queries = [
    `(${DIRECTORIES.slice(0, 2).join(" OR ")}) ${indStr} companies ${cityStr} India`,
    `(${DIRECTORIES.slice(2, 4).join(" OR ")}) ${indStr} businesses ${cityStr}`,
    `ZaubaCorp ${indStr} ${cityStr} India registered companies`,
  ];

  // Per-city queries improve coverage for smaller cities like Hosur
  for (const city of expandCitySearchTerms(cities).slice(0, 3)) {
    queries.push(
      `(site:justdial.com OR site:indiamart.com) ${indStr} companies ${city} India`,
    );
  }

  const extras = [
    `site:indiamart.com ${indStr} ${cityStr} company directory`,
    `site:tradeindia.com ${indStr} manufacturers ${cityStr}`,
    `site:sulekha.com ${indStr} companies ${cityStr}`,
  ];
  const offset = Math.abs(fetchSeed) % extras.length;
  const rotatedExtras = [...extras.slice(offset), ...extras.slice(0, offset)];

  return [...queries, ...rotatedExtras];
}

function parseLLMCompanies(
  raw: string,
  cities: string[],
  limit: number,
): ScoutCompanyResult[] {
  const parsed = parseJsonArrayFromLLM(raw);
  return parsed
    .filter((c) => typeof c.name === "string" && c.name.trim())
    .slice(0, limit)
    .map((c) => ({
    name: c.name as string,
    website: (c.website as string | null) ?? undefined,
    domain: c.website ? extractDomain(c.website as string) : undefined,
    industry: (c.industry as string | null) ?? undefined,
    city: (c.city as string | null) ?? cities[0],
    employees: (c.employees as string | null) ?? undefined,
    intelNotes: buildIntelNotes(c),
    giftScore: estimateGiftScore(c),
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

  const allResults: { title: string; url: string; content: string }[] = [];
  const fetchSeed = params.fetchSeed ?? 0;
  const queries = buildQueries(params.cities, params.industries, fetchSeed);

  const queryBatch = queries.slice(0, 2);
  let quotaExceeded = false;
  let lastError: Error | null = null;

  for (const q of queryBatch) {
    try {
      const res = await tavilySearch(q, optimizedMaxResults(Math.ceil(limit / 3)));
      allResults.push(...res);
      if (allResults.length >= limit) break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error("[india-directories] Tavily search failed:", lastError.message);
      if (isTavilyQuotaError(lastError.message)) {
        quotaExceeded = true;
        break;
      }
    }
  }

  if (!allResults.length) {
    if (quotaExceeded || (lastError && isTavilyQuotaError(lastError.message))) {
      throw new TavilyQuotaError();
    }
    meta?.warnings.push(
      `No directory listings found for ${cityStr}. Try another city or broader industry filters.`,
    );
    return [];
  }

  const threshold = aiConfidenceThreshold();

  if (hasGeminiKey()) {
    const context = allResults
      .slice(0, 12)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 600)}`)
      .join("\n\n");

    try {
      const raw = await callLLM({
        tier: "fast",
        system: `You extract structured B2B company data for corporate gifting lead generation from Indian business directory listings.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item MUST have: { "name": string, "city": string, "industry": string, "employees": string | null, "website": string | null, "phone": string | null, "intelNotes": string | null }
Only include REAL named Indian companies with ≥50 employees or clearly corporate. Do NOT invent companies.
Minimum confidence score: ${threshold}.`,
        prompt: `Extract companies from these directory results.
Target: ${indStr} industry companies in ${cityStr}, India.
Minimum confidence: company must be named, local, and plausibly corporate.

${context}

Return up to ${limit} companies.`,
        maxTokens: 1500,
      });

      try {
        const llmResults = parseLLMCompanies(raw, params.cities, limit);
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
    meta?.warnings.push("GEMINI_API_KEY not set — using directory parsing fallback.");
  }

  const fallback = parseCompaniesFromDirectoryResults(allResults, params.cities, limit);
  if (!fallback.length) {
    meta?.warnings.push(
      "Directory pages were found but no company names could be parsed. Try different cities or industries.",
    );
  }
  return fallback;
}

export async function indiaDirectoriesSearchPeople(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  roleHints?: string[];
}): Promise<ScoutPersonResult[]> {
  return searchPeopleViaTavily({
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    limit: params.limit,
    dataSource: "india_directories",
    roleHints: params.roleHints,
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

function estimateGiftScore(c: Record<string, unknown>): number {
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
