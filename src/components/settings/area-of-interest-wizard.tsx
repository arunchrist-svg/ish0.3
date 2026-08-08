"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/design-system";
import {
  INDIA_REGIONS,
  INDIA_STATES,
  getState,
  sanitizeScoutGeo,
  scoutGeoFromStateAndDistrictPicks,
  scoutGeoHasSelection,
  statesInSelection,
  summarizeScoutGeo,
  type IndiaRegionId,
  type ScoutGeoSelection,
} from "@/lib/geo/india";
import { IndiaStateMap } from "@/components/settings/india-state-map";
import { DistrictPicker } from "@/components/settings/district-picker";

type Props = {
  value: ScoutGeoSelection;
  onComplete: (next: ScoutGeoSelection) => void;
  ctaLabel?: string;
  className?: string;
  showHeading?: boolean;
};

type Phase = "map" | "districts";

const MAP_REGION_PRESETS: { id: IndiaRegionId; name: string }[] = [
  { id: "north", name: "North India" },
  { id: "south", name: "South India" },
  { id: "west", name: "West India" },
  { id: "central", name: "Central India" },
  { id: "east", name: "East India" },
];

function regionStateIds(regionId: IndiaRegionId): string[] {
  return INDIA_REGIONS.find((region) => region.id === regionId)?.states.map((s) => s.id) ?? [];
}

function orderedStateIds(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return INDIA_STATES.filter((state) => set.has(state.id)).map((state) => state.id);
}

function initialFromValue(value: ScoutGeoSelection) {
  const geo = sanitizeScoutGeo(value);
  if (geo.entireIndia) {
    return { entireIndia: true, stateIds: [] as string[], districtIdsByState: {} as Record<string, string[]> };
  }
  const states = statesInSelection(geo);
  const districtIdsByState: Record<string, string[]> = {};
  for (const state of states) {
    const regionOrState =
      geo.regionIds.includes(state.regionId) || geo.stateIds.includes(state.id);
    if (regionOrState) continue;
    const picked = state.districts.filter((d) => geo.districtIds.includes(d.id)).map((d) => d.id);
    if (picked.length) districtIdsByState[state.id] = picked;
  }
  return {
    entireIndia: false,
    stateIds: states.map((s) => s.id),
    districtIdsByState,
  };
}

export function AreaOfInterestWizard({
  value,
  onComplete,
  ctaLabel = "Choose Regions & Complete Location",
  className,
  showHeading = true,
}: Props) {
  const seed = useMemo(() => initialFromValue(value), [value]);
  const [phase, setPhase] = useState<Phase>("map");
  const [entireIndia, setEntireIndia] = useState(seed.entireIndia);
  const [stateIds, setStateIds] = useState<string[]>(seed.stateIds);
  const [districtIdsByState, setDistrictIdsByState] = useState<Record<string, string[]>>(seed.districtIdsByState);
  const [districtStateId, setDistrictStateId] = useState<string>(seed.stateIds[0] ?? "");

  const selectedStates = stateIds
    .map((id) => getState(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  function toggleState(stateId: string) {
    setEntireIndia(false);
    setStateIds((prev) => {
      const next = prev.includes(stateId) ? prev.filter((id) => id !== stateId) : [...prev, stateId];
      setDistrictStateId((current) => {
        if (next.includes(current)) return current;
        return next[0] ?? "";
      });
      return next;
    });
    setDistrictIdsByState((prev) => {
      if (!(stateId in prev)) return prev;
      const next = { ...prev };
      delete next[stateId];
      return next;
    });
  }

  function selectEntireIndia() {
    setEntireIndia(true);
    setStateIds([]);
    setDistrictIdsByState({});
    setDistrictStateId("");
    setPhase("map");
  }

  function clearSelection() {
    setEntireIndia(false);
    setStateIds([]);
    setDistrictIdsByState({});
    setDistrictStateId("");
    setPhase("map");
  }

  function regionIsSelected(regionId: IndiaRegionId): boolean {
    if (entireIndia) return false;
    const ids = regionStateIds(regionId);
    return ids.length > 0 && ids.every((id) => stateIds.includes(id));
  }

  function toggleRegionPreset(regionId: IndiaRegionId) {
    const ids = regionStateIds(regionId);
    if (!ids.length) return;
    const allOn = ids.every((id) => stateIds.includes(id));
    setEntireIndia(false);
    setStateIds((prev) => {
      const next = allOn
        ? orderedStateIds(prev.filter((id) => !ids.includes(id)))
        : orderedStateIds([...prev, ...ids]);
      setDistrictStateId((current) => (next.includes(current) ? current : next[0] ?? ""));
      return next;
    });
    setDistrictIdsByState((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  function handleNext() {
    if (entireIndia) {
      onComplete(scoutGeoFromStateAndDistrictPicks(true, [], {}));
      return;
    }
    if (stateIds.length === 0) return;
    setDistrictStateId((current) => (stateIds.includes(current) ? current : stateIds[0] ?? ""));
    setPhase("districts");
  }

  function checkedDistricts(stateId: string): string[] {
    const state = getState(stateId);
    if (!state) return [];
    return districtIdsByState[stateId] ?? state.districts.map((d) => d.id);
  }

  function toggleDistrict(stateId: string, districtId: string) {
    const state = getState(stateId);
    if (!state) return;
    const current = new Set(checkedDistricts(stateId));
    if (current.has(districtId)) current.delete(districtId);
    else current.add(districtId);
    const allIds = state.districts.map((d) => d.id);
    if (current.size === 0) {
      setDistrictIdsByState((prev) => ({ ...prev, [stateId]: [] }));
      return;
    }
    if (current.size === allIds.length) {
      setDistrictIdsByState((prev) => {
        const next = { ...prev };
        delete next[stateId];
        return next;
      });
      return;
    }
    setDistrictIdsByState((prev) => ({ ...prev, [stateId]: allIds.filter((id) => current.has(id)) }));
  }

  function handleComplete() {
    const next = scoutGeoFromStateAndDistrictPicks(entireIndia, stateIds, districtIdsByState);
    onComplete(next);
  }

  const preview = scoutGeoFromStateAndDistrictPicks(entireIndia, stateIds, districtIdsByState);
  const activeDistrictState = getState(districtStateId) ?? selectedStates[0];
  const showStateDropdown = selectedStates.length >= 2;

  return (
    <div className={cn("px-4 py-3", className)}>
      {showHeading ? (
        <div className="mb-3">
          <p className="text-[13px] font-semibold text-brand-ink">Area of Interest</p>
          <p className="mt-0.5 text-[12px] text-brand-ink-soft">
            {phase === "map"
              ? "Pick a region preset or tap states on the map."
              : "Choose districts Scout should search."}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-[12px] text-brand-ink-soft">
          {phase === "map"
            ? "Pick a region preset or tap states on the map."
            : "Choose districts Scout should search."}
        </p>
      )}

      {phase === "map" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={selectEntireIndia}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                entireIndia
                  ? "border-brand-black bg-brand-black text-white"
                  : "border-brand-border/70 bg-white text-brand-ink hover:border-brand-black/40",
              )}
            >
              <MapPin className="size-3.5" />
              Entire India
              {entireIndia ? <Check className="size-3" strokeWidth={3} /> : null}
            </button>
            {MAP_REGION_PRESETS.map((region) => {
              const active = regionIsSelected(region.id);
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => toggleRegionPreset(region.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    active
                      ? "border-brand-stratus-blue bg-brand-stratus-blue/15 text-brand-ink"
                      : "border-brand-border/70 bg-white text-brand-ink hover:border-brand-stratus-blue/50",
                  )}
                >
                  {region.name}
                  {active ? <Check className="size-3 text-brand-stratus-blue" strokeWidth={3} /> : null}
                </button>
              );
            })}
          </div>

          <IndiaStateMap selectedIds={entireIndia ? [] : stateIds} disabled={entireIndia} onToggle={toggleState} />

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[12px] text-brand-ink-soft">
              {entireIndia
                ? "Entire India selected. District filters are skipped."
                : stateIds.length === 0
                  ? "Select a region or tap states on the map."
                  : summarizeScoutGeo(preview)}
            </p>
            <button
              type="button"
              onClick={clearSelection}
              disabled={!entireIndia && stateIds.length === 0}
              className="shrink-0 text-[12px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
            >
              Clear selection
            </button>
          </div>

          <Button
            type="button"
            className="mt-3 w-full"
            disabled={!entireIndia && stateIds.length === 0}
            onClick={handleNext}
          >
            Next
          </Button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setPhase("map")}
            className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-stratus-blue"
          >
            <ChevronLeft className="size-3.5" />
            Back to map
          </button>

          {showStateDropdown ? (
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {selectedStates.map((state) => {
                const active = state.id === activeDistrictState?.id;
                return (
                  <button
                    key={state.id}
                    type="button"
                    onClick={() => setDistrictStateId(state.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-brand-black text-white"
                        : "bg-brand-canvas text-brand-ink-soft hover:bg-black/[0.05]",
                    )}
                  >
                    {state.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mb-3 text-[15px] font-semibold text-brand-ink">
              Districts in {activeDistrictState?.name ?? "selected state"}
            </p>
          )}

          {activeDistrictState ? (
            <DistrictPicker
              key={activeDistrictState.id}
              stateName={activeDistrictState.name}
              districts={[...activeDistrictState.districts]}
              selectedIds={checkedDistricts(activeDistrictState.id)}
              onToggle={(districtId) => toggleDistrict(activeDistrictState.id, districtId)}
              onSelectAll={() => {
                setDistrictIdsByState((prev) => {
                  const next = { ...prev };
                  delete next[activeDistrictState.id];
                  return next;
                });
              }}
              onClear={() => {
                setDistrictIdsByState((prev) => ({ ...prev, [activeDistrictState.id]: [] }));
              }}
            />
          ) : null}

          <Button
            type="button"
            className="mt-3 w-full"
            disabled={!scoutGeoHasSelection(preview)}
            onClick={handleComplete}
          >
            {ctaLabel}
          </Button>
        </>
      )}
    </div>
  );
}
