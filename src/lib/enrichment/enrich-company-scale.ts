/**
 * Fill missing company scale (employee band / headcount) after discovery.
 * Places and Zauba rarely expose headcount; AmbitionBox / IndiaMART / news often do.
 */
import { mapWithConcurrency } from "@/lib/async";
import { hasApolloKey } from "./config";
import { hasTavilyKey } from "./discovery-prerequisites";
import {
  extractEmployeesFromHits,
  extractEmployeesFromText,
  inferScaleMetadata,
  normalizeEmployeeField,
} from "./employee-size";
import { optimizedMaxResults, tavilySearch } from "./tavily-client";
import type { ScoutCompanyResult } from "./types";

export function companyNeedsScaleEnrichment(company: ScoutCompanyResult): boolean {
  return !normalizeEmployeeField(company.employees);
}

/** Simple Google/Tavily queries that surface public headcount for Indian SMEs. */
export function buildCompanyScaleSearchQueries(company: {
  name: string;
  domain?: string | null;
  city?: string | null;
}): string[] {
  const name = company.name.trim();
  if (!name) return [];
  const city = company.city?.trim();
  const domain = company.domain?.trim()?.replace(/^www\./i, "");
  const geo = city || "India";
  const queries = [
    `"${name}" ("number of employees" OR employees OR headcount OR "employee strength") ${geo}`,
    `site:indiamart.com "${name}" "Number of Employees"`,
    `site:ambitionbox.com "${name}" employees`,
  ];
  if (domain) {
    queries.push(`"${name}" OR ${domain} ("employees" OR headcount) India`);
  }
  return [...new Set(queries)].slice(0, 4);
}

function applyScale(
  company: ScoutCompanyResult,
  employees: string,
  source: "tavily" | "apollo",
): ScoutCompanyResult {
  const scale = inferScaleMetadata({
    employees,
    dataSource: source === "apollo" ? "apollo" : "india_directories",
    scaleStatus: source === "apollo" ? "verified" : "estimated",
    scaleSource: source === "apollo" ? "apollo" : "india_directories",
  });
  return {
    ...company,
    employees,
    ...scale,
    scaleEvidence: `${source}: ${employees}`,
  };
}

async function enrichOneViaTavily(company: ScoutCompanyResult): Promise<ScoutCompanyResult> {
  if (!hasTavilyKey()) return company;
  const queries = buildCompanyScaleSearchQueries(company);
  if (!queries.length) return company;

  const hits: Array<{ title: string; url: string; content: string }> = [];
  for (const q of queries) {
    try {
      const batch = await tavilySearch(q, optimizedMaxResults(4));
      hits.push(...batch);
      const extracted = extractEmployeesFromHits(company.name, hits);
      if (extracted) return applyScale(company, extracted, "tavily");
    } catch (e) {
      console.warn("[enrich-company-scale] Tavily failed:", company.name, e);
      break;
    }
  }

  const needle = company.name.trim().toLowerCase();
  const namedHits = hits.filter((h) =>
    `${h.title}\n${h.content}`.toLowerCase().includes(needle),
  );
  const blob = namedHits.map((h) => `${h.title}\n${h.content}`).join("\n");
  const loose = extractEmployeesFromText(blob);
  if (loose) return applyScale(company, loose, "tavily");
  return company;
}

async function enrichOneViaApollo(company: ScoutCompanyResult): Promise<ScoutCompanyResult | null> {
  if (!hasApolloKey()) return null;
  const domain = company.domain?.trim()?.replace(/^www\./i, "");
  try {
    const { apolloSearchOrganizationByName } = await import("./apollo");
    const orgs = await apolloSearchOrganizationByName({
      name: company.name,
      domain: domain || undefined,
      city: company.city ?? undefined,
      limit: 5,
    });
    const needle = company.name.trim().toLowerCase();
    const match =
      (domain
        ? orgs.find((o) => o.domain?.replace(/^www\./i, "").toLowerCase() === domain.toLowerCase())
        : undefined) ??
      orgs.find((o) => o.name.trim().toLowerCase() === needle) ??
      orgs.find((o) => {
        const n = o.name.toLowerCase();
        return n.includes(needle) || needle.includes(n);
      });
    const employees = normalizeEmployeeField(match?.employees);
    if (!employees) return null;
    return applyScale(company, employees, "apollo");
  } catch (e) {
    console.warn("[enrich-company-scale] Apollo failed:", company.name, e);
    return null;
  }
}

/**
 * Enrich companies that still show Unknown scale.
 * Prefer Apollo when configured; otherwise Tavily public listings (Estimated).
 */
export async function enrichMissingCompanyScale(
  companies: ScoutCompanyResult[],
  opts?: { limit?: number; concurrency?: number; preferApollo?: boolean },
): Promise<ScoutCompanyResult[]> {
  const needs = companies
    .map((company, index) => ({ company, index }))
    .filter(({ company }) => companyNeedsScaleEnrichment(company));
  if (!needs.length) return companies;

  const cap = Math.min(needs.length, Math.max(opts?.limit ?? 12, 1));
  const concurrency = opts?.concurrency ?? 3;
  const head = needs.slice(0, cap);
  const preferApollo = opts?.preferApollo ?? hasApolloKey();

  const enrichedHead = await mapWithConcurrency(head, concurrency, async ({ company, index }) => {
    if (preferApollo) {
      const viaApollo = await enrichOneViaApollo(company);
      if (viaApollo && normalizeEmployeeField(viaApollo.employees)) {
        return { index, company: viaApollo };
      }
    }
    const viaTavily = await enrichOneViaTavily(company);
    return { index, company: viaTavily };
  });

  const next = [...companies];
  for (const row of enrichedHead) {
    next[row.index] = row.company;
  }
  return next;
}
