import { callLLM } from "@/lib/llm";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";

async function tavilySearch(query: string, limit = 5): Promise<{title: string; url: string; content: string}[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: limit,
    }),
  });
  if (!res.ok) throw new Error(`Tavily failed: ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function tavilySearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  const cityStr = params.cities.join(" OR ");
  const indStr = params.industries.join(" OR ");
  const query = `corporate companies ${indStr} ${cityStr} India employee gifting Diwali`;

  const results = await tavilySearch(query, params.limit ?? 10);
  if (!results.length) return [];

  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 500)}`)
    .join("\n\n");

  const raw = await callLLM({
    tier: "fast",
    system: `You extract structured company data for B2B corporate gifting lead generation.
Output ONLY valid JSON array. Each item: { name, domain, industry, city, employees, intelNotes }.
Only include real companies. Minimum confidence 50. Do NOT invent companies.`,
    prompt: `Extract companies from these search results. Target: ${indStr} industries in ${cityStr}, India, employee count > 100.\n\n${context}`,
    maxTokens: 1024,
  });

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Record<string, unknown>[];
    return parsed.map((c) => ({
      name: c.name as string,
      domain: c.domain as string | undefined,
      industry: c.industry as string | undefined,
      city: c.city as string | undefined,
      employees: c.employees as string | undefined,
      intelNotes: c.intelNotes as string | undefined,
      giftScore: 65,
      dataSource: "tavily+llm",
    }));
  } catch {
    return [];
  }
}

export async function tavilySearchPeople(params: {
  companyName: string;
  companyDomain?: string;
  titles: string[];
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  const query = `site:linkedin.com "${params.companyName}" HR OR Admin OR Procurement Director Manager`;
  const results = await tavilySearch(query, params.limit ?? 5);
  if (!results.length) return [];

  const context = results
    .map((r) => `${r.title}\n${r.url}\n${r.content.slice(0, 400)}`)
    .join("\n\n");

  const raw = await callLLM({
    tier: "fast",
    system: `Extract people from LinkedIn/web search results for a B2B gifting outreach list.
Output ONLY valid JSON array. Each item: { name, title, department, seniority, linkedIn, bio }.
Only include real named individuals. Never invent emails or phones.`,
    prompt: `Company: ${params.companyName}\nFind HR, Admin, Procurement decision-makers.\n\n${context}`,
    maxTokens: 1024,
  });

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Record<string, unknown>[];
    return parsed.map((p) => {
      const title = p.title as string | undefined;
      return {
        name: p.name as string,
        title,
        department: p.department as string | undefined,
        seniority: p.seniority as string | undefined,
        linkedIn: p.linkedIn as string | undefined,
        bio: p.bio as string | undefined,
        email: undefined,
        emailStatus: "missing" as const,
        isKeyDM: isKeyDM(title),
        matchScore: 55,
        dataSource: "tavily+llm",
      };
    });
  } catch {
    return [];
  }
}

function isKeyDM(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp"].some((k) => t.includes(k));
}
