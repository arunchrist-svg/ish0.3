"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/design-system";
import {
  getState,
  sanitizeScoutGeo,
  scoutGeoFromStateAndDistrictPicks,
  scoutGeoHasSelection,
  statesInSelection,
  summarizeScoutGeo,
  type ScoutGeoSelection,
} from "@/lib/geo/india";
import { IndiaStateMap } from "@/components/settings/india-state-map";

type Props = {
  value: ScoutGeoSelection;
  onComplete: (next: ScoutGeoSelection) => void;
  ctaLabel?: string;
};

type Phase = "map" | "districts";

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
    <div className="px-4 py-3">
      <div className="mb-3">
        <p className="text-[13px] font-semibold text-brand-ink">Area of Interest</p>
        <p className="mt-0.5 text-[12px] text-brand-ink-soft">
          {phase === "map"
            ? "Pick Entire India or one or more states on the map."
            : "Uncheck districts you do not want Scout to search."}
        </p>
      </div>

      {phase === "map" ? (
        <>
          <button
            type="button"
            onClick={selectEntireIndia}
            className={cn(
              "mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
              entireIndia
                ? "border-brand-black bg-brand-black text-white"
                : "border-brand-border/70 bg-white/80 hover:bg-black/[0.03]",
            )}
          >
            <MapPin className={cn("size-4 shrink-0", entireIndia ? "text-white" : "text-brand-ink-soft")} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">Entire India</span>
              <span className={cn("block text-[11.5px]", entireIndia ? "text-white/75" : "text-brand-ink-faint")}>
                Nationwide scout. District filters are skipped.
              </span>
            </span>
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
                entireIndia ? "border-white bg-white text-brand-black" : "border-brand-border bg-white",
              )}
            >
              {entireIndia ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          </button>

          <IndiaStateMap selectedIds={entireIndia ? [] : stateIds} disabled={entireIndia} onToggle={toggleState} />

          <p className="mt-3 text-[12px] text-brand-ink-soft">
            {entireIndia
              ? "Entire India selected."
              : stateIds.length === 0
                ? "Select at least one state to continue."
                : summarizeScoutGeo(preview)}
          </p>

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
            <label className="mb-3 block">
              <span className="mb-1 block text-[12px] font-semibold text-brand-ink">State</span>
              <select
                value={activeDistrictState?.id ?? ""}
                onChange={(e) => setDistrictStateId(e.target.value)}
                className="w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-[13px] outline-none"
              >
                {selectedStates.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mb-2 text-[13px] font-semibold text-brand-ink">
              Districts in {activeDistrictState?.name ?? "selected state"}
            </p>
          )}

          {activeDistrictState ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-brand-border bg-white p-2">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {activeDistrictState.districts.map((district) => {
                  const checked = checkedDistricts(activeDistrictState.id).includes(district.id);
                  return (
                    <label
                      key={district.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-black/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDistrict(activeDistrictState.id, district.id)}
                        className="size-3.5 accent-brand-black"
                      />
                      <span>{district.displayName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
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
