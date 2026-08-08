"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INDIA_REGIONS,
  countScoutGeoPicks,
  isDistrictSelected,
  regionSelectionState,
  setEntireIndia,
  stateSelectionState,
  summarizeScoutGeo,
  toggleDistrict,
  toggleRegion,
  toggleState,
  type ScoutGeoSelection,
} from "@/lib/geo/india";

type Props = {
  value: ScoutGeoSelection;
  onChange: (next: ScoutGeoSelection) => void;
};

function TriCheck({ state }: { state: "all" | "some" | "none" }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
        state === "none" && "border-brand-border bg-white",
        state === "some" && "border-brand-stratus-blue/50 bg-brand-stratus-blue/15",
        state === "all" && "border-brand-black bg-brand-black text-white",
      )}
      aria-hidden
    >
      {state === "all" ? <Check className="size-3" strokeWidth={3} /> : null}
      {state === "some" ? <span className="h-0.5 w-2 rounded-full bg-brand-stratus-blue" /> : null}
    </span>
  );
}

export function GeographyPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [openRegion, setOpenRegion] = useState<string | null>("south");
  const [openState, setOpenState] = useState<string | null>("KA");
  const q = query.trim().toLowerCase();

  const filteredRegions = useMemo(() => {
    if (!q) return INDIA_REGIONS;
    return INDIA_REGIONS.map((region) => {
      const regionHit = region.name.toLowerCase().includes(q);
      const states = region.states
        .map((state) => {
          const stateHit = state.name.toLowerCase().includes(q);
          const districts = state.districts.filter(
            (d) =>
              stateHit ||
              regionHit ||
              d.name.toLowerCase().includes(q) ||
              d.displayName.toLowerCase().includes(q) ||
              d.aliases.some((a) => a.toLowerCase().includes(q)),
          );
          if (!regionHit && !stateHit && districts.length === 0) return null;
          return { ...state, districts: regionHit || stateHit ? state.districts : districts };
        })
        .filter(Boolean);
      if (!regionHit && states.length === 0) return null;
      return { ...region, states };
    }).filter(Boolean) as typeof INDIA_REGIONS;
  }, [q]);

  const pickCount = countScoutGeoPicks(value);

  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-brand-ink">
          {value.entireIndia ? "Entire India" : summarizeScoutGeo(value)}
        </p>
        {pickCount > 0 && !value.entireIndia ? (
          <button
            type="button"
            onClick={() => onChange({ entireIndia: false, regionIds: [], stateIds: [], districtIds: [] })}
            className="text-[12px] font-semibold text-brand-stratus-blue"
          >
            Clear
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onChange(setEntireIndia(!value.entireIndia))}
        className={cn(
          "mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
          value.entireIndia
            ? "border-brand-black bg-brand-black text-white"
            : "border-brand-border/70 bg-white/80 hover:bg-black/[0.03]",
        )}
      >
        <MapPin className={cn("size-4 shrink-0", value.entireIndia ? "text-white" : "text-brand-ink-soft")} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">Entire India</span>
          <span className={cn("block text-[11.5px]", value.entireIndia ? "text-white/75" : "text-brand-ink-faint")}>
            Scout nationwide. Region, state, and district filters are skipped.
          </span>
        </span>
        <TriCheck state={value.entireIndia ? "all" : "none"} />
      </button>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-border bg-brand-app px-3 py-2">
        <Search className="size-3.5 shrink-0 text-brand-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search region, state, or district…"
          disabled={value.entireIndia}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-brand-ink outline-none placeholder:text-brand-ink-faint disabled:opacity-50"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="text-brand-ink-faint hover:text-brand-ink">
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <div className={cn("max-h-[420px] overflow-y-auto pr-0.5", value.entireIndia && "pointer-events-none opacity-40")}>
        {filteredRegions.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-brand-ink-faint">No locations match.</p>
        ) : (
          filteredRegions.map((region) => {
            const regionState = regionSelectionState(value, region.id);
            const regionOpen = openRegion === region.id || Boolean(q);
            return (
              <div key={region.id} className="mb-1.5 rounded-xl border border-brand-border/50 bg-white/70">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onChange(toggleRegion(value, region.id))}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                  >
                    <TriCheck state={regionState} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-brand-ink">{region.name}</span>
                      <span className="block text-[11px] text-brand-ink-faint">{region.states.length} states / UTs</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={regionOpen ? "Collapse region" : "Expand region"}
                    onClick={() => setOpenRegion(regionOpen && !q ? null : region.id)}
                    className="px-3 py-2.5 text-brand-ink-faint hover:text-brand-ink"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", regionOpen && "rotate-180")} />
                  </button>
                </div>

                {regionOpen ? (
                  <div className="border-t border-brand-border/50 px-2 py-1.5">
                    {region.states.map((state) => {
                      const stateState = stateSelectionState(value, state.id);
                      const stateOpen = openState === state.id || Boolean(q);
                      return (
                        <div key={state.id} className="mb-1 rounded-lg">
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => onChange(toggleState(value, state.id))}
                              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            >
                              <TriCheck state={stateState} />
                              <span className="text-[12.5px] font-medium text-brand-ink">{state.name}</span>
                              <span className="text-[11px] text-brand-ink-faint">{state.districts.length}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={stateOpen ? "Collapse state" : "Expand districts"}
                              onClick={() => setOpenState(stateOpen && !q ? null : state.id)}
                              className="px-2 py-1.5 text-brand-ink-faint hover:text-brand-ink"
                            >
                              <ChevronDown className={cn("size-3.5 transition-transform", stateOpen && "rotate-180")} />
                            </button>
                          </div>
                          {stateOpen ? (
                            <div className="mb-1 ml-6 flex flex-wrap gap-1.5 pb-1.5 pr-1">
                              {state.districts.map((district) => {
                                const selected = isDistrictSelected(value, district.id);
                                return (
                                  <button
                                    key={district.id}
                                    type="button"
                                    onClick={() => onChange(toggleDistrict(value, district.id))}
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                                      selected
                                        ? "bg-brand-yellow text-brand-ink"
                                        : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                                    )}
                                  >
                                    {district.displayName}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
