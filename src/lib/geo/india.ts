import { INDIA_REGION_ROWS, INDIA_STATE_ROWS, type IndiaRegionId } from "./india-data";

export type { IndiaRegionId };

export type ScoutGeoSelection = {
  entireIndia: boolean;
  regionIds: string[];
  stateIds: string[];
  districtIds: string[];
};

export type IndiaDistrict = {
  id: string;
  name: string;
  aliases: string[];
  displayName: string;
  stateId: string;
  regionId: IndiaRegionId;
};

export type IndiaState = {
  id: string;
  name: string;
  regionId: IndiaRegionId;
  districts: IndiaDistrict[];
};

export type IndiaRegion = {
  id: IndiaRegionId;
  name: string;
  states: IndiaState[];
};

export type ScoutLocationOption = {
  id: string;
  label: string;
  group: string;
  kind: "india" | "region" | "state" | "district";
  searchTerms: string[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDistrict(raw: string, stateId: string, regionId: IndiaRegionId): IndiaDistrict {
  const [name, ...aliasParts] = raw.split("|").map((p) => p.trim()).filter(Boolean);
  const aliases = [...new Set(aliasParts.filter((a) => a.toLowerCase() !== name.toLowerCase()))];
  return {
    id: `${stateId}-${slugify(name)}`,
    name,
    aliases,
    displayName: aliases[0] ?? name,
    stateId,
    regionId,
  };
}

export const INDIA_STATES: IndiaState[] = INDIA_STATE_ROWS.map((row) => ({
  id: row.id,
  name: row.name,
  regionId: row.regionId,
  districts: row.districts.map((d) => parseDistrict(d, row.id, row.regionId)),
}));

export const INDIA_REGIONS: IndiaRegion[] = INDIA_REGION_ROWS.map((region) => ({
  id: region.id,
  name: region.name,
  states: INDIA_STATES.filter((s) => s.regionId === region.id),
}));

const STATE_BY_ID = new Map(INDIA_STATES.map((s) => [s.id, s]));
const DISTRICT_BY_ID = new Map(INDIA_STATES.flatMap((s) => s.districts.map((d) => [d.id, d] as const)));
const REGION_BY_ID = new Map(INDIA_REGIONS.map((r) => [r.id, r]));

export const ENTIRE_INDIA_LABEL = "Entire India";
export const ENTIRE_INDIA_ID = "IN";

export const DEFAULT_SCOUT_GEO: ScoutGeoSelection = {
  entireIndia: false,
  regionIds: [],
  stateIds: [],
  districtIds: [
    "KA-bengaluru-urban",
    "KA-mysuru",
    "KA-dakshina-kannada",
    "KA-dharwad",
    "KA-tumakuru",
    "KA-hassan",
    "KA-belagavi",
    "KA-davanagere",
    "KA-shivamogga",
    "KA-ballari",
    "KA-udupi",
    "TN-krishnagiri",
  ],
};

export function emptyScoutGeo(): ScoutGeoSelection {
  return { entireIndia: false, regionIds: [], stateIds: [], districtIds: [] };
}

export function sanitizeScoutGeo(raw?: Partial<ScoutGeoSelection> | null): ScoutGeoSelection {
  if (!raw || typeof raw !== "object") return emptyScoutGeo();
  if (raw.entireIndia) {
    return { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] };
  }
  const regionIds = [...new Set((raw.regionIds ?? []).filter((id) => REGION_BY_ID.has(id as IndiaRegionId)))];
  const coveredStateIds = new Set(
    regionIds.flatMap((rid) => REGION_BY_ID.get(rid as IndiaRegionId)?.states.map((s) => s.id) ?? []),
  );
  const stateIds = [...new Set((raw.stateIds ?? []).filter((id) => STATE_BY_ID.has(id) && !coveredStateIds.has(id)))];
  const coveredDistrictIds = new Set([
    ...regionIds.flatMap((rid) =>
      REGION_BY_ID.get(rid as IndiaRegionId)?.states.flatMap((s) => s.districts.map((d) => d.id)) ?? [],
    ),
    ...stateIds.flatMap((sid) => STATE_BY_ID.get(sid)?.districts.map((d) => d.id) ?? []),
  ]);
  const districtIds = [...new Set((raw.districtIds ?? []).filter((id) => DISTRICT_BY_ID.has(id) && !coveredDistrictIds.has(id)))];
  return { entireIndia: false, regionIds, stateIds, districtIds };
}

export function normalizeScoutGeo(raw?: Partial<ScoutGeoSelection> | null): ScoutGeoSelection {
  const sanitized = sanitizeScoutGeo(raw);
  if (!scoutGeoHasSelection(sanitized)) return { ...DEFAULT_SCOUT_GEO };
  return sanitized;
}

export function scoutGeoHasSelection(geo: ScoutGeoSelection): boolean {
  return geo.entireIndia || geo.regionIds.length > 0 || geo.stateIds.length > 0 || geo.districtIds.length > 0;
}

export function countScoutGeoPicks(geo: ScoutGeoSelection): number {
  if (geo.entireIndia) return 1;
  return geo.regionIds.length + geo.stateIds.length + geo.districtIds.length;
}

export function summarizeScoutGeo(geo: ScoutGeoSelection): string {
  const normalized = normalizeScoutGeo(geo);
  if (normalized.entireIndia) return ENTIRE_INDIA_LABEL;
  const parts: string[] = [];
  for (const id of normalized.regionIds) {
    const region = REGION_BY_ID.get(id as IndiaRegionId);
    if (region) parts.push(region.name);
  }
  for (const id of normalized.stateIds) {
    const state = STATE_BY_ID.get(id);
    if (state) parts.push(state.name);
  }
  for (const id of normalized.districtIds) {
    const district = DISTRICT_BY_ID.get(id);
    if (district) parts.push(district.displayName);
  }
  if (parts.length === 0) return "No locations";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
  return `${parts[0]} +${parts.length - 1} more`;
}

export type ScoutGeoPickGroup = {
  entireIndia: boolean;
  regions: string[];
  states: string[];
  districtGroups: { state: string; districts: string[] }[];
};

/** Display groups for Settings. Uses stored picks, not the default fallback. */
export function scoutGeoPickGroups(geo?: Partial<ScoutGeoSelection> | null): ScoutGeoPickGroup {
  const sanitized = sanitizeScoutGeo(geo);
  if (sanitized.entireIndia) {
    return { entireIndia: true, regions: [], states: [], districtGroups: [] };
  }
  const regions = sanitized.regionIds
    .map((id) => REGION_BY_ID.get(id as IndiaRegionId)?.name)
    .filter((name): name is string => Boolean(name));
  const states = sanitized.stateIds
    .map((id) => STATE_BY_ID.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  const byState = new Map<string, string[]>();
  for (const id of sanitized.districtIds) {
    const district = DISTRICT_BY_ID.get(id);
    if (!district) continue;
    const state = STATE_BY_ID.get(district.stateId);
    const stateName = state?.name ?? district.stateId;
    const list = byState.get(stateName) ?? [];
    list.push(district.displayName);
    byState.set(stateName, list);
  }
  return {
    entireIndia: false,
    regions,
    states,
    districtGroups: [...byState.entries()].map(([state, districts]) => ({ state, districts })),
  };
}

function uniqueTerms(terms: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function searchTermsForDistrict(district: IndiaDistrict): string[] {
  return uniqueTerms([district.displayName, district.name, ...district.aliases]);
}

/** Major cities used in Tavily/directory queries so state picks hit metros, not the first district alphabetically. */
const STATE_QUERY_CITIES: Record<string, string[]> = {
  TS: ["Hyderabad", "Secunderabad", "Warangal", "Karimnagar"],
  AP: ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati"],
  KA: ["Bengaluru", "Bangalore", "Mysuru", "Mangaluru", "Hubballi"],
  TN: ["Chennai", "Coimbatore", "Madurai", "Hosur"],
  KL: ["Kochi", "Thiruvananthapuram", "Kozhikode"],
  MH: ["Mumbai", "Pune", "Nagpur", "Thane"],
  GJ: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  DL: ["Delhi", "New Delhi"],
  UP: ["Noida", "Lucknow", "Kanpur", "Ghaziabad"],
  RJ: ["Jaipur", "Udaipur", "Jodhpur"],
  WB: ["Kolkata", "Howrah"],
  HR: ["Gurugram", "Gurgaon", "Faridabad"],
  PB: ["Ludhiana", "Amritsar", "Chandigarh"],
  MP: ["Indore", "Bhopal"],
  CG: ["Raipur"],
  OR: ["Bhubaneswar", "Cuttack"],
  BR: ["Patna"],
  JH: ["Ranchi", "Jamshedpur"],
  AS: ["Guwahati"],
  UK: ["Dehradun"],
  GA: ["Goa", "Panaji"],
  CH: ["Chandigarh"],
  PY: ["Puducherry"],
  TG: ["Hyderabad"],
};

function compactTermsForState(state: IndiaState): string[] {
  const terms = [state.name, ...(STATE_QUERY_CITIES[state.id] ?? [])];
  const metroDistricts = [...state.districts]
    .filter((d) => d.aliases.length > 0)
    .sort((a, b) => b.aliases.length - a.aliases.length);
  for (const district of metroDistricts) {
    terms.push(district.displayName, ...district.aliases);
  }
  return uniqueTerms(terms).slice(0, 8);
}

function matchTermsForState(state: IndiaState): string[] {
  return uniqueTerms([
    state.name,
    ...(STATE_QUERY_CITIES[state.id] ?? []),
    ...state.districts.flatMap(searchTermsForDistrict),
  ]);
}

function compactTermsForRegion(region: IndiaRegion): string[] {
  return uniqueTerms([region.name, ...region.states.map((s) => s.name)]).slice(0, 10);
}

function matchTermsForRegion(region: IndiaRegion): string[] {
  return uniqueTerms([region.name, ...region.states.flatMap(matchTermsForState)]);
}

export type ResolvedScoutLabel =
  | { kind: "india" }
  | { kind: "region"; region: IndiaRegion }
  | { kind: "state"; state: IndiaState }
  | { kind: "district"; district: IndiaDistrict; state: IndiaState };

function normalizeLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

const LABEL_INDEX = new Map<string, ResolvedScoutLabel>();

function indexLabel(label: string, value: ResolvedScoutLabel) {
  const key = normalizeLabelKey(label);
  if (!key || LABEL_INDEX.has(key)) return;
  LABEL_INDEX.set(key, value);
}

indexLabel(ENTIRE_INDIA_LABEL, { kind: "india" });
indexLabel("India", { kind: "india" });
for (const region of INDIA_REGIONS) {
  indexLabel(region.name, { kind: "region", region });
}
for (const state of INDIA_STATES) {
  indexLabel(state.name, { kind: "state", state });
}
for (const state of INDIA_STATES) {
  for (const district of state.districts) {
    const value: ResolvedScoutLabel = { kind: "district", district, state };
    indexLabel(district.displayName, value);
    indexLabel(district.name, value);
    for (const alias of district.aliases) indexLabel(alias, value);
  }
}

export function resolveScoutLabel(label: string): ResolvedScoutLabel | null {
  const key = normalizeLabelKey(label);
  if (!key) return null;
  if (isNationwideLabel(label)) return { kind: "india" };
  return LABEL_INDEX.get(key) ?? null;
}

export function isBroadGeoLabel(label: string): boolean {
  const resolved = resolveScoutLabel(label);
  return resolved?.kind === "india" || resolved?.kind === "region" || resolved?.kind === "state";
}

export function compactSearchTermsForLabel(label: string): string[] {
  const resolved = resolveScoutLabel(label);
  if (!resolved) return label.trim() ? [label.trim()] : [];
  if (resolved.kind === "india") return ["India"];
  if (resolved.kind === "region") return compactTermsForRegion(resolved.region);
  if (resolved.kind === "state") return compactTermsForState(resolved.state);
  return searchTermsForDistrict(resolved.district);
}

export function matchTermsForLabel(label: string): string[] {
  const resolved = resolveScoutLabel(label);
  if (!resolved) return label.trim() ? [label.trim()] : [];
  if (resolved.kind === "india") return ["India"];
  if (resolved.kind === "region") return matchTermsForRegion(resolved.region);
  if (resolved.kind === "state") return matchTermsForState(resolved.state);
  return uniqueTerms([
    ...searchTermsForDistrict(resolved.district),
    ...(STATE_QUERY_CITIES[resolved.state.id] ?? []).filter((city) => {
      const n = city.toLowerCase();
      return searchTermsForDistrict(resolved.district).some((t) => t.toLowerCase() === n);
    }),
  ]);
}

export function compactSearchTermsForScoutLabels(labels: string[]): string[] {
  if (labels.some(isNationwideLabel)) return ["India"];
  return uniqueTerms(labels.flatMap(compactSearchTermsForLabel));
}

export function matchTermsForScoutLabels(labels: string[]): string[] {
  if (labels.some(isNationwideLabel)) return ["India"];
  return uniqueTerms(labels.flatMap(matchTermsForLabel));
}

export function locationOptionsFromSelection(raw?: Partial<ScoutGeoSelection> | null): ScoutLocationOption[] {
  const geo = normalizeScoutGeo(raw);
  if (geo.entireIndia) {
    return [
      {
        id: ENTIRE_INDIA_ID,
        label: ENTIRE_INDIA_LABEL,
        group: "India",
        kind: "india",
        searchTerms: ["India"],
      },
    ];
  }

  const options: ScoutLocationOption[] = [];
  for (const id of geo.regionIds) {
    const region = REGION_BY_ID.get(id as IndiaRegionId);
    if (!region) continue;
    options.push({
      id: `region:${region.id}`,
      label: region.name,
      group: "Regions",
      kind: "region",
        searchTerms: compactTermsForRegion(region),
    });
  }
  for (const id of geo.stateIds) {
    const state = STATE_BY_ID.get(id);
    if (!state) continue;
    const region = REGION_BY_ID.get(state.regionId);
    options.push({
      id: `state:${state.id}`,
      label: state.name,
      group: region?.name ?? "States",
      kind: "state",
        searchTerms: compactTermsForState(state),
    });
  }
  for (const id of geo.districtIds) {
    const district = DISTRICT_BY_ID.get(id);
    if (!district) continue;
    const state = STATE_BY_ID.get(district.stateId);
    options.push({
      id: `district:${district.id}`,
      label: district.displayName,
      group: state?.name ?? "Districts",
      kind: "district",
      searchTerms: searchTermsForDistrict(district),
    });
  }
  return options;
}

export function defaultScoutLocationLabels(raw?: Partial<ScoutGeoSelection> | null): string[] {
  const options = locationOptionsFromSelection(raw);
  if (!options.length) return [ENTIRE_INDIA_LABEL];
  if (options.length <= 12) return options.map((o) => o.label);
  return options.slice(0, 8).map((o) => o.label);
}

export function isNationwideLabel(label: string): boolean {
  const n = label.trim().toLowerCase();
  return n === "india" || n === "entire india";
}

export function searchTermsForScoutLabels(labels: string[], _raw?: Partial<ScoutGeoSelection> | null): string[] {
  return compactSearchTermsForScoutLabels(labels);
}

export function statesInSelection(geo: ScoutGeoSelection): IndiaState[] {
  const normalized = sanitizeScoutGeo(geo);
  if (normalized.entireIndia) return [...INDIA_STATES];
  const ids = new Set<string>();
  for (const regionId of normalized.regionIds) {
    for (const state of REGION_BY_ID.get(regionId as IndiaRegionId)?.states ?? []) ids.add(state.id);
  }
  for (const stateId of normalized.stateIds) ids.add(stateId);
  for (const districtId of normalized.districtIds) {
    const district = DISTRICT_BY_ID.get(districtId);
    if (district) ids.add(district.stateId);
  }
  return INDIA_STATES.filter((state) => ids.has(state.id));
}

export function scoutGeoFromStateAndDistrictPicks(
  entireIndia: boolean,
  stateIds: string[],
  districtIdsByState: Record<string, string[]>,
): ScoutGeoSelection {
  if (entireIndia) {
    return { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] };
  }
  const nextStateIds: string[] = [];
  const nextDistrictIds: string[] = [];
  for (const stateId of uniqueTerms(stateIds)) {
    const state = STATE_BY_ID.get(stateId);
    if (!state) continue;
    const picked = districtIdsByState[stateId];
    if (!picked || picked.length >= state.districts.length) {
      nextStateIds.push(stateId);
      continue;
    }
    if (picked.length === 0) continue;
    const allowed = new Set(state.districts.map((d) => d.id));
    for (const districtId of picked) {
      if (allowed.has(districtId)) nextDistrictIds.push(districtId);
    }
  }
  return sanitizeScoutGeo({
    entireIndia: false,
    regionIds: [],
    stateIds: nextStateIds,
    districtIds: nextDistrictIds,
  });
}

export function toggleRegion(geo: ScoutGeoSelection, regionId: string): ScoutGeoSelection {
  if (geo.entireIndia) geo = emptyScoutGeo();
  const selected = geo.regionIds.includes(regionId);
  if (selected) {
    return sanitizeScoutGeo({
      ...geo,
      regionIds: geo.regionIds.filter((id) => id !== regionId),
    });
  }
  const region = REGION_BY_ID.get(regionId as IndiaRegionId);
  const stateIdsInRegion = new Set(region?.states.map((s) => s.id) ?? []);
  const districtIdsInRegion = new Set(region?.states.flatMap((s) => s.districts.map((d) => d.id)) ?? []);
  return sanitizeScoutGeo({
    entireIndia: false,
    regionIds: [...geo.regionIds, regionId],
    stateIds: geo.stateIds.filter((id) => !stateIdsInRegion.has(id)),
    districtIds: geo.districtIds.filter((id) => !districtIdsInRegion.has(id)),
  });
}

export function toggleState(geo: ScoutGeoSelection, stateId: string): ScoutGeoSelection {
  if (geo.entireIndia) geo = emptyScoutGeo();
  const state = STATE_BY_ID.get(stateId);
  if (!state) return geo;
  const regionSelected = geo.regionIds.includes(state.regionId);
  if (regionSelected) {
    const region = REGION_BY_ID.get(state.regionId);
    const otherStateIds = (region?.states ?? []).filter((s) => s.id !== stateId).map((s) => s.id);
    return sanitizeScoutGeo({
      entireIndia: false,
      regionIds: geo.regionIds.filter((id) => id !== state.regionId),
      stateIds: [...geo.stateIds.filter((id) => id !== stateId), ...otherStateIds],
      districtIds: geo.districtIds,
    });
  }
  if (geo.stateIds.includes(stateId)) {
    return sanitizeScoutGeo({
      ...geo,
      stateIds: geo.stateIds.filter((id) => id !== stateId),
    });
  }
  const districtIdsInState = new Set(state.districts.map((d) => d.id));
  return sanitizeScoutGeo({
    entireIndia: false,
    regionIds: geo.regionIds,
    stateIds: [...geo.stateIds, stateId],
    districtIds: geo.districtIds.filter((id) => !districtIdsInState.has(id)),
  });
}

export function toggleDistrict(geo: ScoutGeoSelection, districtId: string): ScoutGeoSelection {
  if (geo.entireIndia) geo = emptyScoutGeo();
  const district = DISTRICT_BY_ID.get(districtId);
  if (!district) return geo;
  const state = STATE_BY_ID.get(district.stateId);
  const regionSelected = geo.regionIds.includes(district.regionId);
  const stateSelected = geo.stateIds.includes(district.stateId);

  if (regionSelected || stateSelected) {
    const sourceDistricts = regionSelected
      ? (REGION_BY_ID.get(district.regionId)?.states.flatMap((s) => s.districts) ?? [])
      : (state?.districts ?? []);
    const keep = sourceDistricts.filter((d) => d.id !== districtId).map((d) => d.id);
    return sanitizeScoutGeo({
      entireIndia: false,
      regionIds: regionSelected ? geo.regionIds.filter((id) => id !== district.regionId) : geo.regionIds,
      stateIds: stateSelected ? geo.stateIds.filter((id) => id !== district.stateId) : geo.stateIds,
      districtIds: [...geo.districtIds.filter((id) => id !== districtId), ...keep],
    });
  }

  if (geo.districtIds.includes(districtId)) {
    return sanitizeScoutGeo({
      ...geo,
      districtIds: geo.districtIds.filter((id) => id !== districtId),
    });
  }
  return sanitizeScoutGeo({
    entireIndia: false,
    regionIds: geo.regionIds,
    stateIds: geo.stateIds,
    districtIds: [...geo.districtIds, districtId],
  });
}

export function setEntireIndia(enabled: boolean): ScoutGeoSelection {
  return enabled ? { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] } : { ...DEFAULT_SCOUT_GEO };
}

export function regionSelectionState(geo: ScoutGeoSelection, regionId: string): "all" | "some" | "none" {
  if (geo.entireIndia || geo.regionIds.includes(regionId)) return "all";
  const region = REGION_BY_ID.get(regionId as IndiaRegionId);
  if (!region) return "none";
  const stateIds = new Set(region.states.map((s) => s.id));
  const districtIds = new Set(region.states.flatMap((s) => s.districts.map((d) => d.id)));
  const any =
    geo.stateIds.some((id) => stateIds.has(id)) || geo.districtIds.some((id) => districtIds.has(id));
  return any ? "some" : "none";
}

export function stateSelectionState(geo: ScoutGeoSelection, stateId: string): "all" | "some" | "none" {
  const state = STATE_BY_ID.get(stateId);
  if (!state) return "none";
  if (geo.entireIndia || geo.regionIds.includes(state.regionId) || geo.stateIds.includes(stateId)) return "all";
  const districtIds = new Set(state.districts.map((d) => d.id));
  const any = geo.districtIds.some((id) => districtIds.has(id));
  return any ? "some" : "none";
}

export function isDistrictSelected(geo: ScoutGeoSelection, districtId: string): boolean {
  const district = DISTRICT_BY_ID.get(districtId);
  if (!district) return false;
  if (geo.entireIndia) return true;
  if (geo.regionIds.includes(district.regionId)) return true;
  if (geo.stateIds.includes(district.stateId)) return true;
  return geo.districtIds.includes(districtId);
}

export function getState(stateId: string): IndiaState | undefined {
  return STATE_BY_ID.get(stateId);
}

export function getDistrict(districtId: string): IndiaDistrict | undefined {
  return DISTRICT_BY_ID.get(districtId);
}

export function getRegion(regionId: string): IndiaRegion | undefined {
  return REGION_BY_ID.get(regionId as IndiaRegionId);
}
