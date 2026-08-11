import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { citySearchClause } from "./city-search";
import { employeeSizeSearchClause, extractEmployeesFromText } from "./employee-size";
import {
  companyMatchesNameQuery,
  filterCompaniesMatchingQuery,
  isGeographicEntity,
} from "./company-name-match";
import { isPlausibleCompanyName, parseCompaniesFromDirectoryResults } from "./directory-parser";
import { hasLLMKey, hasTavilyKey, llmErrorMessage } from "./discovery-prerequisites";
import { searchPeopleViaTavily } from "./people-search";
import type { DirectorySearchMeta } from "./india-directories";
import { tavilySearch } from "./tavily-client";
import { domainFromWebsite } from "./provider-utils";

const DIRECTORY_HOSTS = [
  "justdial.com",
  "indiamart.com",
  "sulekha.com",
  "zaubacorp.com",
  "zauba.com",
  "tradeindia.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "google.com",
  "apollo.io",
];

function isDirectoryHost(domain: string): boolean {
  const lower = domain.toLowerCase();
  return DIRECTORY_HOSTS.some((host) => lower === host || lower.endsWith(`.${host}`));
}

export function buildCompanyLookupQuery(name: string, cities: string[]): string {
  const cityStr = citySearchClause(cities);
  const cityHint = cityStr && cityStr !== "India" ? ` ${cityStr}` : "";
  return `"${name.trim()}" company${cityHint} India`;
}

/** Pull the typed company out of web hits without treating nearby geo tokens as names. */
export function lookupCompaniesFromHits(
  hits: { title: string; url: string; content: string }[],
  targetName: string,
  cities: string[],
): ScoutCompanyResult[] {
  const query = targetName.trim();
  if (!query || isGeographicEntity(query)) return [];

  const compactQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const mentioned = hits.some((hit) => {
    const blob = `${hit.title} ${hit.content} ${hit.url}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return compactQuery.length >= 4 && blob.includes(compactQuery);
  });
  if (!mentioned) return [];

  let domain: string | undefined;
  let website: string | undefined;
  for (const hit of hits) {
    const host = domainFromWebsite(hit.url);
    if (host && !isDirectoryHost(host)) {
      domain = host;
      website = hit.url.startsWith("http") ? hit.url : `https://${hit.url}`;
      break;
    }
  }

  return [
    {
      name: query,
      domain,
      website,
      city: cities[0],
      intelNotes: "Resolved from company name search",
      fitScore: 70,
      dataSource: "tavily+llm",
    },
  ];
}

export function filterLookupLlmCompanies(
  parsed: Record<string, unknown>[],
  targetName: string,
  limit: number,
): ScoutCompanyResult[] {
  return filterCompaniesMatchingQuery(
    parsed
      .filter((c) => typeof c.name === "string" && isPlausibleCompanyName((c.name as string).trim()))
      .map((c) => ({
        name: (c.name as string).trim(),
        domain: (c.domain as string | null) ?? undefined,
        website: (c.website as string | null) ?? undefined,
        industry: (c.industry as string | null) ?? undefined,
        city: (c.city as string | null) ?? undefined,
        employees:
          (c.employees as string | null)?.trim() ||
          extractEmployeesFromText(`${c.name ?? ""} ${c.intelNotes ?? ""}`) ||
          undefined,
        intelNotes: (c.intelNotes as string | null) ?? undefined,
        fitScore: 70,
        dataSource: "tavily+llm",
      })),
    targetName,
  )
    .filter((c) => companyMatchesNameQuery(c, targetName))
    .slice(0, limit);
}

async function tavilyLookupCompany(params: {
  name: string;
  cities: string[];
  industries: string[];
  limit: number;
  meta?: DirectorySearchMeta;
}): Promise<ScoutCompanyResult[]> {
  const meta = params.meta;
  const query = buildCompanyLookupQuery(params.name, params.cities);
  const results = await tavilySearch(query, Math.max(params.limit, 5));
  if (!results.length) {
    meta?.warnings.push(`No web results found for "${params.name}".`);
    return [];
  }

  const fromHits = lookupCompaniesFromHits(results, params.name, params.cities);

  if (hasLLMKey()) {
    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
      .join("\n\n");
    const cityStr = citySearchClause(params.cities);

    try {
      const system = `You look up one specific company for B2B sales prospecting.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item: { "name": string, "domain": string | null, "industry": string, "city": string, "employees": string | null, "intelNotes": string | null }
Return only the target company (legal name and brand aliases that are the same org).
Never return states, cities, countries, job posts, documents, or unrelated companies.`;
      const prompt = `Target company: "${params.name}"
Location hint: ${cityStr || "India"}

Extract that company from these search results. If the legal name differs (e.g. brand vs registered entity), include it only when it is clearly the same company and include the official domain.

${context}

Return up to ${params.limit} matching companies. Return [] if the target is not found.`;

      const raw = await callLLM({ tier: "fast", system, prompt, maxTokens: 2048 });
      try {
        const parsed = parseJsonArrayFromLLM(raw);
        const mapped = filterLookupLlmCompanies(parsed, params.name, params.limit);
        if (mapped.length) return mapped;
      } catch {
        meta?.warnings.push("AI response could not be parsed — using name lookup fallback.");
      }
    } catch (e) {
      console.error("[tavily] lookup LLM failed:", e);
      meta?.warnings.push(llmErrorMessage(e));
    }
  }

  return fromHits.slice(0, params.limit);
}

async function tavilyDiscoverCompanies(params: {
  cities: string[];
  industries: string[];
  limit: number;
  meta?: DirectorySearchMeta;
  employeeBands?: string[];
}): Promise<ScoutCompanyResult[]> {
  const cityStr = citySearchClause(params.cities);
  const indStr = params.industries.length > 0 ? params.industries.join(" OR ") : "corporate";
  const sizeStr = employeeSizeSearchClause(params.employeeBands);
  const query = `${indStr} companies ${cityStr}${sizeStr ? ` ${sizeStr}` : ""} India`;
  const meta = params.meta;

  const results = await tavilySearch(query, params.limit);
  if (!results.length) {
    meta?.warnings.push(`No web results found for ${cityStr}.`);
    return [];
  }

  const heuristic = parseCompaniesFromDirectoryResults(results, params.cities, params.limit).map((c) => ({
    ...c,
    dataSource: "tavily+llm" as const,
  }));

  if (hasLLMKey()) {
    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
      .join("\n\n");

    try {
      const system = `You extract structured company data for B2B SaaS sales prospecting.
Output ONLY a valid JSON array. No markdown fences. No explanation.
Each item: { "name": string, "domain": string | null, "industry": string, "city": string, "employees": string | null, "intelNotes": string | null }
Only include REAL registered company / brand names (e.g. "Infosys", "SingleStore", "Bosch India").
Never use job-post titles, document blurbs, report titles, review-site section headings, or UI text as company names
(e.g. reject "Samsara is Hiring", "Work Satisfaction", "Company Culture", "Salary", "India in 2026").
If a result is a hiring or reviews page for Acme, return "Acme" only. Do NOT invent companies.
Do not score or filter for corporate gifting.`;
      const prompt = `Extract companies from these search results.
Target: ${indStr} companies in ${cityStr}, India${sizeStr ? `. Scale target: ${sizeStr}` : ""}.
Prefer established businesses; include manufacturers and corporate offices when listed.
Always fill "employees" with a headcount or one of: Micro Industries, Small scale, Medium scale, Large scale. Use null if unknown.
Skip any result that is not clearly a company name.

${context}

Return up to ${params.limit} companies.`;

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
        .slice(0, params.limit)
        .map((c) => ({
          name: (c.name as string).trim(),
          domain: (c.domain as string | null) ?? undefined,
          industry: (c.industry as string | null) ?? undefined,
          city: (c.city as string | null) ?? undefined,
          employees:
            (c.employees as string | null)?.trim() ||
            extractEmployeesFromText(`${c.name ?? ""} ${c.intelNotes ?? ""}`) ||
            undefined,
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

export async function tavilySearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  meta?: DirectorySearchMeta;
  nameQuery?: string;
  employeeBands?: string[];
}): Promise<ScoutCompanyResult[]> {
  const limit = params.limit ?? 10;

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  if (params.nameQuery?.trim()) {
    return tavilyLookupCompany({
      name: params.nameQuery.trim(),
      cities: params.cities,
      industries: params.industries,
      limit,
      meta: params.meta,
    });
  }

  return tavilyDiscoverCompanies({
    cities: params.cities,
    industries: params.industries,
    limit,
    meta: params.meta,
    employeeBands: params.employeeBands,
  });
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
