import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { citySearchClause } from "./city-search";
import { isPlausibleCompanyName, parseCompaniesFromDirectoryResults } from "./directory-parser";
import { hasLLMKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
import { searchPeopleViaTavily } from "./people-search";
import type { DirectorySearchMeta } from "./india-directories";
import { tavilySearch } from "./tavily-client";

export async function tavilySearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  meta?: DirectorySearchMeta;
  nameQuery?: string;
}): Promise<ScoutCompanyResult[]> {
  const cityStr = citySearchClause(params.cities);
  const indStr = params.industries.length > 0 ? params.industries.join(" OR ") : "corporate";
  const query = params.nameQuery
    ? `${params.nameQuery} company India`
    : `${indStr} companies ${cityStr} India`;
  const meta = params.meta;
  const limit = params.limit ?? 10;

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  const results = await tavilySearch(query, limit);
  if (!results.length) {
    meta?.warnings.push(`No web results found for ${cityStr}.`);
    return [];
  }

  const heuristic = parseCompaniesFromDirectoryResults(results, params.cities, limit).map((c) => ({
    ...c,
    dataSource: "tavily+llm" as const,
  }));
  if (heuristic.length >= Math.min(limit, 5)) {
    return heuristic.slice(0, limit);
  }

  if (hasLLMKey()) {
    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
      .join("\n\n");

    try {
      const system = `You extract structured company data for B2B SaaS sales prospecting.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item: { "name": string, "domain": string | null, "industry": string, "city": string, "employees": string | null, "intelNotes": string | null }
Only include REAL registered company / brand names (e.g. "Infosys", "SingleStore", "Bosch India").
Never use job-post titles, document blurbs, report titles, or UI text as company names
(e.g. reject "Samsara is Hiring", "View 295 Jobs", "This document contains...", "India in 2026").
If a result is a hiring page for Acme, return "Acme" only. Do NOT invent companies.
Do not score or filter for corporate gifting.`;
      const prompt = `Extract companies from these search results.
Target: ${indStr} companies in ${cityStr}, India.
Prefer established businesses; include manufacturers and corporate offices when listed.
Skip any result that is not clearly a company name.

${context}

Return up to ${limit} companies.`;

      const raw = await callLLM({ tier: "fast", system, prompt, maxTokens: 2048 });
      let parsed: Record<string, unknown>[] = [];
      try {
        parsed = parseJsonArrayFromLLM(raw);
      } catch {
        meta?.warnings.push("AI response could not be parsed — using web parsing fallback.");
        return heuristic;
      }

      const mapped = parsed
        .filter((c) => typeof c.name === "string" && isPlausibleCompanyName(c.name.trim()))
        .slice(0, limit)
        .map((c) => ({
          name: (c.name as string).trim(),
          domain: (c.domain as string | null) ?? undefined,
          industry: (c.industry as string | null) ?? undefined,
          city: (c.city as string | null) ?? undefined,
          employees: (c.employees as string | null) ?? undefined,
          intelNotes: (c.intelNotes as string | null) ?? undefined,
          fitScore: 65,
          dataSource: "tavily+llm",
        }));
      if (mapped.length) return mapped;
      meta?.warnings.push("AI extraction returned no companies — using web parsing fallback.");
    } catch (e) {
      console.error("[tavily] LLM failed:", e);
      meta?.warnings.push(llmErrorMessage(e));
    }
  } else {
    meta?.warnings.push("LLM API key not set — using web parsing fallback.");
  }

  return heuristic;
}

export async function tavilySearchPeople(params: {
  companyName: string;
  companyDomain?: string;
  titles: string[];
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  return searchPeopleViaTavily({
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    limit: params.limit,
    dataSource: "tavily+llm",
  });
}
