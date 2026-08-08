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

function searchTermsForDistrict(district: IndiaDistrict): string[] {
  return [...new Set([district.displayName, district.name, ...district.aliases])];
}

function searchTermsForState(state: IndiaState): string[] {
  const terms = new Set<string>([state.name]);
  for (const district of state.districts) {
    for (const term of searchTermsForDistrict(district)) terms.add(term);
  }
  return [...terms];
}

function searchTermsForRegion(region: IndiaRegion): string[] {
  const terms = new Set<string>([region.name]);
  for (const state of region.states) {
    terms.add(state.name);
    for (const district of state.districts.slice(0, 8)) {
      terms.add(district.displayName);
    }
  }
  return [...terms];
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
      searchTerms: searchTermsForRegion(region),
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
      searchTerms: searchTermsForState(state),
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

export function searchTermsForScoutLabels(labels: string[], raw?: Partial<ScoutGeoSelection> | null): string[] {
  if (labels.some(isNationwideLabel)) return ["India"];
  const options = locationOptionsFromSelection(raw);
  const byLabel = new Map(options.map((o) => [o.label.toLowerCase(), o]));
  const terms = new Set<string>();
  for (const label of labels) {
    const option = byLabel.get(label.trim().toLowerCase());
    if (option) {
      for (const term of option.searchTerms) terms.add(term);
    } else if (label.trim()) {
      terms.add(label.trim());
    }
  }
  return [...terms];
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
