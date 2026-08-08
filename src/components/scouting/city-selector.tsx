"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCOUT_CITIES, SCOUT_CITY_GROUPS, getCityMeta, type ScoutCity } from "@/lib/scouting-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/design-system";

type Props = {
  cities: string[];
  onCitiesChange: (cities: string[]) => void;
  minSelection?: number;
  className?: string;
};

function CityChip({
  city,
  onRemove,
  removeDisabled,
}: {
  city: string;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const meta = getCityMeta(city);

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-yellow py-1 pl-1 pr-1.5 text-[11px] font-bold text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
      title={city}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-white/80 text-[11px] leading-none">
        {meta.icon}
      </span>
      <span className="tracking-wide">{meta.initials}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removeDisabled}
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full hover:bg-brand-ink/10 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Remove ${city}`}
      >
        <X className="size-2.5" />
      </button>
    </span>
  );
}

function CityOptionRow({
  city,
  selected,
  locked,
  onToggle,
}: {
  city: ScoutCity;
  selected: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const meta = getCityMeta(city);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
        selected ? "bg-brand-yellow/35 text-brand-ink" : "text-brand-ink-soft hover:bg-brand-app hover:text-brand-ink",
        locked && "cursor-not-allowed opacity-70",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-base shadow-[var(--shadow-brand-sm)]">
        {meta.icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-brand-app px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-ink">
            {meta.initials}
          </span>
          <span className="truncate text-[12.5px] font-semibold text-brand-ink">{city}</span>
        </span>
        <span className="truncate text-[10.5px] text-brand-ink-faint">{meta.tagline}</span>
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected ? "border-brand-ink bg-brand-yellow text-brand-ink" : "border-brand-border bg-white text-transparent",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

export function CitySelector({ cities, onCitiesChange, minSelection = 1, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return SCOUT_CITY_GROUPS;
    return SCOUT_CITY_GROUPS.map((group) => ({
      ...group,
      cities: group.cities.filter((city) => {
        const meta = getCityMeta(city);
        return (
          city.toLowerCase().includes(normalizedQuery) ||
          meta.initials.toLowerCase().includes(normalizedQuery) ||
          meta.tagline.toLowerCase().includes(normalizedQuery)
        );
      }),
    })).filter((group) => group.cities.length > 0);
  }, [normalizedQuery]);

  function toggleCity(city: ScoutCity) {
    if (cities.includes(city)) {
      if (cities.length <= minSelection) return;
      onCitiesChange(cities.filter((c) => c !== city));
      return;
    }
    onCitiesChange([...cities, city]);
  }

  function removeCity(city: string) {
    if (cities.length <= minSelection) return;
    onCitiesChange(cities.filter((c) => c !== city));
  }

  function selectAllVisible() {
    const visible = filteredGroups.flatMap((g) => g.cities);
    const merged = new Set([...cities, ...visible]);
    onCitiesChange([...merged]);
  }

  function clearAll() {
    if (minSelection > 0 && SCOUT_CITIES.length > 0) {
      onCitiesChange([SCOUT_CITIES[0]]);
      return;
    }
    onCitiesChange([]);
  }

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <MapPin className="mr-1.5 size-4 shrink-0 text-brand-ink-soft" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {cities.length > 0 ? (
          cities.map((city) => (
            <CityChip
              key={city}
              city={city}
              onRemove={() => removeCity(city)}
              removeDisabled={cities.length <= minSelection}
            />
          ))
        ) : (
          <span className="shrink-0 text-[11.5px] font-medium text-brand-ink-faint">No cities</span>
        )}

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border border-brand-border bg-white px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-colors hover:bg-brand-app",
              cities.length === 0 && "border-dashed text-brand-ink-soft",
            )}
          >
            {cities.length === 0 ? (
              <>
                Select cities
                <ChevronDown className="size-3 opacity-60" />
              </>
            ) : (
              <>
                <Plus className="size-3" />
                Add
                <ChevronDown className="size-3 opacity-60" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px] p-0">
            <div className="border-b border-brand-border p-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-app px-2.5 py-1.5">
                <Search className="size-3.5 shrink-0 text-brand-ink-faint" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or code…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
                >
                  Select visible
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2">
              {filteredGroups.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-brand-ink-faint">No cities match your search.</p>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.label} className="mb-3 last:mb-0">
                    <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-brand-ink-faint">
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.cities.map((city) => {
                        const selected = cities.includes(city);
                        const locked = selected && cities.length <= minSelection;
                        return (
                          <CityOptionRow
                            key={city}
                            city={city}
                            selected={selected}
                            locked={locked}
                            onToggle={() => toggleCity(city)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
