import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import { normalizeLinkedInUrl } from "@/lib/utils";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { citySearchClause } from "./city-search";
import { parseCompaniesFromDirectoryResults } from "./directory-parser";
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
    : `corporate companies ${indStr} ${cityStr} India employee gifting Diwali`;
  const meta = params.meta;

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  const results = await tavilySearch(query, params.limit ?? 10);
  if (!results.length) {
    meta?.warnings.push(`No web results found for ${cityStr}.`);
    return [];
  }

  if (hasLLMKey()) {
    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
      .join("\n\n");

    try {
      const raw = await callLLM({
        tier: "fast",
        system: `You extract structured company data for B2B corporate gifting lead generation.
Output ONLY valid JSON array. Each item: { name, domain, industry, city, employees, intelNotes }.
Only include real companies. Minimum confidence 40. Do NOT invent companies.`,
        prompt: `Extract companies from these search results. Target: ${indStr} industries in ${cityStr}, India, employee count > 50.\n\n${context}`,
        maxTokens: 1024,
      });

      try {
        const parsed = parseJsonArrayFromLLM(raw);
        const mapped = parsed.map((c) => ({
          name: c.name as string,
          domain: c.domain as string | undefined,
          industry: c.industry as string | undefined,
          city: c.city as string | undefined,
          employees: c.employees as string | undefined,
          intelNotes: c.intelNotes as string | undefined,
          giftScore: 65,
          dataSource: "tavily+llm",
        }));
        if (mapped.length) return mapped;
        meta?.warnings.push("AI extraction returned no companies — using web parsing fallback.");
      } catch {
        meta?.warnings.push("AI response could not be parsed — using web parsing fallback.");
      }
    } catch (e) {
      console.error("[tavily] LLM failed:", e);
      meta?.warnings.push(llmErrorMessage(e));
    }
  } else {
    meta?.warnings.push("LLM API key not set — using web parsing fallback.");
  }

  return parseCompaniesFromDirectoryResults(results, params.cities, params.limit ?? 10).map((c) => ({
    ...c,
    dataSource: "tavily+llm",
  }));
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

function isKeyDM(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp"].some((k) => t.includes(k));
}
