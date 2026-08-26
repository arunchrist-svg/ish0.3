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

const INDIA_LOCALITIES = [
  "Bellandur",
  "Whitefield",
  "Brookefield",
  "Brooke Field",
  "Koramangala",
  "Indiranagar",
  "HSR Layout",
  "Electronic City",
  "Marathahalli",
  "Hebbal",
  "Manyata",
  "Outer Ring Road",
  "ORR",
  "Sarjapur",
  "JP Nagar",
  "Jayanagar",
  "Yelahanka",
  "Banashankari",
  "MG Road",
  "Brigade Road",
  "Dairy Circle",
  "Krishnarajapura",
  "KR Puram",
  "Doddakannelli",
  "Doddakakundi",
  "Hobli",
  "Mahadevapura",
  "Bagmane",
  "Domlur",
  "Ulsoor",
  "Attibele",
  "Anekal",
  "Ramnagaram",
  "Ramanagaram",
  "S.T. Bed",
  "ST Bed",
  "St Bed",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const METRO_ALT = [...MAJOR_METROS]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const LEADING_METRO_COMMA = new RegExp(`^(?:${METRO_ALT})\\s*,\\s*(.+)$`, "i");
const METRO_IN_PLACE = new RegExp(`^(?:${METRO_ALT})\\s+in\\s+\\S`, "i");
const GLUED_METRO_LOCALITY = new RegExp(`^(?:${METRO_ALT})[A-Za-z]{4,}`, "i");
const STATE_DOT_PLACE =
  /^(karnataka|tamil\s*nadu|maharashtra|telangana|andhra\s*pradesh|kerala|delhi|gujarat|rajasthan|west\s*bengal)\.\s*.+/i;

/** "Bengaluru, Chai Point" -> "Chai Point". */
export function stripLeadingMetroFromName(name: string): string | null {
  const match = name.trim().match(LEADING_METRO_COMMA);
  const rest = match?.[1]?.trim();
  return rest || null;
}

/** "Bengaluru in Bellandur" style place phrases. */
export function isCityInLocalityPhrase(name: string): boolean {
  return METRO_IN_PLACE.test(name.trim());
}

/** "BangaloreBrookefield", "Karnataka. Level 4". */
export function isGluedOrStatePlaceName(name: string): boolean {
  const trimmed = name.trim();
  return GLUED_METRO_LOCALITY.test(trimmed) || STATE_DOT_PLACE.test(trimmed);
}

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
  for (const locality of INDIA_LOCALITIES) add(locality);
  for (const state of INDIA_STATES) {
    for (const district of state.districts) {
      add(district.name);
      add(district.displayName);
      for (const alias of district.aliases) add(alias);
    }
  }
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

/**
 * Short alphanumeric brands (3M, M3M, HP, IBM). Substring matching is unsafe:
 * "m3m".includes("3m") would treat M3M as 3M.
 */
export function isShortBrandCode(value: string): boolean {
  const compact = value.replace(/\s+/g, "").toLowerCase();
  return compact.length > 0 && compact.length <= 5 && /^[a-z0-9]+$/.test(compact);
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

  const compactCandidate = normalizedCandidate.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  if (compactCandidate === compactQuery) return true;

  const candidateTokens = normalizedCandidate.split(" ").filter((token) => token.length > 1);
  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length > 1);

  // Leading short brand codes must match exactly (3M ≠ M3M, including "3M India" ≠ "M3M India").
  const candidateBrand = candidateTokens[0];
  const queryBrand = queryTokens[0];
  if (
    candidateBrand &&
    queryBrand &&
    candidateBrand !== queryBrand &&
    (isShortBrandCode(candidateBrand) || isShortBrandCode(queryBrand))
  ) {
    return false;
  }

  // Short brand codes: require whole-token equality, never substring (3M ≠ M3M).
  if (isShortBrandCode(compactCandidate) || isShortBrandCode(compactQuery)) {
    if (queryTokens.length > 0 && queryTokens.every((token) => candidateTokens.includes(token))) return true;
    if (candidateTokens.length > 0 && candidateTokens.every((token) => queryTokens.includes(token))) return true;
    return false;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return true;
  }

  if (
    Math.min(compactCandidate.length, compactQuery.length) >= 4 &&
    (compactCandidate.includes(compactQuery) || compactQuery.includes(compactCandidate))
  ) {
    return true;
  }

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
