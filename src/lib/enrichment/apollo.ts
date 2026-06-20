import type { ScoutCompanyResult, ScoutPersonResult } from "./types";

const BASE = "https://api.apollo.io/v1";

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
    throw new Error(`Apollo ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function apolloSearchCompanies(params: {
  cities: string[];
  industries: string[];
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  const data = await apolloPost("/accounts/search", {
    q_organization_city_locations: params.cities,
    organization_industry_tag_ids: params.industries,
    per_page: params.limit ?? 25,
  });

  return (data.accounts ?? []).map((a: Record<string, unknown>) => ({
    name: a.name as string,
    domain: a.primary_domain as string | undefined,
    website: a.website_url as string | undefined,
    industry: a.industry as string | undefined,
    city: a.city as string | undefined,
    employees: a.estimated_num_employees ? String(a.estimated_num_employees) : undefined,
    logo: a.logo_url as string | undefined,
    giftScore: estimateGiftScore(a),
    dataSource: "apollo",
    externalId: a.id as string | undefined,
  }));
}

export async function apolloSearchPeople(params: {
  companyDomain: string;
  titles: string[];
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  const data = await apolloPost("/mixed_people/search", {
    q_organization_domains: [params.companyDomain],
    person_titles: params.titles,
    per_page: params.limit ?? 10,
  });

  return (data.people ?? []).map((p: Record<string, unknown>) => {
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
      linkedIn: p.linkedin_url as string | undefined,
      bio: p.headline as string | undefined,
      isKeyDM: isKeyDecisionMaker(p.title as string | undefined),
      matchScore: computeMatchScore(p),
      dataSource: "apollo",
      externalId: p.id as string | undefined,
    };
  });
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
  let score = 50;
  const title = (p.title as string ?? "").toLowerCase();
  if (["hr", "admin", "procurement"].some((k) => title.includes(k))) score += 20;
  if (["director", "head", "vp", "chief", "cpo"].some((k) => title.includes(k))) score += 15;
  if (p.email) score += 10;
  if (p.linkedin_url) score += 5;
  return Math.min(score, 99);
}

function estimateGiftScore(a: Record<string, unknown>): number {
  let score = 60;
  const emp = Number(a.estimated_num_employees ?? 0);
  if (emp > 5000) score += 25;
  else if (emp > 1000) score += 15;
  else if (emp > 200) score += 8;
  return Math.min(score, 99);
}
