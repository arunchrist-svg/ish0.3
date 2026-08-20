export const AREA_OF_FOCUS_RADIUS_KM = [1, 2, 5, 10, 15] as const;
export type AreaOfFocusRadiusKm = (typeof AREA_OF_FOCUS_RADIUS_KM)[number];
export const DEFAULT_AREA_OF_FOCUS_RADIUS_KM: AreaOfFocusRadiusKm = 5;

export type ScoutNearbyArea = {
  name: string;
  distanceKm: number;
  /** Omit or true: included in Scout. False: chip stays visible but unselected. */
  selected?: boolean;
};

export type ScoutAreaOfFocus = {
  cityLabel: string;
  areaName: string;
  lat: number;
  lng: number;
  radiusKm: number;
  nearbyAreas: ScoutNearbyArea[];
};

export type CatalogLocality = {
  name: string;
  aliases?: string[];
  city: string;
  lat: number;
  lng: number;
};

/** ISH metros first. Distances are haversine from each locality pin. */
export const LOCALITY_CATALOG: CatalogLocality[] = [
  // Bengaluru east / Kasturi Nagar cluster
  { name: "Kasturi Nagar", aliases: ["Kasturinagar", "Kasthuri Nagar"], city: "Bengaluru", lat: 13.0053, lng: 77.6612 },
  { name: "Banaswadi", city: "Bengaluru", lat: 13.0154, lng: 77.6513 },
  { name: "Ramamurthy Nagar", aliases: ["Ramamurthynagar", "RM Nagar"], city: "Bengaluru", lat: 13.0165, lng: 77.678 },
  { name: "CV Raman Nagar", aliases: ["C V Raman Nagar", "CV Raman Nagara"], city: "Bengaluru", lat: 12.9855, lng: 77.6639 },
  { name: "Baiyappanahalli", aliases: ["Byappanahalli"], city: "Bengaluru", lat: 12.9909, lng: 77.6524 },
  { name: "KR Puram", aliases: ["Krishnarajapura", "Krishnarajapuram"], city: "Bengaluru", lat: 13.0076, lng: 77.6953 },
  { name: "Horamavu", city: "Bengaluru", lat: 13.0273, lng: 77.6602 },
  { name: "Kalyan Nagar", city: "Bengaluru", lat: 13.028, lng: 77.6395 },
  { name: "HRBR Layout", city: "Bengaluru", lat: 13.0206, lng: 77.6436 },
  { name: "Kammanahalli", city: "Bengaluru", lat: 13.0158, lng: 77.6375 },
  { name: "Lingrajapuram", aliases: ["Lingaraajapuram"], city: "Bengaluru", lat: 13.0089, lng: 77.637 },
  { name: "Indiranagar", aliases: ["Indira Nagar"], city: "Bengaluru", lat: 12.9784, lng: 77.6408 },
  { name: "Domlur", city: "Bengaluru", lat: 12.9607, lng: 77.6408 },
  { name: "Ulsoor", aliases: ["Halasuru"], city: "Bengaluru", lat: 12.981, lng: 77.628 },
  { name: "Frazer Town", city: "Bengaluru", lat: 12.9965, lng: 77.6143 },
  { name: "Cox Town", city: "Bengaluru", lat: 12.9953, lng: 77.6226 },
  { name: "Richards Town", city: "Bengaluru", lat: 13.0035, lng: 77.6175 },
  { name: "Benson Town", city: "Bengaluru", lat: 12.9978, lng: 77.6045 },
  { name: "Old Madras Road", city: "Bengaluru", lat: 12.994, lng: 77.668 },
  { name: "Mahadevapura", city: "Bengaluru", lat: 12.9913, lng: 77.6874 },
  { name: "Hennur", city: "Bengaluru", lat: 13.0358, lng: 77.638 },
  { name: "RT Nagar", city: "Bengaluru", lat: 13.0245, lng: 77.5945 },
  { name: "Hebbal", city: "Bengaluru", lat: 13.0358, lng: 77.597 },
  { name: "Manyata", aliases: ["Manyata Tech Park"], city: "Bengaluru", lat: 13.0475, lng: 77.621 },
  { name: "MG Road", city: "Bengaluru", lat: 12.9756, lng: 77.6066 },
  { name: "Brigade Road", city: "Bengaluru", lat: 12.9734, lng: 77.607 },
  { name: "Koramangala", city: "Bengaluru", lat: 12.9352, lng: 77.6245 },
  { name: "HSR Layout", city: "Bengaluru", lat: 12.9121, lng: 77.6446 },
  { name: "Bellandur", city: "Bengaluru", lat: 12.9255, lng: 77.6766 },
  { name: "Sarjapur", aliases: ["Sarjapur Road"], city: "Bengaluru", lat: 12.9116, lng: 77.6389 },
  { name: "Marathahalli", city: "Bengaluru", lat: 12.9591, lng: 77.6974 },
  { name: "Whitefield", city: "Bengaluru", lat: 12.9698, lng: 77.7499 },
  { name: "Brookefield", aliases: ["Brooke Field"], city: "Bengaluru", lat: 12.9652, lng: 77.7179 },
  { name: "Electronic City", city: "Bengaluru", lat: 12.8452, lng: 77.6602 },
  { name: "Jayanagar", city: "Bengaluru", lat: 12.925, lng: 77.5938 },
  { name: "JP Nagar", city: "Bengaluru", lat: 12.9063, lng: 77.5857 },
  { name: "Banashankari", city: "Bengaluru", lat: 12.9255, lng: 77.5468 },
  { name: "Yelahanka", city: "Bengaluru", lat: 13.1005, lng: 77.5963 },
  { name: "Bagmane", aliases: ["Bagmane Tech Park"], city: "Bengaluru", lat: 12.9788, lng: 77.6605 },
  { name: "Anekal", city: "Bengaluru", lat: 12.711, lng: 77.6959 },
  { name: "Attibele", city: "Bengaluru", lat: 12.778, lng: 77.77 },
  // Hosur
  { name: "Hosur", city: "Hosur", lat: 12.7409, lng: 77.8253 },
  { name: "SIPCOT Hosur", aliases: ["SIPCOT"], city: "Hosur", lat: 12.736, lng: 77.851 },
  { name: "Bagalur Hosur", aliases: ["Bagalur"], city: "Hosur", lat: 12.71, lng: 77.79 },
  // Mysuru
  { name: "Mysuru", aliases: ["Mysore"], city: "Mysuru", lat: 12.2958, lng: 76.6394 },
  { name: "Vijayanagar Mysuru", city: "Mysuru", lat: 12.31, lng: 76.614 },
  // Chennai
  { name: "T Nagar", aliases: ["Thyagaraya Nagar"], city: "Chennai", lat: 13.0418, lng: 80.2337 },
  { name: "Guindy", city: "Chennai", lat: 13.0067, lng: 80.2206 },
  { name: "Ambattur", city: "Chennai", lat: 13.1143, lng: 80.1548 },
];

const CITY_KEY_ALIASES: Record<string, string> = {
  bengaluru: "Bengaluru",
  bangalore: "Bengaluru",
  "bengaluru urban": "Bengaluru",
  "bangalore urban": "Bengaluru",
  "bengaluru rural": "Bengaluru",
  hosur: "Hosur",
  krishnagiri: "Hosur",
  mysuru: "Mysuru",
  mysore: "Mysuru",
  chennai: "Chennai",
  madras: "Chennai",
  mangaluru: "Mangaluru",
  mangalore: "Mangaluru",
};

export function normalizeLocalityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

export function catalogCityLabel(cityQuery: string): string | null {
  const key = normalizeLocalityKey(cityQuery);
  return CITY_KEY_ALIASES[key] ?? (LOCALITY_CATALOG.some((row) => normalizeLocalityKey(row.city) === key) ? cityQuery.trim() : null);
}

export function catalogCityLabels(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of LOCALITY_CATALOG) {
    if (seen.has(row.city)) continue;
    seen.add(row.city);
    out.push(row.city);
  }
  return out;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function localityNames(row: CatalogLocality): string[] {
  return [row.name, ...(row.aliases ?? [])];
}

export function findCatalogLocality(city: string, query: string): CatalogLocality | null {
  const cityLabel = catalogCityLabel(city);
  const q = normalizeLocalityKey(query);
  if (!q) return null;
  const pool = LOCALITY_CATALOG.filter((row) => !cityLabel || normalizeLocalityKey(row.city) === normalizeLocalityKey(cityLabel));
  const exact = pool.find((row) => localityNames(row).some((name) => normalizeLocalityKey(name) === q));
  if (exact) return exact;
  return (
    pool.find((row) => localityNames(row).some((name) => normalizeLocalityKey(name).includes(q) || q.includes(normalizeLocalityKey(name)))) ??
    null
  );
}

export function suggestCatalogAreas(city: string, query: string, limit = 8): { name: string }[] {
  const cityLabel = catalogCityLabel(city);
  const q = normalizeLocalityKey(query);
  const pool = LOCALITY_CATALOG.filter((row) => !cityLabel || normalizeLocalityKey(row.city) === normalizeLocalityKey(cityLabel));
  const ranked = pool
    .map((row) => {
      const names = localityNames(row).map(normalizeLocalityKey);
      const score = !q
        ? 1
        : names.some((n) => n === q)
          ? 3
          : names.some((n) => n.startsWith(q))
            ? 2
            : names.some((n) => n.includes(q))
              ? 1
              : 0;
      return { name: row.name, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const out: { name: string }[] = [];
  for (const row of ranked) {
    const key = normalizeLocalityKey(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: row.name });
    if (out.length >= limit) break;
  }
  return out;
}

export function clampAreaOfFocusRadiusKm(value: unknown): AreaOfFocusRadiusKm {
  const n = typeof value === "number" ? value : Number(value);
  if (AREA_OF_FOCUS_RADIUS_KM.includes(n as AreaOfFocusRadiusKm)) return n as AreaOfFocusRadiusKm;
  return DEFAULT_AREA_OF_FOCUS_RADIUS_KM;
}

export function cityCenterForCatalog(city: string): { lat: number; lng: number } | null {
  const cityLabel = catalogCityLabel(city);
  if (!cityLabel) return null;
  const rows = LOCALITY_CATALOG.filter((row) => normalizeLocalityKey(row.city) === normalizeLocalityKey(cityLabel));
  if (!rows.length) return null;
  const lat = rows.reduce((sum, row) => sum + row.lat, 0) / rows.length;
  const lng = rows.reduce((sum, row) => sum + row.lng, 0) / rows.length;
  return { lat, lng };
}

export function nearbyAreasFromPin(params: {
  city: string;
  areaName: string;
  lat: number;
  lng: number;
  radiusKm: number;
}): ScoutNearbyArea[] {
  const cityLabel = catalogCityLabel(params.city);
  const pin = { lat: params.lat, lng: params.lng };
  const radiusKm = clampAreaOfFocusRadiusKm(params.radiusKm);
  const pool = LOCALITY_CATALOG.filter((row) => !cityLabel || normalizeLocalityKey(row.city) === normalizeLocalityKey(cityLabel));
  const nearby: ScoutNearbyArea[] = [];
  const seen = new Set<string>();

  const push = (name: string, distanceKm: number) => {
    const key = normalizeLocalityKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    nearby.push({ name, distanceKm: Math.round(distanceKm * 10) / 10, selected: true });
  };

  push(params.areaName.trim() || "Selected area", 0);

  for (const row of pool) {
    const distanceKm = haversineKm(pin, row);
    if (distanceKm > radiusKm) continue;
    push(row.name, distanceKm);
  }

  nearby.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  return nearby;
}

export function resolveAreaOfFocusFromCatalog(params: {
  city: string;
  query: string;
  radiusKm: number;
  pin?: { lat: number; lng: number; name?: string };
}): ScoutAreaOfFocus | null {
  const cityLabel = catalogCityLabel(params.city) ?? params.city.trim();
  if (!cityLabel) return null;
  const catalogHit = findCatalogLocality(cityLabel, params.query);
  const lat = params.pin?.lat ?? catalogHit?.lat;
  const lng = params.pin?.lng ?? catalogHit?.lng;
  const areaName = (params.pin?.name ?? catalogHit?.name ?? params.query).trim();
  if (!areaName || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const radiusKm = clampAreaOfFocusRadiusKm(params.radiusKm);
  return {
    cityLabel,
    areaName,
    lat,
    lng,
    radiusKm,
    nearbyAreas: nearbyAreasFromPin({ city: cityLabel, areaName, lat, lng, radiusKm }),
  };
}

export function normalizeScoutAreaOfFocus(raw?: Partial<ScoutAreaOfFocus> | null): ScoutAreaOfFocus | null {
  if (!raw || typeof raw !== "object") return null;
  const cityLabel = typeof raw.cityLabel === "string" ? raw.cityLabel.trim() : "";
  const areaName = typeof raw.areaName === "string" ? raw.areaName.trim() : "";
  const lat = typeof raw.lat === "number" ? raw.lat : Number(raw.lat);
  const lng = typeof raw.lng === "number" ? raw.lng : Number(raw.lng);
  if (!cityLabel || !areaName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radiusKm = clampAreaOfFocusRadiusKm(raw.radiusKm);
  const nearbyAreas = Array.isArray(raw.nearbyAreas)
    ? raw.nearbyAreas
        .map((row) => ({
          name: typeof row?.name === "string" ? row.name.trim() : "",
          distanceKm: typeof row?.distanceKm === "number" ? row.distanceKm : Number(row?.distanceKm) || 0,
          selected: row?.selected !== false,
        }))
        .filter((row) => row.name)
    : [];
  if (!nearbyAreas.length) {
    return resolveAreaOfFocusFromCatalog({ city: cityLabel, query: areaName, radiusKm, pin: { lat, lng, name: areaName } });
  }
  return { cityLabel, areaName, lat, lng, radiusKm, nearbyAreas };
}

export function isNearbyAreaSelected(area: Pick<ScoutNearbyArea, "selected">): boolean {
  return area.selected !== false;
}

export function nearbyAreaChipLabels(focus: ScoutAreaOfFocus | null | undefined): string[] {
  if (!focus) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const names = focus.nearbyAreas.length
    ? focus.nearbyAreas.map((row) => row.name)
    : [focus.areaName];
  for (const name of names) {
    const trimmed = name.trim();
    const key = normalizeLocalityKey(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function applyNearbyAreaSelection(focus: ScoutAreaOfFocus, selectedNames: string[]): ScoutAreaOfFocus {
  const keys = new Set(selectedNames.map(normalizeLocalityKey));
  return {
    ...focus,
    nearbyAreas: focus.nearbyAreas.map((row) => ({
      ...row,
      selected: keys.has(normalizeLocalityKey(row.name)),
    })),
  };
}

export function setAllNearbyAreasSelected(focus: ScoutAreaOfFocus, selected: boolean): ScoutAreaOfFocus {
  return {
    ...focus,
    nearbyAreas: focus.nearbyAreas.map((row) => ({ ...row, selected })),
  };
}

export function areaOfFocusSearchLabels(focus: ScoutAreaOfFocus | null | undefined): string[] {
  if (!focus) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const rows = focus.nearbyAreas.length
    ? focus.nearbyAreas
    : [{ name: focus.areaName, distanceKm: 0, selected: true }];
  for (const row of rows) {
    if (!isNearbyAreaSelected(row)) continue;
    const trimmed = row.name.trim();
    const key = normalizeLocalityKey(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function isScoutAreaOfFocusSet(focus: ScoutAreaOfFocus | null | undefined): boolean {
  return Boolean(focus?.cityLabel?.trim() && focus.areaName.trim());
}

export function scoutAreaOfFocusKey(focus: Pick<ScoutAreaOfFocus, "cityLabel" | "areaName">): string {
  return `${normalizeLocalityKey(focus.cityLabel)}::${normalizeLocalityKey(focus.areaName)}`;
}

export const MAX_SCOUT_AREAS_OF_FOCUS = 8;

export function normalizeScoutAreasOfFocus(
  raw?: unknown,
  legacy?: Partial<ScoutAreaOfFocus> | null,
): ScoutAreaOfFocus[] {
  const list: unknown[] = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  if (!list.length && legacy) list.push(legacy);
  const out: ScoutAreaOfFocus[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const normalized = normalizeScoutAreaOfFocus(item as Partial<ScoutAreaOfFocus>);
    if (!normalized) continue;
    const key = scoutAreaOfFocusKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= MAX_SCOUT_AREAS_OF_FOCUS) break;
  }
  return out;
}

export function primaryScoutAreaOfFocus(
  focuses: ScoutAreaOfFocus[] | ScoutAreaOfFocus | null | undefined,
): ScoutAreaOfFocus | null {
  if (Array.isArray(focuses)) return focuses.find(isScoutAreaOfFocusSet) ?? null;
  return isScoutAreaOfFocusSet(focuses) ? focuses! : null;
}

export function isAnyScoutAreaOfFocusSet(
  focuses: ScoutAreaOfFocus[] | ScoutAreaOfFocus | null | undefined,
): boolean {
  return primaryScoutAreaOfFocus(focuses) != null;
}

export function upsertScoutAreaOfFocus(
  focuses: ScoutAreaOfFocus[],
  next: ScoutAreaOfFocus,
): ScoutAreaOfFocus[] {
  const key = scoutAreaOfFocusKey(next);
  const idx = focuses.findIndex((row) => scoutAreaOfFocusKey(row) === key);
  if (idx >= 0) {
    const copy = [...focuses];
    copy[idx] = next;
    return normalizeScoutAreasOfFocus(copy);
  }
  return normalizeScoutAreasOfFocus([...focuses, next]);
}

export function removeScoutAreaOfFocus(
  focuses: ScoutAreaOfFocus[],
  key: string,
): ScoutAreaOfFocus[] {
  return focuses.filter((row) => scoutAreaOfFocusKey(row) !== key);
}

export function applyNearbyAreaSelectionToFocuses(
  focuses: ScoutAreaOfFocus[],
  selectedNames: string[],
): ScoutAreaOfFocus[] {
  return focuses.map((focus) => applyNearbyAreaSelection(focus, selectedNames));
}

export function placesLocationBiasFromFocuses(
  focuses: ScoutAreaOfFocus[] | null | undefined,
  selectedLabels?: string[],
): { lat: number; lng: number; radiusMeters: number } | undefined {
  const list = normalizeScoutAreasOfFocus(focuses ?? []);
  if (!list.length) return undefined;
  const keys = new Set((selectedLabels ?? []).map(normalizeLocalityKey).filter(Boolean));
  const matching = list.filter((focus) => {
    const labels = areaOfFocusSearchLabels(focus);
    if (!keys.size) return labels.length > 0;
    return labels.some((name) => keys.has(normalizeLocalityKey(name)));
  });
  // If multiple focus clusters match (e.g. Kasturi Nagar + Whitefield selected),
  // pick the one with the most overlap instead of disabling the geo bias.
  const pickBestPin = () => {
    if (matching.length === 0) return list[0];
    if (matching.length === 1) return matching[0];
    if (!keys.size) return matching[0];
    const score = (focus: ScoutAreaOfFocus) =>
      areaOfFocusSearchLabels(focus).reduce((sum, name) => {
        const k = normalizeLocalityKey(name);
        return sum + (k && keys.has(k) ? 1 : 0);
      }, 0);
    const best = [...matching].sort((a, b) => score(b) - score(a))[0];
    return best ?? matching[0];
  };

  const pin = pickBestPin();
  if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return undefined;
  return {
    lat: pin.lat,
    lng: pin.lng,
    radiusMeters: Math.max(500, pin.radiusKm * 1000),
  };
}

async function geocodeAreaWithPlaces(params: {
  city: string;
  query: string;
}): Promise<{ lat: number; lng: number; name: string } | null> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return null;
  try {
    const { googlePlacesAutocompleteAreas, googlePlacesGeocodePlace } = await import(
      "@/lib/enrichment/google-places"
    );
    const center = cityCenterForCatalog(params.city);
    const suggestions = await googlePlacesAutocompleteAreas({
      query: params.query,
      city: params.city,
      locationBias: center ? { lat: center.lat, lng: center.lng, radiusMeters: 25_000 } : undefined,
    });
    const first = suggestions[0];
    if (!first) return null;
    return googlePlacesGeocodePlace(first.placeId);
  } catch {
    return null;
  }
}

async function supplementNearbyWithPlaces(params: {
  city: string;
  focus: ScoutAreaOfFocus;
}): Promise<ScoutAreaOfFocus> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return params.focus;
  if (params.focus.nearbyAreas.length >= 4) return params.focus;
  try {
    const { googlePlacesAutocompleteAreas } = await import("@/lib/enrichment/google-places");
    const extra = await googlePlacesAutocompleteAreas({
      query: params.focus.areaName,
      city: params.city,
      locationBias: {
        lat: params.focus.lat,
        lng: params.focus.lng,
        radiusMeters: params.focus.radiusKm * 1000,
      },
    });
    const seen = new Set(params.focus.nearbyAreas.map((row) => normalizeLocalityKey(row.name)));
    const nearbyAreas = [...params.focus.nearbyAreas];
    for (const row of extra) {
      const name = row.text.split(",")[0]?.trim() ?? "";
      const key = normalizeLocalityKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      nearbyAreas.push({ name, distanceKm: 0, selected: true });
    }
    return { ...params.focus, nearbyAreas };
  } catch {
    return params.focus;
  }
}

/** Catalog-first resolve. Uses Google Places Autocomplete + Place Details when GOOGLE_PLACES_API_KEY is set. */
export async function resolveAreaOfFocus(params: {
  city: string;
  query: string;
  radiusKm: number;
}): Promise<ScoutAreaOfFocus | null> {
  const query = params.query.trim();
  if (!query) return null;
  const pin = await geocodeAreaWithPlaces({ city: params.city, query });
  const resolved = resolveAreaOfFocusFromCatalog({
    city: params.city,
    query,
    radiusKm: params.radiusKm,
    pin: pin ?? undefined,
  });
  if (!resolved) return null;
  return supplementNearbyWithPlaces({ city: params.city, focus: resolved });
}
