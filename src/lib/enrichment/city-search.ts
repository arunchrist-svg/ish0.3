import {
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

export function citySearchClause(cities?: string[], max = 6): string {
  return expandCitySearchTerms(cities ?? []).slice(0, max).join(" OR ");
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

const FOREIGN_LOCATION_RE =
  /\b(united states|u\.s\.a\.|u\.s\.|usa|united kingdom|u\.k\.|uk|canada|australia|germany|france|netherlands|switzerland|sweden|norway|denmark|ireland|new zealand|brazil|mexico|japan|spain|italy|florida|california|texas|illinois|ohio|georgia|arizona|colorado|michigan|pennsylvania|massachusetts|washington|virginia|north carolina|new york|new jersey|tampa|miami|orlando|atlanta|chicago|seattle|boston|dallas|houston|phoenix|denver|detroit|philadelphia|los angeles|san francisco|las vegas)\b/i;

/** True when a profile location is clearly outside India. */
export function isForeignPersonLocation(location: string | null | undefined): boolean {
  if (!location?.trim()) return false;
  return FOREIGN_LOCATION_RE.test(normalizeCity(location));
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

  if (isForeignPersonLocation(location)) return false;

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

/**
 * Prefer people in the scout cities. If every located person is elsewhere in India
 * (common for plant-city scouts vs HQ DMs), keep India-based people instead of wiping.
 */
export function selectPeopleForScoutCities<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  selectedCities: string[],
): { people: T[]; relaxedToIndia: boolean } {
  if (!selectedCities.length || isNationwideSelection(selectedCities)) {
    return { people, relaxedToIndia: false };
  }

  const local = people.filter((p) => personLocationMatchesSelection(p.location, selectedCities));
  if (local.some((p) => p.location?.trim())) {
    return { people: rankPeopleByCityMatch(local, selectedCities), relaxedToIndia: false };
  }

  const inIndia = people.filter((p) => !isForeignPersonLocation(p.location));
  if (inIndia.length > 0) {
    return { people: rankPeopleByCityMatch(inIndia, selectedCities), relaxedToIndia: true };
  }

  return { people: rankPeopleByCityMatch(local, selectedCities), relaxedToIndia: false };
}
