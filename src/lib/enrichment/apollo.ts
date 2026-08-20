import { LOCALITY_CATALOG } from "@/lib/geo/area-of-focus";
import { normalizeLinkedInUrl } from "@/lib/utils";
import type { ScoutCompanyResult, ScoutPersonResult } from "./types";
import { computeSeniorityScore } from "./seniority-score";
import { apolloEmployeeRanges } from "./employee-size";
import { personLooksOpenToWork } from "@/lib/enrichment/person-company-match";

const METRO_ALIASES: Record<string, string[]> = {
  Bengaluru: ["Bangalore"],
  Bangalore: ["Bengaluru"],
};

/** Apollo matches HQ cities, not neighborhood labels like Kasturi Nagar. */
function apolloOrganizationLocations(cities: string[]): string[] {
  const out = new Set<string>();
  for (const city of cities) {
    const trimmed = city.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    const locality = LOCALITY_CATALOG.find(
      (entry) =>
        entry.name.toLowerCase() === trimmed.toLowerCase() ||
        entry.aliases?.some((alias) => alias.toLowerCase() === trimmed.toLowerCase()),
    );
    if (locality?.city) {
      out.add(locality.city);
      for (const alias of METRO_ALIASES[locality.city] ?? []) out.add(alias);
    }
  }
  return [...out].slice(0, 12);
}

function mapApolloOrganization(a: Record<string, unknown>, fallbackCity?: string): ScoutCompanyResult {
  return {
    name: a.name as string,
    domain: a.primary_domain as string | undefined,
    website: a.website_url as string | undefined,
    industry: a.industry as string | undefined,
    city: (a.city as string | undefined) ?? fallbackCity,
    employees: a.estimated_num_employees ? String(a.estimated_num_employees) : undefined,
    logo: a.logo_url as string | undefined,
    fitScore: estimateFitScore(a),
    dataSource: "apollo",
    externalId: a.id as string | undefined,
  };
}

const BASE = "https://api.apollo.io/v1";

export class ApolloAuthError extends Error {
  status: number;

  constructor(status: number, _detail = "") {
    super(`Apollo authentication failed (${status}).`);
    this.name = "ApolloAuthError";
    this.status = status;
  }
}

export function isApolloAuthError(err: unknown): boolean {
  if (err instanceof ApolloAuthError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /apollo.*(401|403|invalid api key|unauthorized|authentication failed)/i.test(msg);
}

async function apolloPost(path: string, body: object) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new ApolloAuthError(res.status, text);
    }
    if (res.status === 422) {
      // 422 means invalid parameter combination (e.g. bad industry tag IDs). Log and return empty.
      console.warn(`[apollo] 422 on ${path} — bad params, skipping:`, text);
      return { accounts: [], organizations: [], people: [] };
    }
    throw new Error(`Apollo ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apolloSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
  employeeBands?: string[];
}): Promise<ScoutCompanyResult[]> {
  const employeeRanges = apolloEmployeeRanges(params.employeeBands);
  const body: Record<string, unknown> = {
    per_page: params.limit ?? 25,
  };
  const locations = apolloOrganizationLocations(params.cities);
  if (locations.length) body.organization_locations = locations;
  if (params.industries.length) body.q_organization_keyword_tags = params.industries;
  if (employeeRanges.length) body.organization_num_employees_ranges = employeeRanges;
  // /accounts/search only searches saved Apollo accounts. Use organization search for discovery.
  const data = await apolloPost("/organizations/search", body);

  return (data.organizations ?? data.accounts ?? []).map((a: Record<string, unknown>) =>
    mapApolloOrganization(a),
  );
}

function mapApolloPerson(p: Record<string, unknown>): ScoutPersonResult {
  const email = p.email as string | undefined;
  const locationParts = [p.city, p.state, p.country].filter(
    (part): part is string => typeof part === "string" && Boolean(part.trim()),
  );
  return {
    name: p.name as string,
    firstName: p.first_name as string | undefined,
    lastName: p.last_name as string | undefined,
    title: p.title as string | undefined,
    department: (p.departments as string[] | undefined)?.[0],
    seniority: p.seniority as string | undefined,
    email,
    emailStatus: email ? classifyEmail(email) : "missing",
    phone: (p.phone_numbers as Record<string, string>[] | undefined)?.[0]?.["sanitized_number"],
    linkedIn: normalizeLinkedInUrl(p.linkedin_url as string | undefined),
    location: locationParts.length ? locationParts.join(", ") : undefined,
    bio: p.headline as string | undefined,
    isKeyDM: isKeyDecisionMaker(p.title as string | undefined),
    matchScore: computeMatchScore(p),
    dataSource: "apollo",
    externalId: p.id as string | undefined,
  };
}

export async function apolloSearchPeople(params: {
  companyDomain: string;
  companyDomains?: string[];
  titles: string[];
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  const domains = [
    ...new Set(
      [params.companyDomain, ...(params.companyDomains ?? [])]
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ""))
        .filter(Boolean),
    ),
  ];

  async function search(domainList: string[], titles?: string[]): Promise<Record<string, unknown>[]> {
    const body: Record<string, unknown> = {
      // Current Apollo People API field. Keep the legacy key for older mixed_people/search.
      q_organization_domains_list: domainList,
      q_organization_domains: domainList,
      include_similar_titles: true,
      per_page: params.limit ?? 10,
    };
    if (titles?.length) body.person_titles = titles;
    const data = await apolloPost("/mixed_people/search", body);
    return (data.people ?? []) as Record<string, unknown>[];
  }

  let raw = await search(domains, params.titles);
  if (!raw.length && params.titles.length) {
    raw = await search(domains);
  }
  if (!raw.length && domains.length > 1) {
    for (const domain of domains.slice(0, 3)) {
      raw = await search([domain], params.titles.length ? params.titles : undefined);
      if (raw.length) break;
    }
  }

  return raw.map(mapApolloPerson).filter((p) => !personLooksOpenToWork(p));
}

function classifyEmail(email: string): "verified" | "unverified" | "generic" {
  const generic = ["info@", "hr@", "admin@", "contact@", "office@", "sales@", "hello@", "support@"];
  if (generic.some((g) => email.toLowerCase().startsWith(g))) return "generic";
  return "unverified"; // Apollo emails need separate verification
}

function isKeyDecisionMaker(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "cpo", "cfo"].some((kw) =>
    t.includes(kw),
  );
}

function computeMatchScore(p: Record<string, unknown>): number {
  return computeSeniorityScore({
    title: p.title as string | undefined,
    seniority: p.seniority as string | undefined,
    isKeyDM: isKeyDecisionMaker(p.title as string | undefined),
    email: p.email as string | undefined,
    emailStatus: p.email ? "verified" : "missing",
    linkedIn: p.linkedin_url as string | undefined,
  }).total;
}

function estimateFitScore(a: Record<string, unknown>): number {
  let score = 60;
  const emp = Number(a.estimated_num_employees ?? 0);
  if (emp > 5000) score += 25;
  else if (emp > 1000) score += 15;
  else if (emp > 200) score += 8;
  return Math.min(score, 99);
}

export async function apolloSearchOrganizationByName(params: {
  name?: string;
  domain?: string;
  city?: string;
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  const body: Record<string, unknown> = { per_page: params.limit ?? 5 };
  if (params.domain) body.q_organization_domains = [params.domain];
  if (params.name) body.q_organization_name = params.name;
  if (params.city) body.organization_locations = [params.city];

  const data = await apolloPost("/organizations/search", body);
  return (data.organizations ?? data.accounts ?? []).map((a: Record<string, unknown>) =>
    mapApolloOrganization(a, params.city),
  );
}

export async function apolloSearchPersonByName(params: {
  name: string;
  domain: string;
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  const data = await apolloPost("/mixed_people/search", {
    q_organization_domains_list: [params.domain],
    q_organization_domains: [params.domain],
    q_keywords: params.name,
    per_page: params.limit ?? 5,
  });

  const people: ScoutPersonResult[] = (data.people ?? []).map((p: Record<string, unknown>) => {
    const email = p.email as string | undefined;
    return {
      name: p.name as string,
      firstName: p.first_name as string | undefined,
      lastName: p.last_name as string | undefined,
      title: p.title as string | undefined,
      department: (p.departments as string[] | undefined)?.[0],
      seniority: p.seniority as string | undefined,
      email,
      emailStatus: email ? classifyEmail(email) : "missing",
      phone: (p.phone_numbers as Record<string, string>[] | undefined)?.[0]?.["sanitized_number"],
      linkedIn: normalizeLinkedInUrl(p.linkedin_url as string | undefined),
      bio: p.headline as string | undefined,
      isKeyDM: isKeyDecisionMaker(p.title as string | undefined),
      matchScore: computeMatchScore(p),
      dataSource: "apollo",
      externalId: p.id as string | undefined,
    };
  });

  return people.filter((p) => !personLooksOpenToWork(p));
}
