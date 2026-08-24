import {
  compactSearchTermsForScoutLabels,
  isBroadGeoLabel,
  isNationwideLabel,
  matchTermsForScoutLabels,
  resolveScoutLabel,
} from "@/lib/geo/india";
import { LOCALITY_CATALOG, normalizeLocalityKey } from "@/lib/geo/area-of-focus";

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
  if (selectionLooksLikeNeighborhoods(cities)) {
    return applyCityAliases(cities.map((c) => c.trim()).filter(Boolean));
  }
  return applyCityAliases(compactSearchTermsForScoutLabels(cities));
}

/** Full alias set for post-filters: state/region labels include every district and metro. */
export function expandCityMatchTerms(cities: string[]): string[] {
  if (isNationwideSelection(cities)) return ["India"];
  if (selectionLooksLikeNeighborhoods(cities)) {
    return applyCityAliases(cities.map((c) => c.trim()).filter(Boolean));
  }
  return applyCityAliases(matchTermsForScoutLabels(cities));
}

export function citySearchClause(cities?: string[], max = 8): string {
  const selected = (cities ?? []).map((c) => c.trim()).filter(Boolean);
  if (!selected.length) return "";
  if (isNationwideSelection(selected)) return "India";

  const neighborhoodLabels = selected.filter((label) => resolveScoutLabel(label) == null);
  if (!neighborhoodLabels.length) {
    return expandCitySearchTerms(selected).slice(0, max).join(" OR ");
  }

  // LinkedIn profiles say "Bengaluru", never "Kasturi Nagar". Parent metros must
  // occupy the first slots so a 6-term cap cannot drop them behind 30 chips.
  const parentTerms = applyCityAliases([
    ...parentCitiesForNeighborhoods(neighborhoodLabels),
    ...selected.filter((label) => resolveScoutLabel(label) != null),
  ]);
  const localityTerms = applyCityAliases(neighborhoodLabels).filter((term) => !parentTerms.includes(term));
  const keptParents = parentTerms.slice(0, Math.min(3, Math.max(1, max - 1)));
  const keptLocalities = localityTerms.slice(0, Math.max(1, max - keptParents.length));
  return [...keptParents, ...keptLocalities].join(" OR ");
}

const UNVERIFIED_CITY_LABELS = new Set(["", "india", "unknown"]);

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

const PLANT_CITY_LABELS = new Set([
  "hosur",
  "ramanagara",
  "tumkur",
  "tumakuru",
  "hassan",
  "mandya",
  "kolar",
  "chitradurga",
  "hubli",
  "hubballi",
  "davanagere",
  "bellary",
  "ballari",
  "belgaum",
  "belagavi",
]);

export function hasPlantCitySelection(selectedCities: string[]): boolean {
  return selectedCities.some((city) => PLANT_CITY_LABELS.has(normalizeCity(city)));
}

/** True when labels are neighborhood names, not district/state/region picks. */
export function selectionLooksLikeNeighborhoods(selectedCities: string[]): boolean {
  const labels = selectedCities.map((c) => c.trim()).filter(Boolean);
  if (!labels.length) return false;
  return labels.every((label) => resolveScoutLabel(label) == null);
}

/**
 * For a set of neighborhood names (Focus Area chips), returns their parent city names
 * from LOCALITY_CATALOG. Used to supplement registry queries that index by city, not area.
 * e.g. ["SIPCOT Hosur", "Bagalur Hosur"] → ["Hosur"]
 * e.g. ["Kasturi Nagar", "Indiranagar"] → ["Bengaluru"]
 */
export function parentCitiesForNeighborhoods(neighborhoods: string[]): string[] {
  const parentCities = new Set<string>();
  for (const label of neighborhoods) {
    const key = normalizeLocalityKey(label.trim());
    if (!key) continue;
    const row = LOCALITY_CATALOG.find(
      (entry) =>
        normalizeLocalityKey(entry.name) === key ||
        (entry.aliases ?? []).some((a) => normalizeLocalityKey(a) === key),
    );
    if (row?.city && normalizeLocalityKey(row.city) !== key) {
      parentCities.add(row.city);
    }
  }
  return [...parentCities];
}

/**
 * HQ corridor (e.g. Bangalore on a Hosur scout, or on a Kasturi Nagar Focus Area).
 * Focus Area needs it too: profiles say "Bengaluru", never "Kasturi Nagar", so a strict
 * locality gate returns zero leads. Locality mentions still rank first.
 * Off only for local-business scouts, where an out-of-area HQ contact is the wrong person.
 */
export function includeHqCorridorForScoutPeople(params: {
  cities?: string[];
  locationScope?: "focus" | "interest";
  localOperators?: boolean;
}): boolean {
  return !params.localOperators;
}

/** Places circle bias is for neighborhood Focus Area, not Area of Interest district chips. */
export function shouldApplyPlacesFocusBias(
  locationScope: "focus" | "interest" | undefined,
  selectedCities: string[],
): boolean {
  if (!selectionLooksLikeNeighborhoods(selectedCities)) return false;
  return locationScope !== "interest";
}

/**
 * Neighborhood Focus Area (Kasturi Nagar) must keep Bengaluru HQ profiles.
 * LinkedIn says the metro, not the ward. Do not widen to the whole state.
 * Local-business scouts stay inside the pin.
 */
export function peopleFilterUsesHqCorridor(params: {
  locationScope?: "focus" | "interest";
  cities?: string[];
  peopleCities?: string[];
  localOperators?: boolean;
}): boolean {
  if (params.localOperators) return false;
  if (params.locationScope === "focus") {
    return selectionLooksLikeNeighborhoods(params.cities ?? []);
  }
  if (params.peopleCities?.length) {
    return (
      !isNationwideSelection(params.peopleCities) &&
      !selectionLooksLikeNeighborhoods(params.peopleCities)
    );
  }
  return includeHqCorridorForScoutPeople({
    cities: params.cities,
    locationScope: params.locationScope,
    localOperators: params.localOperators,
  });
}

function companyHaystack(company: { city?: string | null; intelNotes?: string | null }): string {
  return `${company.city ?? ""} ${company.intelNotes ?? ""}`.toLowerCase();
}

function localityMentionTerms(selectedCities: string[]): string[] {
  const terms = new Set<string>();
  for (const label of selectedCities) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    terms.add(normalizeCity(trimmed));
    const key = normalizeLocalityKey(trimmed);
    const row = LOCALITY_CATALOG.find(
      (entry) =>
        normalizeLocalityKey(entry.name) === key ||
        (entry.aliases ?? []).some((alias) => normalizeLocalityKey(alias) === key),
    );
    if (!row) continue;
    terms.add(normalizeCity(row.name));
    for (const alias of row.aliases ?? []) terms.add(normalizeCity(alias));
  }
  return [...terms].filter((term) => term.length >= 3);
}

function mentionsSelectedLocality(
  haystack: string,
  selectedCities: string[],
): boolean {
  const blob = haystack.toLowerCase();
  return localityMentionTerms(selectedCities).some((alias) => blob.includes(alias));
}

export type CompanyScoutMatchOpts = {
  searchKind?: "industry" | "business";
  geoVerified?: boolean;
};

/**
 * Focus Area / neighborhood Scout: company must mention a selected locality
 * (city, intelNotes, or address). Plain Bengaluru or empty city does not pass.
 * Local businesses from a geo-biased Places search pass even when city is only Bengaluru.
 */
export function companyMatchesScoutSelection(
  company: { city?: string | null; intelNotes?: string | null },
  selectedCities: string[],
  opts?: CompanyScoutMatchOpts,
): boolean {
  if (selectedCities.length === 0 || isNationwideSelection(selectedCities)) return true;

  if (!selectionLooksLikeNeighborhoods(selectedCities)) {
    if (companyCityMatchesSelection(company.city, selectedCities)) return true;
    // Places often parses a ward ("Anna Colony") while Address still has Salem/Erode.
    const haystack = companyHaystack(company);
    if (!haystack.trim()) return false;
    return expandCityMatchTerms(selectedCities)
      .map(normalizeCity)
      .filter((alias) => alias.length >= 4)
      .some((alias) => haystack.includes(alias));
  }

  // Google Places results under a geo-bias circle can be local even when
  // the address text does not contain the exact selected locality chip names.
  if (opts?.geoVerified) return true;

  const haystack = companyHaystack(company);
  if (mentionsSelectedLocality(haystack, selectedCities)) return true;

  return companyCityMatchesSelection(company.city, selectedCities);
}

export function rankCompaniesByLocalityMention<T extends { city?: string | null; intelNotes?: string | null }>(
  companies: T[],
  selectedCities: string[],
): T[] {
  if (!selectionLooksLikeNeighborhoods(selectedCities)) return companies;
  return [...companies].sort((a, b) => {
    const aHit = mentionsSelectedLocality(companyHaystack(a), selectedCities) ? 1 : 0;
    const bHit = mentionsSelectedLocality(companyHaystack(b), selectedCities) ? 1 : 0;
    return bHit - aHit;
  });
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

  // Neighborhood aliases can contain short tokens like "nagar". Reverse
  // includes() would treat parent-metro "Bengaluru" or "Nagar" as a match.
  if (selectionLooksLikeNeighborhoods(selectedCities)) {
    return localityMentionTerms(selectedCities).some(
      (alias) => normalizedCompany === alias || normalizedCompany.includes(alias),
    );
  }

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
  /\b(united states|u\.s\.a\.|u\.s\.|usa|united kingdom|u\.k\.|uk|canada|australia|germany|france|netherlands|switzerland|sweden|norway|denmark|ireland|new zealand|brazil|mexico|japan|spain|italy|florida|california|texas|illinois|ohio|georgia|arizona|colorado|michigan|pennsylvania|massachusetts|washington|virginia|north carolina|new york|new jersey|nyc|ny|manhattan|brooklyn|queens|tampa|miami|orlando|atlanta|chicago|seattle|boston|dallas|houston|phoenix|denver|detroit|philadelphia|los angeles|san francisco|las vegas|greater tampa|bay area)\b/i;

/** True when a profile location is clearly outside India. */
export function isForeignPersonLocation(location: string | null | undefined): boolean {
  if (!location?.trim()) return false;
  return FOREIGN_LOCATION_RE.test(normalizeCity(location));
}

function selectionAllowsUnknownLocation(selectedCities: string[]): boolean {
  return selectedCities.some((label) => isNationwideLabel(label) || isBroadGeoLabel(label));
}

/** True when person location matches the scout area. Empty location is not a district match. */
export function personLocationMatchesSelection(
  location: string | null | undefined,
  selectedCities: string[],
): boolean {
  if (selectedCities.length === 0 || isNationwideSelection(selectedCities)) return true;
  if (!location?.trim()) return selectionAllowsUnknownLocation(selectedCities);

  const normalizedLocation = normalizeCity(location);
  if (UNVERIFIED_CITY_LABELS.has(normalizedLocation) || normalizedLocation === "india") {
    return selectionAllowsUnknownLocation(selectedCities);
  }

  if (isForeignPersonLocation(location)) return false;
  if (selectionLooksLikeNeighborhoods(selectedCities)) {
    return mentionsSelectedLocality(location, selectedCities);
  }
  if (companyCityMatchesSelection(location, selectedCities)) return true;

  for (const cityLabel of Object.keys(INDIA_METRO_ALIASES)) {
    if (!locationMentionsCityLabel(location, cityLabel)) continue;
    return companyCityMatchesSelection(cityLabel, selectedCities);
  }

  return false;
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
 * Plant city plus corridor HQ. Hosur always includes Bengaluru/Bangalore.
 * These are first-class matches, not a fallback after the plant is empty.
 */
const BANGALORE_HQ = ["Bengaluru", "Bangalore"];

export function nearbyLabelsForScoutCities(selectedCities: string[]): string[] {
  if (selectionLooksLikeNeighborhoods(selectedCities)) {
    // A locality's corridor is its parent metro — that is where its workforce says it lives.
    const chips = selectedCities.map((c) => c.trim()).filter(Boolean);
    return [...new Set([...chips, ...applyCityAliases(parentCitiesForNeighborhoods(chips))])];
  }
  const extra = new Set<string>(selectedCities);
  const corridor: Record<string, string[]> = {
    Hosur: ["Hosur", "Krishnagiri", ...BANGALORE_HQ],
    Krishnagiri: ["Krishnagiri", "Hosur", ...BANGALORE_HQ],
    Ramanagara: ["Ramanagara", ...BANGALORE_HQ],
    Kolar: ["Kolar", ...BANGALORE_HQ],
    Tumkur: ["Tumkur", "Tumakuru", ...BANGALORE_HQ],
    Tumakuru: ["Tumakuru", "Tumkur", ...BANGALORE_HQ],
    Mandya: ["Mandya", ...BANGALORE_HQ],
    Hassan: ["Hassan", ...BANGALORE_HQ],
  };
  for (const city of selectedCities) {
    for (const nearby of corridor[city] ?? []) extra.add(nearby);
  }
  return [...extra];
}

const FAR_METRO_WHEN_SOUTH_PLANT = ["Delhi", "Mumbai", "Kolkata", "Pune", "Hyderabad"];

/**
 * True when the location is too vague to assert a specific city — "India",
 * "Karnataka", "Tamil Nadu", etc. These are treated the same as blank location
 * for plant-city corridor scouts: we keep the person rather than drop them.
 */
function isVagueLevelLocation(location: string | null | undefined): boolean {
  if (!location?.trim()) return true;
  const norm = normalizeCity(location);
  if (UNVERIFIED_CITY_LABELS.has(norm)) return true;
  return /^(india|karnataka|tamil\s?nadu|maharashtra|gujarat|telangana|andhra\s?pradesh|rajasthan|uttar\s?pradesh|west\s?bengal|punjab|haryana|madhya\s?pradesh|odisha|kerala|bihar)([\s,]|$)/i.test(
    norm,
  );
}

/** Keep anyone in India (or unknown location). Drop US/UK/etc. Used for ISH festive-sweets leads. */
export function selectPeopleInIndia<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  preferredCities: string[] = [],
): { people: T[]; relaxedToIndia: boolean } {
  const kept = people.filter((person) => !isForeignPersonLocation(person.location));
  return {
    people: rankPeopleByCityMatch(kept, preferredCities),
    relaxedToIndia: true,
  };
}

export function selectPeopleForLeadLocation<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  selectedCities: string[],
  opts?: { indiaOnly?: boolean; includeHqCorridor?: boolean },
): { people: T[]; relaxedToIndia: boolean } {
  if (opts?.indiaOnly) return selectPeopleInIndia(people, selectedCities);
  return selectPeopleForScoutCities(people, selectedCities, { includeHqCorridor: opts?.includeHqCorridor });
}

export function selectPeopleForScoutCities<T extends { location?: string | null; matchScore?: number }>(
  people: T[],
  selectedCities: string[],
  opts?: { includeHqCorridor?: boolean },
): { people: T[]; relaxedToIndia: boolean } {
  if (!selectedCities.length || isNationwideSelection(selectedCities)) {
    return { people, relaxedToIndia: false };
  }

  const neighborhoodFocus = selectionLooksLikeNeighborhoods(selectedCities);
  const includeHqCorridor = opts?.includeHqCorridor !== false;
  const corridorLabels = includeHqCorridor ? nearbyLabelsForScoutCities(selectedCities) : selectedCities;
  // Far-metro exclusion (Delhi/Mumbai/etc.) only applies to plant-city corridor scouts.
  // When the user explicitly selected a broader region like "South India" as their people area,
  // the city match below correctly includes Hyderabad/Pune/etc., so we skip the hard exclusion.
  const applyFarMetroExclusion = hasPlantCitySelection(selectedCities);
  const kept = people.filter((p) => {
    if (isForeignPersonLocation(p.location)) return false;
    if (applyFarMetroExclusion) {
      for (const metro of FAR_METRO_WHEN_SOUTH_PLANT) {
        if (locationMentionsCityLabel(p.location ?? "", metro) && !corridorLabels.includes(metro)) {
          return false;
        }
      }
    }
    const haystack = `${p.location ?? ""} ${"bio" in p && typeof p.bio === "string" ? p.bio : ""}`;
    return personLocationMatchesSelection(haystack, corridorLabels);
  });

  if (kept.length > 0) {
    const usedHq =
      includeHqCorridor &&
      nearbyLabelsForScoutCities(selectedCities).some((label) => !selectedCities.includes(label)) &&
      kept.some((p) => !personLocationMatchesSelection(p.location, selectedCities));
    return {
      people: rankPeopleByCityMatch(kept, selectedCities),
      relaxedToIndia: usedHq,
    };
  }

  if (!neighborhoodFocus || includeHqCorridor) {
    // For plant-city corridor scouts, keep people whose location is blank or only
    // country/state-level (e.g. "India", "Karnataka"). They likely work at the plant
    // but LinkedIn omits the specific city in the snippet. Strict far-metro people
    // were already dropped above, so this is safe.
    const vagueOrUntitled = people.filter((p) => isVagueLevelLocation(p.location));
    if (vagueOrUntitled.length > 0) {
      return { people: vagueOrUntitled, relaxedToIndia: true };
    }
  }

  return { people: [], relaxedToIndia: false };
}
