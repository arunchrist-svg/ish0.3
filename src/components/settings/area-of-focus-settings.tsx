"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Plus, X } from "lucide-react";
import { SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { cn } from "@/lib/utils";
import {
  AREA_OF_FOCUS_RADIUS_KM,
  DEFAULT_AREA_OF_FOCUS_RADIUS_KM,
  MAX_SCOUT_AREAS_OF_FOCUS,
  isNearbyAreaSelected,
  removeScoutAreaOfFocus,
  scoutAreaOfFocusKey,
  setAllNearbyAreasSelected,
  upsertScoutAreaOfFocus,
  type ScoutAreaOfFocus,
} from "@/lib/geo/area-of-focus";
import { locationOptionsFromSelection, type ScoutGeoSelection } from "@/lib/geo/india";

type Props = {
  scoutGeo: ScoutGeoSelection;
  value: ScoutAreaOfFocus[];
  onChange: (next: ScoutAreaOfFocus[]) => void;
};

type Suggestion = { name: string };

function cityOptions(scoutGeo: ScoutGeoSelection): string[] {
  const options = locationOptionsFromSelection(scoutGeo);
  const labels = options.filter((o) => o.kind !== "india").map((o) => o.label);
  if (labels.length) return labels;
  return ["Bengaluru", "Hosur", "Mysuru", "Chennai"];
}

export function AreaOfFocusSettings({ scoutGeo, value, onChange }: Props) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const cities = useMemo(() => cityOptions(scoutGeo), [scoutGeo]);
  const [city, setCity] = useState(cities[0] || "Bengaluru");
  const [query, setQuery] = useState("");
  const [radiusKm, setRadiusKm] = useState(String(DEFAULT_AREA_OF_FOCUS_RADIUS_KM));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<ScoutAreaOfFocus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cities.includes(city) && cities[0]) setCity(cities[0]);
  }, [cities, city]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || !city) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({ city, q: query });
      void fetch(`/api/scout/areas/resolve?${params.toString()}`, { method: "GET" })
        .then((res) => res.json())
        .then((data: { suggestions?: Suggestion[] }) => {
          setSuggestions(data.suggestions ?? []);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [city, query, open]);

  async function resolvePreview(areaName: string, nextRadius = radiusKm) {
    const name = areaName.trim();
    if (!city || !name) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch("/api/scout/areas/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, query: name, radiusKm: Number(nextRadius) }),
      });
      const data = (await res.json()) as { focus?: ScoutAreaOfFocus; error?: string };
      if (!res.ok || !data.focus) {
        setError(data.error ?? "Could not resolve that area");
        return;
      }
      setPreview(data.focus);
      setQuery(data.focus.areaName);
    } catch {
      setError("Could not resolve that area");
    } finally {
      setResolving(false);
    }
  }

  function addPreview() {
    if (!preview) return;
    if (value.length >= MAX_SCOUT_AREAS_OF_FOCUS && !value.some((row) => scoutAreaOfFocusKey(row) === scoutAreaOfFocusKey(preview))) {
      setError(`You can save up to ${MAX_SCOUT_AREAS_OF_FOCUS} focus areas`);
      return;
    }
    onChange(upsertScoutAreaOfFocus(value, preview));
    setPreview(null);
    setQuery("");
    setSuggestions([]);
    setError(null);
  }

  function patchSaved(next: ScoutAreaOfFocus) {
    onChange(upsertScoutAreaOfFocus(value, next));
  }

  function removeSaved(focus: ScoutAreaOfFocus) {
    onChange(removeScoutAreaOfFocus(value, scoutAreaOfFocusKey(focus)));
  }

  const atLimit = value.length >= MAX_SCOUT_AREAS_OF_FOCUS;

  return (
    <div>
      {value.length > 0 ? (
        <div className="px-4 py-3">
          <p className="mb-2 text-[12px] font-semibold text-brand-ink">Saved in Scout</p>
          <div className="flex flex-col gap-3">
            {value.map((focus) => (
              <div
                key={scoutAreaOfFocusKey(focus)}
                className="rounded-2xl border border-brand-stratus-blue/15 bg-brand-canvas/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-brand-ink">
                    {focus.areaName} + {focus.radiusKm} km
                    <span className="ml-1 font-medium text-brand-ink-faint">({focus.cityLabel})</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => removeSaved(focus)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-brand-stratus-blue"
                  >
                    <X className="size-3" />
                    Remove
                  </button>
                </div>
                <div className="mb-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => patchSaved(setAllNearbyAreasSelected(focus, true))}
                    disabled={focus.nearbyAreas.every(isNearbyAreaSelected)}
                    className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => patchSaved(setAllNearbyAreasSelected(focus, false))}
                    disabled={focus.nearbyAreas.every((area) => !isNearbyAreaSelected(area))}
                    className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {focus.nearbyAreas.map((area) => {
                    const selected = isNearbyAreaSelected(area);
                    return (
                      <button
                        key={area.name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          patchSaved({
                            ...focus,
                            nearbyAreas: focus.nearbyAreas.map((row) =>
                              row.name === area.name ? { ...row, selected: !isNearbyAreaSelected(row) } : row,
                            ),
                          })
                        }
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          selected
                            ? "bg-brand-yellow text-brand-ink"
                            : "bg-white text-brand-ink-soft",
                        )}
                      >
                        {area.name}
                        {area.distanceKm > 0 ? ` · ${area.distanceKm} km` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SettingsGroupDivider />
      <SettingsRow className="justify-between py-2.5">
        <span className="text-[13px] font-semibold text-brand-ink">Add city</span>
        <select
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setPreview(null);
            setQuery("");
            setSuggestions([]);
            setError(null);
          }}
          className="max-w-[55%] rounded-full border border-brand-stratus-blue/25 bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-ink"
        >
          {cities.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsGroupDivider />
      <SettingsRow className="items-start py-2.5">
        <span className="pt-1.5 text-[13px] font-semibold text-brand-ink">Area</span>
        <div ref={containerRef} className="relative min-w-0 flex-1">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setOpen(false);
                void resolvePreview(query);
              }
            }}
            placeholder={city === "Hassan" ? "BM Road, Vidyanagar…" : "Kasturi Nagar"}
            disabled={atLimit}
            className="w-full rounded-full border border-brand-stratus-blue/25 bg-white px-3 py-1.5 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint disabled:opacity-60"
            aria-autocomplete="list"
            aria-controls={listboxId}
          />
          {open && suggestions.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-brand-border bg-white py-1 shadow-[var(--shadow-brand)]"
            >
              {suggestions.map((row) => (
                <li key={row.name}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-brand-canvas"
                    onClick={() => {
                      setQuery(row.name);
                      setOpen(false);
                      void resolvePreview(row.name);
                    }}
                  >
                    <MapPin className="size-3.5 text-brand-stratus-blue" />
                    {row.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SettingsRow>
      <SettingsGroupDivider />
      <SettingsRow className="justify-between py-2.5">
        <span className="text-[13px] font-semibold text-brand-ink">Nearby km</span>
        <SettingsSegmented
          value={radiusKm}
          onChange={(next) => {
            setRadiusKm(next);
            if (query.trim()) void resolvePreview(query, next);
          }}
          options={AREA_OF_FOCUS_RADIUS_KM.map((km) => ({ value: String(km), label: `${km}` }))}
        />
      </SettingsRow>
      {(preview || resolving || error) && (
        <>
          <SettingsGroupDivider />
          <div className="px-4 py-3">
            {resolving ? (
              <p className="flex items-center gap-2 text-[12px] text-brand-ink-soft">
                <Loader2 className="size-3.5 animate-spin" /> Finding nearby areas…
              </p>
            ) : null}
            {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
            {preview ? (
              <div>
                <p className="mb-2 text-[12px] font-semibold text-brand-ink">
                  {preview.areaName} + {preview.radiusKm} km
                </p>
                <div className="mb-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPreview(setAllNearbyAreasSelected(preview, true))}
                    disabled={preview.nearbyAreas.every(isNearbyAreaSelected)}
                    className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(setAllNearbyAreasSelected(preview, false))}
                    disabled={preview.nearbyAreas.every((area) => !isNearbyAreaSelected(area))}
                    className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {preview.nearbyAreas.map((area) => {
                    const selected = isNearbyAreaSelected(area);
                    return (
                      <button
                        key={area.name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setPreview({
                            ...preview,
                            nearbyAreas: preview.nearbyAreas.map((row) =>
                              row.name === area.name ? { ...row, selected: !isNearbyAreaSelected(row) } : row,
                            ),
                          })
                        }
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          selected
                            ? "bg-brand-yellow text-brand-ink"
                            : "bg-brand-canvas text-brand-ink-soft",
                        )}
                      >
                        {area.name}
                        {area.distanceKm > 0 ? ` · ${area.distanceKm} km` : ""}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addPreview}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-black py-2 text-[12px] font-semibold text-white"
                >
                  <Plus className="size-3.5" />
                  Add to Scout
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
      {!preview && !resolving ? (
        <>
          <SettingsGroupDivider />
          <p className="px-4 py-2.5 text-[12px] leading-relaxed text-brand-ink-faint">
            Add neighborhoods one by one. Each saved cluster appears in Scout under Focus Area.
            {atLimit ? ` Limit is ${MAX_SCOUT_AREAS_OF_FOCUS} areas.` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
