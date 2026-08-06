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
};

export function expandCitySearchTerms(cities: string[]): string[] {
  const terms = new Set<string>();
  for (const city of cities) {
    for (const alias of CITY_SEARCH_ALIASES[city] ?? [city]) {
      terms.add(alias);
    }
  }
  return [...terms];
}

export function citySearchClause(cities: string[], max = 6): string {
  return expandCitySearchTerms(cities).slice(0, max).join(" OR ");
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
  if (selectedCities.length === 0) return true;
  if (!companyCity?.trim()) return false;

  const normalizedCompany = normalizeCity(companyCity);
  if (UNVERIFIED_CITY_LABELS.has(normalizedCompany)) return false;

  return selectedCities.some((selected) => {
    const aliases = expandCitySearchTerms([selected]).map(normalizeCity);
    return aliases.some(
      (alias) =>
        normalizedCompany === alias ||
        normalizedCompany.includes(alias) ||
        alias.includes(normalizedCompany),
    );
  });
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
  if (selectedCities.length === 0) return true;
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
