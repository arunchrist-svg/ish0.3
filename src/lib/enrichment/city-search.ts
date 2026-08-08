import {
  compactSearchTermsForLabel,
  compactSearchTermsForScoutLabels,
  isBroadGeoLabel,
  isNationwideLabel,
  matchTermsForScoutLabels,
} from "@/lib/geo/india";

export function isNationwideSelection(cities: string[]): boolean {
  return cities.some((c) => isNationwideLabel(c));
}

/** Expand UI city labels into search terms used by directory/web queries. */
const CITY_SEARCH_ALIASES: Record<string, string[]> = {
  Bengaluru: ["Bengaluru", "Bangalore"],
  Bangalore: ["Bangalore", "Bengaluru"],
  Mysore: ["Mysore", "Mysuru"],
  Mysuru: ["Mysuru", "Mysore"],
  Mangalore: ["Mangalore", "Mangaluru"],
  Mangaluru: ["Mangaluru", "Mangalore"],
  Hubli: ["Hubli", "Hubballi"],
  Hubballi: ["Hubballi", "Hubli"],
  Tumkur: ["Tumkur", "Tumakuru"],
  Tumakuru: ["Tumakuru", "Tumkur"],
  Belgaum: ["Belgaum", "Belagavi"],
  Belagavi: ["Belagavi", "Belgaum"],
  Shivamogga: ["Shivamogga", "Shimoga"],
  Shimoga: ["Shimoga", "Shivamogga"],
  Bellary: ["Bellary", "Ballari"],
  Ballari: ["Ballari", "Bellary"],
  Hosur: ["Hosur"],
  Hassan: ["Hassan"],
  Davanagere: ["Davanagere"],
  Udupi: ["Udupi"],
  Mandya: ["Mandya"],
  Kolar: ["Kolar"],
  Ramanagara: ["Ramanagara"],
  Chitradurga: ["Chitradurga"],
  Hyderabad: ["Hyderabad", "Secunderabad"],
  Secunderabad: ["Secunderabad", "Hyderabad"],
};

function applyCityAliases(terms: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const term of terms) {
    if (!term.trim()) continue;
    out.add(term);
    for (const alias of CITY_SEARCH_ALIASES[term] ?? []) out.add(alias);
  }
  return [...out];
}

export function expandCitySearchTerms(cities: string[]): string[] {
  if (isNationwideSelection(cities)) return ["India"];
  return applyCityAliases(compactSearchTermsForScoutLabels(cities));
}

/** Full alias set for post-filters: state/region labels include every district and metro. */
export function expandCityMatchTerms(cities: string[]): string[] {
  if (isNationwideSelection(cities)) return ["India"];
  return applyCityAliases(matchTermsForScoutLabels(cities));
}

/**
 * Unique cities to search: district labels stay as picked; state/region expand to metros only.
 * Does not dump every district alias into the query budget.
 */
export function primaryCitiesForSearch(labels: string[]): string[] {
  if (isNationwideSelection(labels)) return ["India"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const terms = isBroadGeoLabel(trimmed) ? compactSearchTermsForLabel(trimmed) : [trimmed];
    for (const term of terms) {
      const key = term.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(term.trim());
    }
  }
  return out;
}

function extraAliasForCity(city: string): string | undefined {
  return (CITY_SEARCH_ALIASES[city] ?? []).find((alias) => alias.toLowerCase() !== city.toLowerCase());
}

/** Query terms: unique cities first, then at most one alias each if slots remain. */
export function citySearchTerms(cities: string[], max = 6): string[] {
  const primaries = primaryCitiesForSearch(cities);
  if (primaries.length === 1 && primaries[0] === "India") return ["India"];

  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const key = term.toLowerCase();
    if (!term || seen.has(key) || terms.length >= max) return;
    seen.add(key);
    terms.push(term);
  };

  for (const city of primaries) add(city);
  if (terms.length < max) {
    for (const city of primaries) {
      const alias = extraAliasForCity(city);
      if (alias) add(alias);
    }
  }
  return terms;
}

export function citySearchClause(cities: string[], max = 6): string {
  return citySearchTerms(cities, max).join(" OR ");
}

/** Split selected cities into query batches so later cities are not dropped. */
export function citySearchBatches(labels: string[], batchSize = 6, maxBatches = 2): string[][] {
  const primaries = primaryCitiesForSearch(labels);
  if (!primaries.length) return [];
  if (primaries.length === 1 && primaries[0] === "India") return [["India"]];
  const batches: string[][] = [];
  for (let i = 0; i < primaries.length && batches.length < maxBatches; i += batchSize) {
    batches.push(primaries.slice(i, i + batchSize));
  }
  return batches;
}

export function rotateCityBatches<T>(batches: T[], fetchSeed = 0): T[] {
  if (batches.length <= 1) return batches;
  const offset = Math.abs(fetchSeed) % batches.length;
  if (offset === 0) return batches;
  return [...batches.slice(offset), ...batches.slice(0, offset)];
}

function companyCityGroupKey(
  companyCity: string | null | undefined,
  selectedCities: string[],
): string {
  for (const label of selectedCities) {
    if (companyCityMatchesSelection(companyCity, [label])) return label.toLowerCase();
  }
  const normalized = (companyCity ?? "").trim().toLowerCase();
  return normalized || "unknown";
}

/** Highest fitScore first, then fill remaining slots from under-represented cities. */
export function rankCompaniesByFitAndDiversity<T extends { city?: string; fitScore?: number }>(
  companies: T[],
  selectedCities: string[],
  limit: number,
): T[] {
  const sorted = [...companies].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
  if (sorted.length <= limit) return sorted;

  const diverseCityCount = primaryCitiesForSearch(selectedCities).filter((c) => c !== "India").length;
  const reserve =
    diverseCityCount >= 2
      ? Math.min(Math.max(1, Math.floor(limit * 0.4)), diverseCityCount - 1, Math.max(limit - 1, 0))
      : 0;
  const scoreSlots = Math.max(limit - reserve, 1);

  const result: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < sorted.length && result.length < scoreSlots; i++) {
    result.push(sorted[i]);
    used.add(i);
  }

  const represented = new Set(result.map((c) => companyCityGroupKey(c.city, selectedCities)));
  for (let i = 0; i < sorted.length && result.length < limit; i++) {
    if (used.has(i)) continue;
    const key = companyCityGroupKey(sorted[i].city, selectedCities);
    if (represented.has(key)) continue;
    result.push(sorted[i]);
    used.add(i);
    represented.add(key);
  }

  for (let i = 0; i < sorted.length && result.length < limit; i++) {
    if (used.has(i)) continue;
    result.push(sorted[i]);
    used.add(i);
  }

  return result;
}

const UNVERIFIED_CITY_LABELS = new Set(["", "india", "unknown"]);

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when a company's extracted city matches any selected scout city (with aliases). */
export function companyCityMatchesSelection(
  companyCity: string | null | undefined,
  selectedCities: string[],
): boolean {
  if (selectedCities.length === 0 || isNationwideSelection(selectedCities)) return true;

  const broad = selectedCities.some((label) => isBroadGeoLabel(label));
  if (!companyCity?.trim()) return broad;

  const normalizedCompany = normalizeCity(companyCity);
  if (UNVERIFIED_CITY_LABELS.has(normalizedCompany)) return broad;

  const aliases = expandCityMatchTerms(selectedCities)
    .map(normalizeCity)
    .filter((alias) => alias.length >= 3);

  return aliases.some(
    (alias) =>
      normalizedCompany === alias ||
      normalizedCompany.includes(alias) ||
      (alias.length >= 5 && normalizedCompany.length >= 4 && alias.includes(normalizedCompany)),
  );
}


/** Other Indian metros used to detect off-city decision-makers. */
const INDIA_METRO_ALIASES: Record<string, string[]> = {
  ...CITY_SEARCH_ALIASES,
  Pune: ["Pune", "Pimpri", "Chinchwad"],
  Mumbai: ["Mumbai", "Bombay", "Navi Mumbai", "Thane"],
  Delhi: ["Delhi", "New Delhi", "Noida", "Gurgaon", "Gurugram", "Faridabad", "Ghaziabad"],
  Hyderabad: ["Hyderabad", "Secunderabad"],
  Chennai: ["Chennai", "Madras"],
  Kolkata: ["Kolkata", "Calcutta"],
  Ahmedabad: ["Ahmedabad"],
  Jaipur: ["Jaipur"],
  Chandigarh: ["Chandigarh", "Mohali"],
  Kochi: ["Kochi", "Cochin"],
  Coimbatore: ["Coimbatore"],
  Indore: ["Indore"],
  Bhopal: ["Bhopal"],
  Nagpur: ["Nagpur"],
  Visakhapatnam: ["Visakhapatnam", "Vizag"],
  Lucknow: ["Lucknow"],
  Surat: ["Surat"],
};

function locationMentionsCityLabel(location: string, cityLabel: string): boolean {
  const normalizedLocation = normalizeCity(location);
  const aliases = (INDIA_METRO_ALIASES[cityLabel] ?? [cityLabel]).map(normalizeCity);
  return aliases.some(
    (alias) =>
      alias.length >= 3 &&
      (normalizedLocation === alias ||
        normalizedLocation.includes(alias) ||
        normalizedLocation.startsWith(`${alias},`) ||
        normalizedLocation.includes(`, ${alias}`)),
  );
}

/** True when person location is unknown or matches any selected scout city. */
export function personLocationMatchesSelection(
  location: string | null | undefined,
  selectedCities: string[],
): boolean {
  if (selectedCities.length === 0 || isNationwideSelection(selectedCities)) return true;
  if (!location?.trim()) return true; // keep unknown locations; bias ranking elsewhere

  const normalizedLocation = normalizeCity(location);
  if (UNVERIFIED_CITY_LABELS.has(normalizedLocation) || normalizedLocation === "india") {
    return true;
  }

  if (companyCityMatchesSelection(location, selectedCities)) return true;

  for (const cityLabel of Object.keys(INDIA_METRO_ALIASES)) {
    if (!locationMentionsCityLabel(location, cityLabel)) continue;
    if (companyCityMatchesSelection(cityLabel, selectedCities)) return true;
    return false;
  }

  return true;
}

export function rankPeopleByCityMatch<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  selectedCities: string[],
): T[] {
  if (selectedCities.length === 0) return people;
  return [...people].sort((a, b) => {
    const aMatch = a.location ? companyCityMatchesSelection(a.location, selectedCities) : false;
    const bMatch = b.location ? companyCityMatchesSelection(b.location, selectedCities) : false;
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
}
