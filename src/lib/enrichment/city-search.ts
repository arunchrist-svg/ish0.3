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
