/**
 * Shared people discovery via Tavily web search + Gemini extraction,
 * with heuristic LinkedIn parsing fallback.
 */
import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import { normalizeLinkedInUrl } from "@/lib/utils";
import type { ScoutPersonResult } from "./types";
import { computeSeniorityScore } from "./seniority-score";
import { hasLLMKey, hasTavilyKey } from "./discovery-prerequisites";
import { parsePeopleFromSearchResults } from "./people-parser";
import { isTavilyQuotaError, optimizedMaxResults, TavilyQuotaError, TAVILY_QUOTA_PEOPLE_MSG, tavilySearch } from "./tavily-client";
import { citySearchClause, selectPeopleForScoutCities } from "./city-search";
import {
  hitShowsCurrentEmployment,
  personFieldsShowCurrentEmployment,
  personTitleConflictsWithCompany,
} from "@/lib/enrichment/person-company-match";
import { sanitizeJobTitle } from "@/lib/enrichment/job-title";
import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";

/** Short scout names → LinkedIn-friendly employer strings. */
const BRAND_SEARCH_NAMES: Record<string, string[]> = {
  titan: ["Titan Company", "Titan"],
  bosch: ["Bosch", "Bosch Limited"],
  infosys: ["Infosys", "Infosys Limited"],
  biocon: ["Biocon", "Biocon Limited"],
  wipro: ["Wipro", "Wipro Limited"],
  prestige: ["Prestige Group", "Prestige"],
};

function cleanCompanyName(name: string): string {
  return name
    .replace(/\(\s*corporate office\s*\)/gi, "")
    .replace(/\(\s*head office\s*\)/gi, "")
    .replace(/\b(pvt\.?\s*ltd\.?|limited|llp|inc\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Primary + alias names used in LinkedIn queries (e.g. Titan → Titan Company). */
export function companyPeopleSearchNames(companyName: string): string[] {
  const cleaned = cleanCompanyName(companyName);
  if (!cleaned) return [];
  const key = normalizeCompanyName(cleaned);
  const first = key.split(/\s+/).filter(Boolean)[0] ?? key;
  const brands = BRAND_SEARCH_NAMES[key] ?? BRAND_SEARCH_NAMES[first] ?? [];
  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return;
    out.push(trimmed);
  };
  for (const brand of brands) push(brand);
  push(cleaned);
  return out.slice(0, 3);
}

function isKeyDM(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager", "people"].some(
    (k) => t.includes(k),
  );
}

function titleMatchesRoleHints(title: string | null | undefined, roleHints: string[]): boolean {
  if (!roleHints.length) return true;
  const hay = (title ?? "").toLowerCase();
  if (!hay) return false;
  return roleHints.some((hint) => hay.includes(hint.toLowerCase()));
}

function mapLLMPerson(p: Record<string, unknown>, dataSource: string): ScoutPersonResult | null {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 3) return null;

  const title = sanitizeJobTitle((p.title as string | null) ?? undefined);
  const location =
    (typeof p.location === "string" && p.location.trim()) ||
    (typeof p.city === "string" && p.city.trim()) ||
    undefined;
  return {
    name,
    title,
    department: (p.department as string | null) ?? undefined,
    seniority: (p.seniority as string | null) ?? undefined,
    linkedIn: normalizeLinkedInUrl(p.linkedIn as string | null),
    location,
    bio: (p.bio as string | null) ?? undefined,
    email: undefined,
    emailStatus: "missing",
    isKeyDM: isKeyDM(title),
    matchScore: computeSeniorityScore({ title, isKeyDM: isKeyDM(title), emailStatus: "missing" }).total,
    dataSource,
  };
}

function filterPeopleByCities(people: ScoutPersonResult[], cities?: string[]): ScoutPersonResult[] {
  if (!cities?.length) return people;
  return selectPeopleForScoutCities(people, cities).people;
}

/** Drop LLM inventions that stamp the scout company onto someone at a different employer. */
function llmPersonSupportedBySearchHits(
  person: ScoutPersonResult,
  hits: { title: string; url: string; content: string }[],
  companyNames: string[],
): boolean {
  const linkedIn = person.linkedIn?.toLowerCase();
  if (linkedIn) {
    const slug = linkedIn.replace(/^https?:\/\//, "").replace(/^(?:[\w-]+\.)?linkedin\.com\/in\//, "");
    const hit = hits.find((row) => {
      const blob = `${row.title}\n${row.url}\n${row.content}`.toLowerCase();
      return Boolean(slug) && (blob.includes(slug) || row.url.toLowerCase().includes(slug));
    });
    if (!hit) return false;
    return companyNames.some((name) => hitShowsCurrentEmployment(hit, name));
  }

  return companyNames.some(
    (name) =>
      personFieldsShowCurrentEmployment(person, name) &&
      !personTitleConflictsWithCompany(person.title, name),
  );
}

function dedupePeople(people: ScoutPersonResult[]): ScoutPersonResult[] {
  const seen = new Set<string>();
  const out: ScoutPersonResult[] = [];
  for (const person of people) {
    const key = person.linkedIn?.toLowerCase() || person.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(person);
  }
  return out;
}

export function buildPeopleSearchQueries(params: {
  company: string;
  roleTerm: string;
  cityClause: string;
  companyDomain?: string;
  hasCityFilter: boolean;
  companyAliases?: string[];
}): string[] {
  const companies = [params.company, ...(params.companyAliases ?? [])].filter(
    (name, index, all) => name && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
  const queries: string[] = [];
  const geoTerm = params.hasCityFilter ? `(${params.cityClause})` : "India";

  for (const company of companies.slice(0, 2)) {
    queries.push(`site:linkedin.com/in "${company}" ${params.roleTerm} ${geoTerm}`);
    queries.push(`"${company}" ${params.roleTerm} LinkedIn profile ${geoTerm}`);
  }

  if (!params.hasCityFilter) {
    queries.push(`site:linkedin.com/in "${params.company}" Director OR Manager OR Head India`);
  }

  if (params.companyDomain) {
    queries.push(
      `site:${params.companyDomain} leadership OR team OR "our people" OR contact ${geoTerm}`,
    );
  }

  return [...new Set(queries)].slice(0, 8);
}

export async function searchPeopleViaTavily(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  dataSource?: string;
  roleHints?: string[];
  cities?: string[];
}): Promise<ScoutPersonResult[]> {
  const limit = params.limit ?? 8;
  const dataSource = params.dataSource ?? "tavily+llm";
  const searchNames = companyPeopleSearchNames(params.companyName);
  const company = searchNames[0] ?? cleanCompanyName(params.companyName);
  const companyAliases = searchNames.slice(1);
  const roleHints = params.roleHints ?? [];
  const cityClause = params.cities?.length ? citySearchClause(params.cities, 4) : "India";

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  const roleTerm =
    roleHints.length > 0
      ? roleHints.slice(0, 5).join(" OR ")
      : "Director OR Manager OR Head OR Founder OR VP OR CEO";

  const queries = buildPeopleSearchQueries({
    company,
    roleTerm,
    cityClause,
    companyDomain: params.companyDomain,
    hasCityFilter: Boolean(params.cities?.length),
    companyAliases,
  });

  const allResults: { title: string; url: string; content: string }[] = [];
  const errors: Error[] = [];
  let quotaHit = false;
  const perQueryLimit = optimizedMaxResults(Math.ceil(limit / 2));

  async function runQueryBatch(batch: string[]) {
    const tavilyBatches = await Promise.all(
      batch.map(async (q) => {
        try {
          return await tavilySearch(q, perQueryLimit);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          console.error("[people-search] Tavily query failed:", q, err.message);
          if (isTavilyQuotaError(err.message)) quotaHit = true;
          errors.push(err);
          return [] as { title: string; url: string; content: string }[];
        }
      }),
    );
    for (const hits of tavilyBatches) allResults.push(...hits);
  }

  // Cap at 2 queries for scout speed. Extra batches were the main reason
  // "Finding decision-makers (0 of N)" sat still for minutes on multi-company fetch.
  await runQueryBatch(queries.slice(0, 2));
  if (!allResults.length && queries.length > 2) {
    await runQueryBatch(queries.slice(2, 4));
  }

  if (!allResults.length) {
    if (quotaHit) {
      throw new TavilyQuotaError(TAVILY_QUOTA_PEOPLE_MSG);
    }
    const lastError = errors[errors.length - 1];
    if (lastError && isTavilyQuotaError(lastError.message)) {
      throw new TavilyQuotaError(TAVILY_QUOTA_PEOPLE_MSG);
    }
    if (lastError) throw lastError;
    return [];
  }

  const matchCompany = (person: ScoutPersonResult) =>
    searchNames.some((name) => personFieldsShowCurrentEmployment(person, name)) &&
    !personTitleConflictsWithCompany(person.title, company);

  const heuristicRaw = dedupePeople(
    searchNames.flatMap((name) =>
      parsePeopleFromSearchResults(
        allResults,
        Math.max(limit * 3, 12),
        `${dataSource}_heuristic`,
        name,
      ),
    ),
  );
  const heuristic = filterPeopleByCities(heuristicRaw, params.cities);
  const roleMatchedHeuristic = roleHints.length
    ? heuristic.filter((p) => titleMatchesRoleHints(p.title, roleHints))
    : heuristic;

  // Prefer heuristic when we already have role matches — skip LLM for scout speed.
  if (roleMatchedHeuristic.length > 0) {
    return roleMatchedHeuristic.slice(0, limit);
  }
  if (heuristic.length > 0 && roleHints.length === 0) {
    return heuristic.slice(0, limit);
  }

  // LLM only as a last resort when search snippets had no parseable people.
  if (hasLLMKey() && heuristic.length === 0) {
    const context = allResults
      .slice(0, 12)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`)
      .join("\n\n");

    const roleFocus =
      roleHints.length > 0
        ? `Prioritize titles matching: ${roleHints.join(", ")}. Drop sales, engineering, and unrelated roles.`
        : "Find decision-makers (Directors, Managers, Heads, Founders, VPs).";

    try {
      const raw = await callLLM({
        tier: "fast",
        system: `Extract named individuals from search results for a B2B outreach contact list.
Output ONLY a valid JSON array. No markdown fences.
Each item: { "name": string, "title": string | null, "department": string | null, "linkedIn": string | null, "location": string | null, "bio": string | null }
Only people whose CURRENT employer is the target company. Keep the employer from the source headline when present (e.g. "Plant HR Manager at Titan Company" or "CHRO - Titan Company").
Exclude former employees, consultants at other firms, and anyone whose headline names a different company.
Never rewrite a different employer into the target company name.
Never invent emails, phones, or LinkedIn URLs that are not in the results.
Prefer people located in the target city when location is stated.`,
        prompt: `Company: ${company}${companyAliases.length ? ` (also known as ${companyAliases.join(", ")})` : ""}
Target city: ${cityClause}
Find: ${roleFocus}
Prefer people based in or near ${cityClause} when location is stated.
Keep other Indian offices of the same company. Exclude other countries.

${context}

Return up to ${limit} people.`,
        maxTokens: 1200,
      });

      const parsed = filterPeopleByCities(
        parseJsonArrayFromLLM(raw)
          .map((person) => mapLLMPerson(person, dataSource))
          .filter((person): person is ScoutPersonResult => !!person)
          .filter(matchCompany)
          .filter((person) => llmPersonSupportedBySearchHits(person, allResults, searchNames)),
        params.cities,
      );

      const roleMatched = roleHints.length
        ? parsed.filter((p) => titleMatchesRoleHints(p.title, roleHints))
        : parsed;
      if (roleMatched.length) return roleMatched.slice(0, limit);
      if (parsed.length) return parsed.slice(0, limit);
    } catch (e) {
      console.error("[people-search] LLM parse failed:", e);
    }
  }

  if (roleMatchedHeuristic.length) return roleMatchedHeuristic.slice(0, limit);
  return heuristic.slice(0, limit);
}
