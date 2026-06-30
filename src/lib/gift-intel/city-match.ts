/** City aliases for India (canonical key → search terms). */
const CITY_ALIASES: Record<string, string[]> = {
  Bengaluru: ["bengaluru", "bangalore", "blr"],
  Mysore: ["mysore", "mysuru"],
  Mangalore: ["mangalore", "mangaluru"],
  Hubli: ["hubli", "hubballi"],
  Tumkur: ["tumkur", "tumakuru"],
  Hassan: ["hassan"],
  Belgaum: ["belgaum", "belagavi"],
  Davanagere: ["davanagere"],
  Shivamogga: ["shivamogga", "shimoga"],
  Bellary: ["bellary", "ballari"],
  Udupi: ["udupi"],
  Hosur: ["hosur"],
};

function normalizeCityToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function citySearchTerms(city: string): string[] {
  const canonical = city.trim();
  const aliases = CITY_ALIASES[canonical] ?? [normalizeCityToken(canonical)];
  return [...new Set([normalizeCityToken(canonical), ...aliases])].filter(Boolean);
}

export function textMentionsCity(text: string, city: string): boolean {
  if (!city.trim()) return true;
  const hay = normalizeCityToken(text);
  return citySearchTerms(city).some((term) => hay.includes(term));
}

export function citiesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizeCityToken(a);
  const nb = normalizeCityToken(b);
  if (na === nb) return true;
  const termsA = citySearchTerms(a);
  const termsB = citySearchTerms(b);
  return termsA.some((t) => termsB.includes(t));
}

export function matchesTargetCity(params: {
  targetCity?: string;
  extractedCity?: string;
  postText?: string;
}): boolean {
  const target = params.targetCity?.trim();
  if (!target) return true;

  if (params.extractedCity && citiesMatch(params.extractedCity, target)) return true;
  if (params.postText && textMentionsCity(params.postText, target)) return true;

  return false;
}
