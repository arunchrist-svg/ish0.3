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
    : `${indStr} companies ${cityStr} India`;
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
      const system = `You extract structured company data for B2B corporate gifting lead generation.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item: { "name": string, "domain": string | null, "industry": string, "city": string, "employees": string | null, "intelNotes": string | null }
Only include real companies from the listings. Do NOT invent companies.`;
      const prompt = `Extract companies from these search results.
Target: ${indStr} companies in ${cityStr}, India.
Prefer established businesses; include manufacturers and corporate offices when listed.

${context}

Return up to ${params.limit ?? 10} companies.`;

      let raw = await callLLM({ tier: "quality", system, prompt, maxTokens: 2048 });
      let parsed: Record<string, unknown>[] = [];
      try {
        parsed = parseJsonArrayFromLLM(raw);
      } catch {
        raw = await callLLM({ tier: "quality", system, prompt, maxTokens: 4096 });
        parsed = parseJsonArrayFromLLM(raw);
      }

      const mapped = parsed
        .filter((c) => typeof c.name === "string" && c.name.trim())
        .slice(0, params.limit ?? 10)
        .map((c) => ({
          name: c.name as string,
          domain: (c.domain as string | null) ?? undefined,
          industry: (c.industry as string | null) ?? undefined,
          city: (c.city as string | null) ?? undefined,
          employees: (c.employees as string | null) ?? undefined,
          intelNotes: (c.intelNotes as string | null) ?? undefined,
          giftScore: 65,
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
