/**
 * Shared people discovery via Tavily web search + Gemini extraction,
 * with heuristic LinkedIn parsing fallback.
 */
import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import { normalizeLinkedInUrl } from "@/lib/utils";
import type { ScoutPersonResult } from "./types";
import { hasLLMKey, hasTavilyKey } from "./discovery-prerequisites";
import { parsePeopleFromSearchResults } from "./people-parser";
import { isTavilyQuotaError, optimizedMaxResults, TavilyQuotaError, TAVILY_QUOTA_PEOPLE_MSG, tavilySearch } from "./tavily-client";

function cleanCompanyName(name: string): string {
  return name
    .replace(/\(\s*corporate office\s*\)/gi, "")
    .replace(/\(\s*head office\s*\)/gi, "")
    .replace(/\b(pvt\.?\s*ltd\.?|limited|llp|inc\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isKeyDM(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager", "people"].some(
    (k) => t.includes(k),
  );
}

function mapLLMPerson(p: Record<string, unknown>, dataSource: string): ScoutPersonResult | null {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 3) return null;

  const title = (p.title as string | null) ?? undefined;
  return {
    name,
    title,
    department: (p.department as string | null) ?? undefined,
    seniority: (p.seniority as string | null) ?? undefined,
    linkedIn: normalizeLinkedInUrl(p.linkedIn as string | null),
    bio: (p.bio as string | null) ?? undefined,
    email: undefined,
    emailStatus: "missing",
    isKeyDM: isKeyDM(title),
    matchScore: isKeyDM(title) ? 58 : 50,
    dataSource,
  };
}

export async function searchPeopleViaTavily(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  dataSource?: string;
  roleHints?: string[];
}): Promise<ScoutPersonResult[]> {
  const limit = params.limit ?? 8;
  const dataSource = params.dataSource ?? "tavily+llm";
  const company = cleanCompanyName(params.companyName);

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  const roleTerm =
    params.roleHints && params.roleHints.length > 0
      ? params.roleHints.slice(0, 4).join(" OR ")
      : "HR OR Admin OR Procurement";

  const queries = [
    `site:linkedin.com/in "${company}" ${roleTerm} India`,
    `site:linkedin.com/in "${company}" Director OR Manager OR Head India`,
    `"${company}" ${roleTerm} LinkedIn profile India`,
    params.companyDomain
      ? `site:${params.companyDomain} leadership OR team OR "our people" OR contact`
      : null,
  ].filter(Boolean) as string[];

  const allResults: { title: string; url: string; content: string }[] = [];
  const errors: Error[] = [];
  let quotaHit = false;
  const perQueryLimit = optimizedMaxResults(Math.ceil(limit / 2));

  const tavilyBatches = await Promise.all(
    queries.slice(0, 2).map(async (q) => {
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
  for (const batch of tavilyBatches) allResults.push(...batch);

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

  const heuristic = parsePeopleFromSearchResults(allResults, limit, `${dataSource}_heuristic`);
  const keyDmCount = heuristic.filter((p) => p.isKeyDM).length;
  if (heuristic.length >= limit || (heuristic.length > 0 && keyDmCount > 0)) {
    return heuristic.slice(0, limit);
  }

  if (hasLLMKey()) {
    const context = allResults
      .slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`)
      .join("\n\n");

    try {
      const raw = await callLLM({
        tier: "fast",
        system: `Extract named individuals from search results for a B2B outreach contact list.
Output ONLY a valid JSON array. No markdown fences.
Each item: { "name": string, "title": string | null, "department": string | null, "linkedIn": string | null, "bio": string | null }
Only real named people at the target company. Never invent emails or phones.`,
        prompt: `Company: ${company}
Find: HR, Admin, Procurement, Facilities, or senior decision-makers in India.

${context}

Return up to ${limit} people.`,
        maxTokens: 1000,
      });

      const parsed = parseJsonArrayFromLLM(raw)
        .map((p) => mapLLMPerson(p, dataSource))
        .filter((p): p is ScoutPersonResult => !!p);

      if (parsed.length) return parsed.slice(0, limit);
    } catch (e) {
      console.error("[people-search] LLM parse failed:", e);
    }
  }

  return heuristic.slice(0, limit);
}
