/**
 * Shared people discovery via Tavily web search + Gemini extraction,
 * with heuristic LinkedIn parsing fallback.
 */
import { callLLM } from "@/lib/llm";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";
import { linkedInSlug, normalizeLinkedInUrl, personFieldOrEmpty } from "@/lib/utils";
import {
  inferRoleFromTitle,
  isCorporateHqPeopleTitle,
  isFestivalBuyerRole,
  isTeamLeadTitle,
} from "./people-role-filter";
import type { ScoutPersonResult } from "./types";
import { computeSeniorityScore } from "./seniority-score";
import { hasLLMKey, hasTavilyKey } from "./discovery-prerequisites";
import { parsePeopleFromSearchResults } from "./people-parser";
import {
  isTavilyQuotaError,
  isTavilyRateLimitError,
  optimizedMaxResults,
  TavilyQuotaError,
  TAVILY_QUOTA_PEOPLE_MSG,
  tavilySearch,
} from "./tavily-client";
import {
  citySearchClause,
  hasPlantCitySelection,
  includeHqCorridorForScoutPeople,
  nearbyLabelsForScoutCities,
  parentCitiesForNeighborhoods,
  partitionCitiesForSearch,
  selectionLooksLikeNeighborhoods,
} from "./city-search";
import {
  hitShowsCurrentEmployment,
  personAppearsOnOpenToWorkHit,
  personFieldsShowCurrentEmployment,
  personLooksOpenToWork,
  personTitleConflictsWithCompany,
  textMentionsCompany,
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
  "state bank of india": ["SBI", "State Bank of India"],
  sbi: ["SBI", "State Bank of India"],
  "hdfc bank": ["HDFC Bank", "HDFC"],
  hdfc: ["HDFC Bank", "HDFC"],
  "icici bank": ["ICICI Bank", "ICICI"],
  icici: ["ICICI Bank", "ICICI"],
  "axis bank": ["Axis Bank", "Axis"],
  axis: ["Axis Bank", "Axis"],
  "bank of maharashtra": ["Bank of Maharashtra", "BOM"],
  "canara bank": ["Canara Bank", "Canara"],
  "indian bank": ["Indian Bank"],
  "punjab national bank": ["PNB", "Punjab National Bank"],
  pnb: ["PNB", "Punjab National Bank"],
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

/** Short tokens humans use in Google (SBI, HDFC, Axis) plus full legal names. */
export function companyPeopleSearchTokens(companyName: string): string[] {
  const names = companyPeopleSearchNames(companyName);
  const tokens = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 2) return;
    if ([...tokens].some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    tokens.add(trimmed);
  };
  for (const name of names) {
    push(name);
    const key = normalizeCompanyName(name);
    for (const alias of BRAND_SEARCH_NAMES[key] ?? []) push(alias);
    if (/\bbank\b/i.test(name)) {
      const first = name.split(/\s+/)[0];
      if (first && first.length >= 3 && first.toLowerCase() !== "bank") push(first);
    }
  }
  return [...tokens].slice(0, 4);
}

const DEFAULT_LOCAL_OPERATOR_ROLES = ["Branch Manager", "Principal", "General Manager", "Manager"];

/** Soft assist only: search engines honour it inconsistently, the denylist pass is the real gate. */
export const OPEN_TO_WORK_EXCLUSION = '-#OPENTOWORK -"Open to Work"';

/** Append the exclusion to LinkedIn-targeted queries, leaving company-site queries untouched. */
function excludeOpenToWork(query: string): string {
  if (!/linkedin/i.test(query)) return query;
  if (query.includes(OPEN_TO_WORK_EXCLUSION)) return query;
  return `${query} ${OPEN_TO_WORK_EXCLUSION}`;
}

function normalizeRoleLabel(role: string): string {
  return role.replace(/^"+|"+$/g, "").trim();
}

/**
 * Google-style queries recruiters type manually, e.g.
 * "Kasturi Nagar SBI Branch Manager linkedin".
 */
export function buildNaturalLinkedInPeopleQueries(params: {
  company: string;
  companyAliases?: string[];
  localities: string[];
  roleHints?: string[];
}): string[] {
  const companyTokens = new Set<string>();
  for (const token of companyPeopleSearchTokens(params.company)) companyTokens.add(token);
  for (const alias of params.companyAliases ?? []) {
    for (const token of companyPeopleSearchTokens(alias)) companyTokens.add(token);
  }
  const companies = [...companyTokens].slice(0, 3);
  const localities = params.localities.map((l) => l.trim()).filter(Boolean).slice(0, 3);
  if (!localities.length || !companies.length) return [];

  const roles =
    params.roleHints?.length
      ? params.roleHints.map(normalizeRoleLabel).filter(Boolean).slice(0, 3)
      : DEFAULT_LOCAL_OPERATOR_ROLES.slice(0, 2);

  const queries: string[] = [];
  for (const loc of localities) {
    for (const cn of companies) {
      const primaryRole = roles[0] ?? "Branch Manager";
      queries.push(`${loc} ${cn} ${primaryRole} linkedin`);
      queries.push(`site:linkedin.com/in ${loc} ${cn} ${primaryRole}`);
      if (cn.length <= 6) {
        queries.push(`${loc} ${cn} Branch Manager linkedin`);
      }
      for (const role of roles.slice(1, 2)) {
        queries.push(`${loc} ${cn} ${role} linkedin`);
      }
    }
  }
  return [...new Set(queries.map(excludeOpenToWork))].slice(0, 8);
}

async function generateLinkedInSearchQueriesWithLLM(params: {
  company: string;
  companyAliases: string[];
  localities: string[];
  roleHints: string[];
  localOperators?: boolean;
}): Promise<string[]> {
  if (!hasLLMKey() || !params.localities.length) return [];
  const roleList =
    params.roleHints.length > 0
      ? params.roleHints.map(normalizeRoleLabel).join(", ")
      : params.localOperators
        ? "Branch Manager, Principal, General Manager, Manager"
        : "HR Director, Head of HR, HR Manager, Procurement";
  try {
    const raw = await callLLM({
      tier: "fast",
      system: `You write Google search strings to find LinkedIn profiles for B2B outreach in India.
Return ONLY a JSON array of 4 to 6 strings. No markdown fences.
Each string should read like a human Google query, e.g. "Kasturi Nagar SBI Branch Manager linkedin".
Use neighborhood or locality names, not whole metros like Bengaluru unless needed.
Include both plain "linkedin" suffix queries and site:linkedin.com/in variants.`,
      prompt: `Company: ${params.company}
Aliases: ${params.companyAliases.join(", ") || "none"}
Nearby areas: ${params.localities.join(", ")}
Roles: ${roleList}
Generate Google searches that would surface the right LinkedIn profiles.`,
      maxTokens: 400,
    });
    const parsed = parseJsonArrayFromLLM(raw);
    return parsed
      .map((item) => (typeof item === "string" ? item : typeof (item as { query?: unknown }).query === "string" ? String((item as { query: string }).query) : ""))
      .filter((item) => item.trim().length >= 8)
      .map((item) => item.trim())
      .slice(0, 6);
  } catch (e) {
    console.warn("[people-search] LLM query generation failed:", e);
    return [];
  }
}

function isKeyDM(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager", "people"].some(
    (k) => t.includes(k),
  );
}

function isUsableScoutPerson(
  person: ScoutPersonResult,
  hits: { title: string; url: string; content: string }[] = [],
  opts?: { localOperators?: boolean },
): boolean {
  if (isTeamLeadTitle(`${person.title ?? ""}\n${person.bio ?? ""}`) || personLooksOpenToWork(person)) {
    return false;
  }
  if (opts?.localOperators && isCorporateHqPeopleTitle(person.title)) return false;
  if (hits.length && personAppearsOnOpenToWorkHit(person, hits)) return false;
  return true;
}

function titleMatchesRoleHints(
  title: string | null | undefined,
  roleHints: string[],
  opts?: { localOperators?: boolean },
): boolean {
  if (!roleHints.length) return true;
  const hay = (title ?? "").toLowerCase();
  if (!hay || isTeamLeadTitle(hay)) return false;
  if (opts?.localOperators && isCorporateHqPeopleTitle(title)) return false;
  if (roleHints.some((hint) => hay.includes(hint.toLowerCase()))) return true;
  if (opts?.localOperators) return false;
  const hintBlob = roleHints.join(" ").toLowerCase();
  if (/\bhr\b|human resources|chro|people/.test(hintBlob) && /\b(hr|human resources|payroll|people)\b/.test(hay)) {
    return true;
  }
  if (/\bprocurement\b|purchase|sourcing/.test(hintBlob) && /\b(procurement|purchase|purchasing|sourcing)\b/.test(hay)) {
    return true;
  }
  if (isFestivalBuyerRole(title)) return true;
  return false;
}

function mapLLMPerson(p: Record<string, unknown>, dataSource: string): ScoutPersonResult | null {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 3) return null;

  const title = sanitizeJobTitle((p.title as string | null) ?? undefined);
  const inferred = inferRoleFromTitle(title);
  const location =
    (typeof p.location === "string" && p.location.trim()) ||
    (typeof p.city === "string" && p.city.trim()) ||
    undefined;
  return {
    name,
    title,
    department: personFieldOrEmpty(p.department as string | null) || inferred.department,
    seniority: personFieldOrEmpty(p.seniority as string | null) || inferred.seniority,
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

/**
 * True when any search hit explicitly mentions both the person's name and the company.
 * Used as a fallback when the person's own bio/title fields don't embed the company name —
 * common for LLM-extracted people whose bio is a clean summary rather than raw snippet text.
 */
function personNameFoundInCompanyHit(
  name: string,
  hits: { title: string; url: string; content: string }[],
  companyNames: string[],
): boolean {
  const nameNorm = name.trim().toLowerCase();
  if (nameNorm.length < 4) return false;
  return hits.some((hit) => {
    const blob = `${hit.title}\n${hit.url}\n${hit.content}`.toLowerCase();
    if (!blob.includes(nameNorm)) return false;
    return companyNames.some((company) => textMentionsCompany(blob, company));
  });
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
    if (!hit) {
      // LinkedIn URL found but the exact hit can't be located (URL variation). Check bio/title
      // fields first, then fall back to checking whether any hit mentions this person's name
      // alongside the company (common when Tavily returns the company page, not the profile).
      return (
        companyNames.some(
          (name) =>
            personFieldsShowCurrentEmployment(person, name) &&
            !personTitleConflictsWithCompany(person.title, name),
        ) || personNameFoundInCompanyHit(person.name, hits, companyNames)
      );
    }
    if (personAppearsOnOpenToWorkHit(person, hits)) return false;
    return companyNames.some((name) => hitShowsCurrentEmployment(hit, name));
  }

  // No LinkedIn URL: bio/title check first, then name-in-hit fallback.
  return (
    companyNames.some(
      (name) =>
        personFieldsShowCurrentEmployment(person, name) &&
        !personTitleConflictsWithCompany(person.title, name),
    ) || personNameFoundInCompanyHit(person.name, hits, companyNames)
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

/** Short LinkedIn titles for plant companies whose Head of HR sits at HQ. */
export const HQ_LINKEDIN_ROLE_TERM =
  '"Head of HR" OR "Head HR" OR "HEAD HR" OR "HR Director" OR CHRO OR CPO OR "Chief People Officer"';

/** Broader public-web titles: plant HR is often "HR", payroll, or Head of HR, not only Director. */
export const HQ_BUYER_ROLE_TERM =
  'HR OR "Head of HR" OR "Head HR" OR "HEAD HR" OR "HR Director" OR "HR Manager" OR payroll OR CHRO OR CPO OR "Chief People Officer" OR Admin OR Purchase OR "Head of Procurement"';

/**
 * Human Google phrasing for plant-city Head HR, e.g. "head hr ashok leyland hosur".
 * Runs before site:/Director templates so Tavily mirrors what works in Google.
 */
export function buildGoogleStylePlantPeopleQueries(params: {
  company: string;
  companyAliases?: string[];
  plantCities: string[];
  roleHints?: string[];
}): string[] {
  const companies = [params.company, ...(params.companyAliases ?? [])].filter(
    (name, index, all) => name && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
  const cities = params.plantCities.map((c) => c.trim()).filter(Boolean).slice(0, 2);
  if (!companies.length || !cities.length) return [];

  const rolePhrases = (
    params.roleHints?.length
      ? params.roleHints
      : ["Head of HR", "Head HR", "HR Director", "Head of Procurement"]
  )
    .map(normalizeRoleLabel)
    .filter(Boolean)
    .slice(0, 4)
    .map((role) =>
      role
        .replace(/\bHead of\b/gi, "head")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  const queries: string[] = [];
  for (const company of companies.slice(0, 2)) {
    for (const city of cities) {
      // Plain Google order first (matches user SERPs).
      queries.push(`head hr ${company} ${city}`);
      queries.push(`${company} head hr ${city} linkedin`);
      for (const phrase of rolePhrases.slice(0, 2)) {
        if (phrase === "head hr") continue;
        queries.push(`${phrase} ${company} ${city}`);
        queries.push(`${company} ${phrase} ${city} linkedin`);
      }
      queries.push(`site:linkedin.com/in "${company}" (${HQ_LINKEDIN_ROLE_TERM}) ${city}`);
    }
  }
  return [...new Set(queries.map(excludeOpenToWork))].slice(0, 10);
}

/**
 * Plant-stage LinkedIn queries: max 2 cities per Tavily string.
 * Mega-OR of 6–8 districts returns zero (same as company discovery).
 */
export function buildChunkedPlantPeopleQueries(params: {
  company: string;
  companyAliases?: string[];
  cities: string[];
  roleTerm: string;
}): string[] {
  const companies = [params.company, ...(params.companyAliases ?? [])].filter(
    (name, index, all) => name && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
  const chunks = partitionCitiesForSearch(params.cities, 2, 5);
  const queries: string[] = [];
  for (const chunk of chunks) {
    const clause = citySearchClause(chunk, 4);
    if (!clause || clause === "India") continue;
    for (const company of companies.slice(0, 2)) {
      queries.push(`site:linkedin.com/in "${company}" (${params.roleTerm}) (${clause})`);
      queries.push(`site:linkedin.com/in "${company}" "Plant HR" OR "HR Manager" ${clause}`);
      queries.push(`"${company}" "Plant HR Manager" OR "HR Manager" OR "Procurement Manager" ${clause}`);
    }
  }
  return [...new Set(queries.map(excludeOpenToWork))].slice(0, 12);
}

/**
 * Queries humans type in Google, e.g. "Himalaya Wellness Company head hr".
 * Neighborhood Focus Area must still run these: LinkedIn lists Bengaluru HQ, not Kasturi Nagar.
 */
export function buildGoogleStyleSeniorPeopleQueries(params: {
  company: string;
  companyAliases?: string[];
  /** Parent metro only, e.g. "Bengaluru OR Bangalore". Omit ward names. */
  metroClause?: string;
}): string[] {
  const companies = [params.company, ...(params.companyAliases ?? [])].filter(
    (name, index, all) => name && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
  if (!companies.length) return [];

  const metro = params.metroClause?.trim();
  const metroLead = metro?.split(/\s+OR\s+/i)[0]?.trim();
  const queries: string[] = [];
  for (const company of companies.slice(0, 2)) {
    // Appointment news first — these name the actual person confirmed by the employer.
    // hrkatha.com and peoplematters.in are authoritative HR appointment trackers for India.
    queries.push(`site:hrkatha.com "${company}" CHRO OR "head HR" OR "head of HR" OR "HR Director"`);
    queries.push(`site:peoplematters.in "${company}" CHRO OR "chief human resources" OR "head of HR"`);
    queries.push(`"${company}" CHRO appointed 2025 2026`);
    queries.push(`"${company}" "chief human resources officer" OR "head HR" name linkedin`);

    // Plain Google phrasing (matches what users type and what AI Overviews cite).
    queries.push(`${company} head hr linkedin`);
    queries.push(
      `${company} "Head of HR" OR "Head HR" OR "HEAD HR" OR "HR Director" OR CHRO OR CPO linkedin`,
    );
    queries.push(`site:linkedin.com/in "${company}" (${HQ_LINKEDIN_ROLE_TERM})`);
    if (metro) {
      queries.push(`site:linkedin.com/in "${company}" (${HQ_LINKEDIN_ROLE_TERM}) (${metro})`);
      if (metroLead) queries.push(`${company} head hr ${metroLead} linkedin`);
    }
    queries.push(`site:linkedin.com/in "${company}" (${HQ_LINKEDIN_ROLE_TERM}) India`);
  }
  return [...new Set(queries.map(excludeOpenToWork))].slice(0, 12);
}

export function buildPeopleSearchQueries(params: {
  company: string;
  roleTerm: string;
  cityClause: string;
  companyDomain?: string;
  hasCityFilter: boolean;
  companyAliases?: string[];
  localOperators?: boolean;
  restrictToArea?: boolean;
}): string[] {
  const companies = [params.company, ...(params.companyAliases ?? [])].filter(
    (name, index, all) => name && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
  const queries: string[] = [];
  const geoTerm = params.hasCityFilter ? `(${params.cityClause})` : "India";
  const localRoleTerm = params.roleTerm || '"Branch Manager" OR Principal OR "General Manager" OR Manager';
  const areaOnly = Boolean(params.localOperators || params.restrictToArea);

  if (areaOnly) {
    queries.push(`site:linkedin.com/in "${params.company}" (${localRoleTerm}) ${geoTerm}`);
    queries.push(`"${params.company}" (${localRoleTerm}) ${geoTerm}`);
    if (params.companyDomain) {
      queries.push(
        `site:${params.companyDomain} leadership OR team OR "our people" OR contact ${geoTerm}`,
      );
    }
    for (const company of companies.slice(0, 2)) {
      queries.push(`site:linkedin.com/in "${company}" ${localRoleTerm} ${geoTerm}`);
      queries.push(`"${company}" ${localRoleTerm} ${geoTerm}`);
    }
    return [...new Set(queries.map(excludeOpenToWork))].slice(0, 8);
  }

  // Appointment news queries — surfaces real named CHROs from India HR news trackers.
  // Run before LinkedIn so Tavily returns verified person names even when LinkedIn is blocked.
  queries.push(`site:hrkatha.com "${params.company}" CHRO OR "head HR" OR "head of HR" OR "HR Director"`);
  queries.push(`site:peoplematters.in "${params.company}" CHRO OR "chief human resources" OR "head of HR"`);
  queries.push(`"${params.company}" CHRO appointed 2025 2026`);

  // Query 1: LinkedIn + short Head of HR titles + plant and HQ cities (Bangalore on a Hosur fetch).
  queries.push(`site:linkedin.com/in "${params.company}" (${HQ_LINKEDIN_ROLE_TERM}) ${geoTerm}`);
  if (params.hasCityFilter) {
    queries.push(`site:linkedin.com/in "${params.company}" (${HQ_LINKEDIN_ROLE_TERM}) India`);
  }

  // "Role at Company" phrasing: directly surfaces profiles whose headline embeds the employer,
  // making them trivially verifiable. Most CHRO/CPO/Head of HR titles are written this way.
  queries.push(`"CHRO at ${params.company}" OR "Head of HR at ${params.company}" OR "HR Director at ${params.company}"`);
  queries.push(`"Head of Procurement at ${params.company}" OR "Admin Head at ${params.company}" OR "CPO at ${params.company}"`);

  queries.push(`"${params.company}" (${HQ_BUYER_ROLE_TERM}) ${geoTerm}`);
  queries.push(`site:linkedin.com/in "${params.company}" (${HQ_BUYER_ROLE_TERM}) ${geoTerm}`);
  if (params.hasCityFilter) {
    queries.push(`"${params.company}" (${HQ_BUYER_ROLE_TERM}) India`);
  }

  if (params.companyDomain) {
    queries.push(
      `site:${params.companyDomain} leadership OR team OR "our people" OR contact ${geoTerm}`,
    );
  }

  for (const company of companies.slice(0, 2)) {
    queries.push(`site:linkedin.com/in "${company}" ${params.roleTerm} ${geoTerm}`);
    queries.push(`"${company}" ${params.roleTerm} ${geoTerm}`);
  }

  return [...new Set(queries.map(excludeOpenToWork))].slice(0, 13);
}

const OPEN_TO_WORK_SERP_TERM = '(#OPENTOWORK OR "Open to Work" OR OPEN_TO_WORK)';

/**
 * LinkedIn's Open to Work ring is an image, so buyer-role snippets stay clean.
 * These queries hunt for a second indexed page where the hashtag is text.
 */
export function buildOpenToWorkDenylistQueries(params: {
  company: string;
  people: { name: string; linkedIn?: string | null }[];
  maxProfileQueries?: number;
}): string[] {
  const queries: string[] = [];
  const company = params.company.trim();
  if (company) {
    queries.push(`site:linkedin.com/in "${company}" ${OPEN_TO_WORK_SERP_TERM}`);
  }
  const cap = params.maxProfileQueries ?? 3;
  for (const person of params.people) {
    if (queries.length >= cap + (company ? 1 : 0)) break;
    const slug = linkedInSlug(person.linkedIn);
    if (slug) {
      queries.push(`"linkedin.com/in/${slug}" ${OPEN_TO_WORK_SERP_TERM}`);
    } else if (person.name.trim().length >= 5) {
      queries.push(`"${person.name.trim()}" linkedin ${OPEN_TO_WORK_SERP_TERM}`);
    }
  }
  return [...new Set(queries)];
}

/** Drop anyone matched by an Open to Work denylist hit or by their own fields. */
export function dropOpenToWorkPeople(
  people: ScoutPersonResult[],
  denylistHits: { title: string; url: string; content: string }[],
): ScoutPersonResult[] {
  return people.filter(
    (person) => !personLooksOpenToWork(person) && !personAppearsOnOpenToWorkHit(person, denylistHits),
  );
}

/** Never let a denylist failure (quota, timeout) break the main people search. */
async function fetchOpenToWorkDenylistHits(
  queries: string[],
): Promise<{ title: string; url: string; content: string }[]> {
  if (!queries.length) return [];
  const batches = await Promise.all(
    queries.map(async (q) => {
      try {
        return await tavilySearch(q, optimizedMaxResults(3));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[people-search] Open to Work denylist query failed:", q, message);
        return [] as { title: string; url: string; content: string }[];
      }
    }),
  );
  return batches.flat();
}

export async function searchPeopleViaTavily(params: {
  companyName: string;
  companyDomain?: string;
  limit?: number;
  dataSource?: string;
  roleHints?: string[];
  cities?: string[];
  indiaOnly?: boolean;
  localOperators?: boolean;
  locationScope?: "focus" | "interest";
  /** Skip plant Manager query bias; honor roleHints from user chips only. */
  strictPeopleFilters?: boolean;
  /**
   * Plant-first seat agent:
   * - plant: plant-city queries first; defer Google metro Head of HR
   * - hq_corridor: Google-style metro seniors only (after plant empty)
   */
  plantSeatPhase?: "plant" | "hq_corridor";
  goldFewShot?: string;
}): Promise<ScoutPersonResult[]> {
  const limit = params.limit ?? 8;
  const dataSource = params.dataSource ?? "tavily+llm";
  const searchNames = companyPeopleSearchNames(params.companyName);
  const company = searchNames[0] ?? cleanCompanyName(params.companyName);
  const companyAliases = searchNames.slice(1);
  const roleHints = params.roleHints ?? [];
  const indiaOnly = Boolean(params.indiaOnly);
  const localOperators = Boolean(params.localOperators);
  const plantPhase = params.plantSeatPhase === "plant";
  const hqCorridorPhase = params.plantSeatPhase === "hq_corridor";
  // Plant-first stage must not expand Ramanagara → Bengaluru in the query.
  const restrictToArea = plantPhase
    ? true
    : !includeHqCorridorForScoutPeople({
        cities: params.cities ?? [],
        locationScope: params.locationScope,
        localOperators,
      });
  const searchCities = indiaOnly
    ? []
    : restrictToArea || plantPhase
      ? [...new Set((params.cities ?? []).map((c) => c.trim()).filter(Boolean))]
      : nearbyLabelsForScoutCities(params.cities ?? []);
  // HQ stage: prefer metro clause (Bengaluru), never 8-district OR.
  const cityClause = hqCorridorPhase
    ? citySearchClause(
        nearbyLabelsForScoutCities(params.cities ?? []).filter(
          (label) => !selectionLooksLikeNeighborhoods([label]),
        ).slice(0, 3),
        4,
      ) || "Bengaluru OR Bangalore"
    : plantPhase && searchCities.length > 2
      ? citySearchClause(searchCities.slice(0, 2), 4)
      : searchCities.length
        ? citySearchClause(searchCities, 6)
        : "India";

  if (!hasTavilyKey()) throw new Error("TAVILY_API_KEY not set");

  const roleTerm =
    roleHints.length > 0
      ? roleHints.slice(0, 8).map((hint) => (hint.includes(" ") ? `"${hint}"` : hint)).join(" OR ")
      : localOperators
        ? '"Branch Manager" OR Principal OR "General Manager" OR Manager'
        : HQ_BUYER_ROLE_TERM;

  const baseQueries = plantPhase && searchCities.length > 0
    ? buildChunkedPlantPeopleQueries({
        company,
        companyAliases,
        cities: searchCities,
        roleTerm,
      })
    : buildPeopleSearchQueries({
        company,
        roleTerm,
        cityClause,
        companyDomain: params.companyDomain,
        hasCityFilter: searchCities.length > 0,
        companyAliases,
        localOperators,
        restrictToArea,
      });

  const roleLabels =
    roleHints.length > 0
      ? roleHints
      : localOperators
        ? DEFAULT_LOCAL_OPERATOR_ROLES
        : ["HR Director", "Head of HR", "Head HR", "HR Manager"];

  let queries = baseQueries;
  // Skip LLM query gen on multi-city plant stage: that call hits OpenRouter before LinkedIn search.
  const skipLlmQueryGen = plantPhase && searchCities.length >= 3;
  if ((restrictToArea || localOperators) && searchCities.length > 0 && !skipLlmQueryGen) {
    const naturalLocalities =
      plantPhase && searchCities.length > 2 ? searchCities.slice(0, 2) : searchCities;
    const naturalQueries = buildNaturalLinkedInPeopleQueries({
      company,
      companyAliases,
      localities: naturalLocalities,
      roleHints: roleLabels,
    });
    const llmQueries = await generateLinkedInSearchQueriesWithLLM({
      company,
      companyAliases,
      localities: naturalLocalities,
      roleHints: roleLabels,
      localOperators,
    });
    queries = [
      ...new Set([...naturalQueries, ...llmQueries.map(excludeOpenToWork), ...baseQueries]),
    ];
  } else if (plantPhase && searchCities.length >= 3) {
    const naturalQueries = buildNaturalLinkedInPeopleQueries({
      company,
      companyAliases,
      localities: searchCities.slice(0, 4),
      roleHints: roleLabels,
    });
    queries = [...new Set([...naturalQueries, ...baseQueries])];
  }

  // Plant-first: human Google phrasing before site:/Director templates.
  if (plantPhase && searchCities.length > 0 && !localOperators) {
    const plantGoogle = buildGoogleStylePlantPeopleQueries({
      company,
      companyAliases,
      plantCities: searchCities.slice(0, 2),
      roleHints: roleLabels,
    });
    queries = [...new Set([...plantGoogle, ...queries])];
  }

  const deferGoogleMetro = plantPhase;

  // Industry scouts: Google-style "Company head hr" (metro). Skip on plant-first stage;
  // run only on explicit HQ corridor fallback after the plant returned nobody.
  if (!localOperators && !deferGoogleMetro) {
    const scoutCities = params.cities ?? [];
    const metroLabels = selectionLooksLikeNeighborhoods(scoutCities)
      ? parentCitiesForNeighborhoods(scoutCities)
      : nearbyLabelsForScoutCities(scoutCities).filter(
          (label) => !selectionLooksLikeNeighborhoods([label]),
        );
    // HQ stage: Bengaluru/Bangalore only, not plant districts OR'd in.
    const bangaloreOnly = metroLabels
      .filter((l) => /bengaluru|bangalore/i.test(l))
      .slice(0, 2);
    const metroForQuery = hqCorridorPhase
      ? bangaloreOnly.length
        ? bangaloreOnly
        : metroLabels.slice(0, 2)
      : metroLabels;
    const metroClause =
      metroForQuery.length > 0 ? citySearchClause(metroForQuery, 4) : undefined;
    const googleStyle = buildGoogleStyleSeniorPeopleQueries({
      company,
      companyAliases,
      metroClause: metroClause && metroClause !== "India" ? metroClause : "Bengaluru OR Bangalore",
    });
    const metroNatural =
      metroForQuery.length > 0
        ? buildNaturalLinkedInPeopleQueries({
            company,
            companyAliases,
            localities: metroForQuery.slice(0, 3),
            roleHints: ["Head of HR", "Head HR", "HR Director", "CHRO", "CPO"],
          })
        : [];
    // Google-style first on HQ stage so Tavily hits Head of HR before broad role OR.
    queries = [...new Set([...googleStyle, ...metroNatural, ...queries])];
  }

  // Extra plant HR prepend only when not already using chunked plant queries.
  if (
    !params.strictPeopleFilters &&
    hasPlantCitySelection(params.cities ?? []) &&
    !localOperators &&
    !hqCorridorPhase &&
    !(plantPhase && searchCities.length > 0)
  ) {
    const plantCityClause = searchCities.length
      ? searchCities.slice(0, 2).join(" OR ")
      : "Hosur OR Bengaluru";
    const plantQueries = [
      `site:linkedin.com/in "${company}" "Plant HR" ${plantCityClause}`,
      `site:linkedin.com/in "${company}" "HR Manager" ${plantCityClause}`,
      `"${company}" "Plant HR Manager" OR "HR Manager" OR "Procurement Manager" ${plantCityClause}`,
    ];
    queries = [...new Set([...plantQueries.map(excludeOpenToWork), ...queries])];
  }

  const allResults: { title: string; url: string; content: string }[] = [];
  const errors: Error[] = [];
  let quotaHit = false;
  const perQueryLimit = optimizedMaxResults(Math.ceil(limit / 2));

  const matchCompany = (person: ScoutPersonResult) =>
    searchNames.some((name) => personFieldsShowCurrentEmployment(person, name)) &&
    !personTitleConflictsWithCompany(person.title, company) &&
    isUsableScoutPerson(person, allResults, { localOperators });

  let denylistHits: { title: string; url: string; content: string }[] | null = null;

  /** Final gate: spend 1-4 cheap Tavily calls to catch photo-ring Open to Work profiles. */
  async function finalize(people: ScoutPersonResult[]): Promise<ScoutPersonResult[]> {
    if (!people.length) return people;
    if (!denylistHits) {
      denylistHits = await fetchOpenToWorkDenylistHits(
        buildOpenToWorkDenylistQueries({ company, people: people.slice(0, 3) }),
      );
      if (denylistHits.length) allResults.push(...denylistHits);
    }
    return dropOpenToWorkPeople(people, denylistHits);
  }

  async function runQueryBatch(batch: string[]) {
    const tavilyBatches = await Promise.all(
      batch.map(async (q) => {
        try {
          return await tavilySearch(q, perQueryLimit);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          console.error("[people-search] Tavily query failed:", q, err.message);
          if (isTavilyQuotaError(err.message) && !isTavilyRateLimitError(err.message)) quotaHit = true;
          errors.push(err);
          return [] as { title: string; url: string; content: string }[];
        }
      }),
    );
    for (const hits of tavilyBatches) allResults.push(...hits);
  }

  const parseHits = () =>
    dedupePeople(
      searchNames.flatMap((name) =>
        parsePeopleFromSearchResults(
          allResults,
          Math.max(limit * 3, 12),
          `${dataSource}_heuristic`,
          name,
        ),
      ),
    ).filter((person) => isUsableScoutPerson(person, allResults, { localOperators }));

  const keepableFromHits = () => {
    const raw = parseHits();
    // City filtering is deferred to waterfall.ts so buyer-role people with blank/vague
    // location (common for plant LinkedIn profiles) are not dropped prematurely.
    const matched = raw
      .filter((person) => isUsableScoutPerson(person, allResults, { localOperators }))
      .filter(matchCompany);
    let roleMatched = roleHints.length
      ? matched.filter((p) => titleMatchesRoleHints(p.title, roleHints, { localOperators }))
      : localOperators
        ? matched.filter((p) => titleMatchesRoleHints(p.title, roleHints.length ? roleHints : ["Branch Manager", "Principal", "General Manager", "Manager"], { localOperators }))
        : matched;
    // HQ corridor: stacked Manager chips must not wipe Head of HR / CHRO from Google-style hits.
    if (hqCorridorPhase && roleMatched.length === 0 && matched.length > 0) {
      roleMatched = matched.filter((p) => isFestivalBuyerRole(p.title));
    }
    return { raw, matched, roleMatched };
  };

  // Keep searching until we have a buyer at this company. Wrong-company names in the
  // first web page must not skip the LinkedIn query.
  await runQueryBatch(queries.slice(0, 1));
  let { raw: heuristicRaw, matched: heuristic, roleMatched: roleMatchedHeuristic } = keepableFromHits();
  if (!roleMatchedHeuristic.length && queries.length > 1) {
    await runQueryBatch(queries.slice(1, 3));
    ({ raw: heuristicRaw, matched: heuristic, roleMatched: roleMatchedHeuristic } = keepableFromHits());
  }
  if (!roleMatchedHeuristic.length && queries.length > 3) {
    await runQueryBatch(queries.slice(3, 6));
    ({ raw: heuristicRaw, matched: heuristic, roleMatched: roleMatchedHeuristic } = keepableFromHits());
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

  heuristicRaw = parseHits();
  heuristic = heuristicRaw
    .filter((person) => isUsableScoutPerson(person, allResults, { localOperators }))
    .filter(matchCompany);
  roleMatchedHeuristic = roleHints.length
    ? heuristic.filter((p) => titleMatchesRoleHints(p.title, roleHints, { localOperators }))
    : localOperators
      ? heuristic.filter((p) =>
          titleMatchesRoleHints(p.title, ["Branch Manager", "Principal", "General Manager", "Manager"], {
            localOperators,
          }),
        )
      : heuristic;

  // Prefer heuristic when we already have role matches — skip LLM for scout speed.
  if (roleMatchedHeuristic.length > 0) {
    const kept = await finalize(roleMatchedHeuristic.slice(0, limit));
    if (kept.length) return kept;
  }

  // LLM when snippets exist but heuristic found nobody matching the company or role.
  if (hasLLMKey()) {
    const context = allResults
      .slice(0, 12)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`)
      .join("\n\n");

    const roleFocus = localOperators
      ? `Prioritize local seniors: ${roleHints.length ? roleHints.join(", ") : "Branch Manager, Principal, General Manager, Manager"}. Drop Head of HR, CHRO, Team Leads, Open to Work, and people at distant corporate HQ.`
      : roleHints.length > 0
        ? `Prioritize titles matching: ${roleHints.join(", ")}. Drop Finance, CTO, sales, engineering, and unrelated roles.`
        : "Find HR, Procurement, Admin, and Facilities managers and directors. Drop Team Leads and Open to Work.";

    const geoInstruction = localOperators
      ? "Keep branch, school, hospital, or hotel operators in this area. Skip Head of HR, CHRO, and corporate HQ people unless they clearly work at this branch."
      : hqCorridorPhase
        ? "Plant-city search was empty. Keep Head of HR, HR Director, CHRO, or CPO at this company's nearby HQ metro only. Drop Delhi, Mumbai, NYC, and other far metros. Drop wrong employers (e.g. M3M when the target is 3M)."
        : restrictToArea
          ? "Keep people based in the selected nearby areas only. Do not include city-wide Bengaluru HQ or India-wide Head of HR unless they work in those areas."
          : "Keep HR Manager, Head of HR, HR Director, and CHRO at the same company's nearby HQ. Exclude other countries.";
    const goldBlock = params.goldFewShot?.trim()
      ? `\nWorkspace gold cases (follow KEEP/DROP like a human):\n${params.goldFewShot.trim()}\n`
      : "";
    try {
      const raw = await callLLM({
        tier: "fast",
        system: `Extract named individuals from search results for a B2B outreach contact list.
Output ONLY a valid JSON array. No markdown fences.
Each item: { "name": string, "title": string | null, "department": string | null, "linkedIn": string | null, "location": string | null, "bio": string | null }
Rules:
- Only people whose CURRENT employer is the target company.
- IMPORTANT: Also extract people named in HR appointment news articles (hrkatha.com, peoplematters.in, etc.) — these confirm the real CHRO/HR head with high confidence. A snippet like "Company appoints [Name] as CHRO" is a strong signal — include that person.
- Format title as "Role at Company" when the source headline shows the employer (e.g. "Head of HR at Infosys", "CHRO at Titan Company", "Plant HR Manager at JSW Steel"). If the employer is not in the snippet, keep the role alone.
- Format bio as one short sentence that always includes the employer name when the person works at the target company (e.g. "CHRO at Infosys based in Bengaluru." or "Head of Procurement at Titan Company."). Never leave bio blank.
- If a LinkedIn URL appears in the results for the named person, include it in the linkedIn field.
- Exclude former employees ("exits", "leaves", "resigned"), Open to Work / job-seeker profiles, Team Leads, consultants at other firms, and anyone whose headline names a different company.
- Never rewrite a different employer into the target company name.
- Never invent emails, phones, or LinkedIn URLs that are not in the results.
- Prefer people located in the target city when location is stated.`,
        prompt: `Company: ${company}${companyAliases.length ? ` (also known as ${companyAliases.join(", ")})` : ""}
Target city: ${cityClause}
Find: ${roleFocus}
Prefer people based in or near ${cityClause} when location is stated.
${geoInstruction}
${goldBlock}
${context}

Return up to ${limit} people.`,
        maxTokens: 1200,
      });

      // City filtering deferred to waterfall.ts — LLM-extracted people without a parsed
      // location should still reach the buyer-role check and city relaxation downstream.
      // matchCompany is NOT applied here: it checks person.bio/title for company name, but
      // the LLM bio is a clean summary that often omits the company. The LLM was already
      // instructed to only extract current employees; llmPersonSupportedBySearchHits does
      // the employment verification against the actual search hits. Only the title-conflict
      // guard (e.g. "Plant Head Tata Steel" on a JSW Steel scout) is kept.
      const parsed = parseJsonArrayFromLLM(raw)
        .map((person) => mapLLMPerson(person, dataSource))
        .filter((person): person is ScoutPersonResult => !!person)
        .filter((person) => !personTitleConflictsWithCompany(person.title, company))
        .filter((person) => isUsableScoutPerson(person, allResults, { localOperators }))
        .filter((person) => llmPersonSupportedBySearchHits(person, allResults, searchNames));

      const roleMatched = parsed.filter((p) =>
        localOperators
          ? titleMatchesRoleHints(
              p.title,
              roleHints.length ? roleHints : ["Branch Manager", "Principal", "General Manager", "Manager"],
              { localOperators },
            )
          : (!roleHints.length && isFestivalBuyerRole(p.title)) ||
            titleMatchesRoleHints(p.title, roleHints) ||
            isFestivalBuyerRole(p.title),
      );
      if (roleMatched.length) {
        const kept = await finalize(roleMatched.slice(0, limit));
        if (kept.length) return kept;
      }
    } catch (e) {
      console.error("[people-search] LLM parse failed:", e);
    }
  }

  // Last resort: company-matched festival buyers only. Never return unfiltered heuristic.
  if (roleMatchedHeuristic.length) {
    const kept = await finalize(roleMatchedHeuristic.slice(0, limit));
    if (kept.length) return kept;
  }
  if (localOperators) return [];
  const buyerHeuristic = heuristic.filter((p) => isFestivalBuyerRole(p.title));
  if (buyerHeuristic.length) return finalize(buyerHeuristic.slice(0, limit));

  // Light agentic retry: plant stage still empty after match/filters → one Google-style rewrite.
  if (plantPhase && searchCities.length > 0) {
    const rewriteBase = buildGoogleStylePlantPeopleQueries({
      company,
      companyAliases,
      plantCities: searchCities.slice(0, 2),
      roleHints: roleLabels,
    });
    const executed = new Set(queries.slice(0, 6));
    const pendingRewrite = rewriteBase.filter((q) => !executed.has(q));
    const altPhrases = searchCities.slice(0, 2).flatMap((city) => [
      excludeOpenToWork(`"${company}" head hr ${city}`),
      excludeOpenToWork(`head of hr ${company} ${city} linkedin`),
      excludeOpenToWork(`${company} "Head HR" OR "HEAD HR" ${city} linkedin`),
    ]);
    const rewriteBatch = [...new Set([...pendingRewrite, ...altPhrases])]
      .filter((q) => !executed.has(q))
      .slice(0, 4);
    if (rewriteBatch.length) {
      console.info(
        "[people-search] Plant stage empty after filters; Google-style rewrite pass",
        { company, cities: searchCities.slice(0, 2), queries: rewriteBatch.length },
      );
      await runQueryBatch(rewriteBatch);
      const afterRewrite = keepableFromHits();
      if (afterRewrite.roleMatched.length) {
        const kept = await finalize(afterRewrite.roleMatched.slice(0, limit));
        if (kept.length) return kept;
      }
      const buyers = afterRewrite.matched.filter((p) => isFestivalBuyerRole(p.title));
      if (buyers.length) return finalize(buyers.slice(0, limit));
    }
  }

  return [];
}
