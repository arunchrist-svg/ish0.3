import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { apolloSearchOrganizationByName, apolloSearchPersonByName } from "@/lib/enrichment/apollo";
import { searchPeopleViaTavily } from "@/lib/enrichment/people-search";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";

export type ParsedSearchQuery = {
  companyName?: string;
  domain?: string;
  linkedInCompanyUrl?: string;
  personName?: string;
  linkedInPersonUrl?: string;
  city?: string;
};

export type EntityMatch<T> = {
  item: T;
  confidence: number;
  matchType: "exact" | "likely" | "possible";
  reason: string;
};

export async function parseSearchQuery(query: string, personName?: string, city?: string): Promise<ParsedSearchQuery> {
  const trimmed = query.trim();
  if (!trimmed && !personName) return { city };

  if (/linkedin\.com\/company\//i.test(trimmed)) {
    return { linkedInCompanyUrl: trimmed, personName, city };
  }
  if (/linkedin\.com\/in\//i.test(trimmed)) {
    return { linkedInPersonUrl: trimmed, city };
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(" ")) {
    return { domain: trimmed.toLowerCase(), personName, city };
  }

  try {
    const raw = await callLLM({
      tier: tierForAgentStep("search.parseQuery"),
      system: "Extract search entities. Output only JSON.",
      prompt: `Parse this B2B lead search query.

Query: "${trimmed}"
Person (optional): "${personName ?? ""}"
City (optional): "${city ?? ""}"

Output JSON: { "companyName": "", "domain": "", "personName": "", "city": "" }`,
      maxTokens: 128,
    });
    const obj = parseJsonObjectFromLLM(raw) as ParsedSearchQuery;
    return {
      companyName: obj.companyName || trimmed,
      domain: obj.domain,
      personName: obj.personName || personName,
      city: obj.city || city,
    };
  } catch {
    return { companyName: trimmed, personName, city };
  }
}

async function verifyMatch(params: {
  type: "company" | "person";
  candidate: string;
  query: string;
}): Promise<{ confidence: number; matchType: EntityMatch<unknown>["matchType"]; reason: string }> {
  try {
    const raw = await callLLM({
      tier: tierForAgentStep("search.verifyMatch"),
      system: "Score entity match confidence 0-1. Output only JSON.",
      prompt: `Does this candidate match the search?

Type: ${params.type}
Search: ${params.query}
Candidate: ${params.candidate}

Output JSON: { "confidence": 0.0-1.0, "matchType": "exact|likely|possible", "reason": "brief" }`,
      maxTokens: 128,
    });
    const obj = parseJsonObjectFromLLM(raw) as { confidence?: number; matchType?: string; reason?: string };
    const confidence = typeof obj.confidence === "number" ? obj.confidence : 0.5;
    const matchType = (obj.matchType as EntityMatch<unknown>["matchType"]) ?? (confidence >= 0.85 ? "exact" : confidence >= 0.5 ? "likely" : "possible");
    return { confidence, matchType, reason: obj.reason ?? "LLM verification" };
  } catch {
    const lowerQ = params.query.toLowerCase();
    const lowerC = params.candidate.toLowerCase();
    const confidence = lowerC === lowerQ ? 0.95 : lowerC.includes(lowerQ) || lowerQ.includes(lowerC) ? 0.75 : 0.45;
    return {
      confidence,
      matchType: confidence >= 0.85 ? "exact" : confidence >= 0.5 ? "likely" : "possible",
      reason: "Heuristic name match",
    };
  }
}

export async function resolveCompany(parsed: ParsedSearchQuery): Promise<EntityMatch<ScoutCompanyResult>[]> {
  const queryLabel = parsed.domain ?? parsed.companyName ?? parsed.linkedInCompanyUrl ?? "";
  if (!queryLabel) return [];

  let companies: ScoutCompanyResult[] = [];
  if (process.env.APOLLO_API_KEY && (parsed.companyName || parsed.domain)) {
    try {
      companies = await apolloSearchOrganizationByName({
        name: parsed.companyName,
        domain: parsed.domain,
        city: parsed.city,
        limit: 5,
      });
    } catch (e) {
      console.warn("[entity-resolver] Apollo org search failed", e);
    }
  }

  if (!companies.length && parsed.companyName) {
    const people = await searchPeopleViaTavily({ companyName: parsed.companyName, limit: 3 });
    if (people.length) {
      companies = [{ name: parsed.companyName, city: parsed.city, dataSource: "tavily_ai" }];
    }
  }

  const results: EntityMatch<ScoutCompanyResult>[] = [];
  for (const c of companies.slice(0, 3)) {
    const v = await verifyMatch({ type: "company", candidate: c.name, query: queryLabel });
    results.push({ item: c, ...v });
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

export async function resolvePerson(parsed: ParsedSearchQuery, company?: ScoutCompanyResult): Promise<EntityMatch<ScoutPersonResult>[]> {
  const personQuery = parsed.personName ?? parsed.linkedInPersonUrl ?? "";
  if (!personQuery) return [];

  let people: ScoutPersonResult[] = [];
  const companyName = company?.name ?? parsed.companyName ?? "";

  if (process.env.APOLLO_API_KEY && (company?.domain || parsed.domain)) {
    try {
      people = await apolloSearchPersonByName({
        name: parsed.personName ?? personQuery,
        domain: company?.domain ?? parsed.domain ?? "",
        limit: 5,
      });
    } catch (e) {
      console.warn("[entity-resolver] Apollo people match failed", e);
    }
  }

  if (!people.length && companyName) {
    people = await searchPeopleViaTavily({ companyName, limit: 8, roleHints: parsed.personName ? [parsed.personName] : undefined });
  }

  const results: EntityMatch<ScoutPersonResult>[] = [];
  for (const p of people.slice(0, 3)) {
    const v = await verifyMatch({ type: "person", candidate: `${p.name} ${p.title ?? ""}`, query: personQuery });
    results.push({ item: p, ...v });
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
