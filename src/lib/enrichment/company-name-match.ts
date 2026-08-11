import { INDIA_REGIONS, INDIA_STATES } from "@/lib/geo/india";
import { domainFromWebsite } from "./provider-utils";

const LEGAL_SUFFIXES =
  /\b(private limited|pvt\.?\s*ltd\.?|pvt|ltd|limited|llp|inc|incorporated|corp|corporation|plc|gmbh|llc|co\.?|company)\b/gi;

const MAJOR_METROS = [
  "Bengaluru",
  "Bangalore",
  "Mumbai",
  "Bombay",
  "Delhi",
  "New Delhi",
  "Noida",
  "Gurgaon",
  "Gurugram",
  "Hyderabad",
  "Chennai",
  "Madras",
  "Kolkata",
  "Calcutta",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Chandigarh",
  "Kochi",
  "Cochin",
  "Coimbatore",
  "Indore",
  "Bhopal",
  "Nagpur",
  "Visakhapatnam",
  "Vizag",
  "Lucknow",
  "Surat",
  "Mysore",
  "Mysuru",
  "Mangalore",
  "Mangaluru",
  "Hosur",
  "Hoskote",
  "Hosakote",
  "Krishnagiri",
  "Hubli",
  "Hubballi",
];

function buildGeoNameSet(): Set<string> {
  const names = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeCompanyName(value);
    if (normalized) names.add(normalized);
  };
  add("India");
  add("Entire India");
  for (const state of INDIA_STATES) add(state.name);
  for (const region of INDIA_REGIONS) add(region.name);
  for (const metro of MAJOR_METROS) add(metro);
  return names;
}

const GEO_NAMES = buildGeoNameSet();

export function normalizeCompanyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactCompanyName(raw: string): string {
  return normalizeCompanyName(raw).replace(/\s+/g, "");
}

export function isGeographicEntity(name: string): boolean {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return false;
  if (GEO_NAMES.has(normalized)) return true;
  const compact = normalized.replace(/\s+/g, "");
  for (const geo of GEO_NAMES) {
    if (geo.replace(/\s+/g, "") === compact) return true;
  }
  return false;
}

export function nameMatchesQuery(candidate: string, query: string): boolean {
  const normalizedCandidate = normalizeCompanyName(candidate);
  const normalizedQuery = normalizeCompanyName(query);
  if (!normalizedCandidate || !normalizedQuery) return false;
  if (normalizedCandidate === normalizedQuery) return true;
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return true;
  }

  const compactCandidate = normalizedCandidate.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  if (compactCandidate === compactQuery) return true;
  if (
    Math.min(compactCandidate.length, compactQuery.length) >= 4 &&
    (compactCandidate.includes(compactQuery) || compactQuery.includes(compactCandidate))
  ) {
    return true;
  }

  const candidateTokens = normalizedCandidate.split(" ").filter((token) => token.length > 1);
  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  if (queryTokens.length > 0 && queryTokens.every((token) => candidateTokens.includes(token))) return true;
  if (candidateTokens.length > 0 && candidateTokens.every((token) => queryTokens.includes(token))) return true;

  return false;
}

export function companyMatchesNameQuery(
  company: { name: string; domain?: string | null; website?: string | null },
  query: string,
): boolean {
  if (isGeographicEntity(company.name)) return false;
  if (nameMatchesQuery(company.name, query)) return true;
  const domain = company.domain?.trim() || domainFromWebsite(company.website ?? undefined);
  if (!domain) return false;
  const slug = domain.replace(/^www\./, "").split(".")[0] ?? "";
  return Boolean(slug) && nameMatchesQuery(slug, query);
}

export function filterCompaniesMatchingQuery<T extends { name: string; domain?: string | null; website?: string | null }>(
  companies: T[],
  query: string,
): T[] {
  return companies.filter((company) => companyMatchesNameQuery(company, query));
}
