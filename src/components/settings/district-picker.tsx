"use client";

import { useMemo, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterAllClear } from "@/design-system";
import type { IndiaDistrict } from "@/lib/geo/india";

type Props = {
  stateName: string;
  districts: IndiaDistrict[];
  selectedIds: string[];
  onToggle: (districtId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

function districtHaystack(district: IndiaDistrict): string {
  return [district.displayName, district.name, ...district.aliases].join(" ").toLowerCase();
}

function districtSubtitle(district: IndiaDistrict): string {
  const extras = [district.name, ...district.aliases].filter(
    (n) => n.toLowerCase() !== district.displayName.toLowerCase(),
  );
  return extras[0] ?? "District";
}

export function DistrictPicker({
  stateName,
  districts,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!q) return districts;
    return districts.filter((d) => districtHaystack(d).includes(q));
  }, [districts, q]);

  const allSelected = districts.length > 0 && selectedIds.length === districts.length;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-brand-stratus-blue" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${stateName} districts`}
          className="w-full rounded-xl border border-brand-border/70 bg-white py-2 pl-8 pr-3 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/50 focus:ring-2 focus:ring-brand-stratus-blue/15"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[12px] text-brand-ink-soft">
          <span className="font-semibold text-brand-ink">{selectedIds.length}</span>
          {" of "}
          {districts.length} selected
        </p>
        <FilterAllClear
          label={`${stateName} districts`}
          allSelected={allSelected}
          noneSelected={selectedIds.length === 0}
          onAll={onSelectAll}
          onClear={onClear}
        />
      </div>

      <div className="mt-2 max-h-[min(48vh,320px)] overflow-y-auto pr-0.5">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-border bg-brand-canvas/60 px-3 py-5 text-center text-[13px] text-brand-ink-soft">
            {`No districts match "${query.trim()}".`}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((district) => {
              const checked = selected.has(district.id);
              return (
                <button
                  key={district.id}
                  type="button"
                  onClick={() => onToggle(district.id)}
                  aria-pressed={checked}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-xl border bg-white px-2.5 py-2 text-left transition-colors",
                    checked
                      ? "border-brand-stratus-blue bg-brand-stratus-blue/10 shadow-[var(--shadow-brand-sm)]"
                      : "border-brand-border/60 hover:border-brand-stratus-blue/40 hover:bg-brand-canvas/50",
                  )}
                >
                  {checked ? (
                    <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand-stratus-blue text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      checked
                        ? "bg-brand-stratus-blue/20 text-brand-stratus-blue"
                        : "bg-brand-canvas text-brand-ink-faint",
                    )}
                  >
                    <MapPin className="size-3.5" />
                  </span>
                  <span className="min-w-0 pr-4">
                    <span className="block truncate text-[13px] font-semibold text-brand-ink">
                      {district.displayName}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-brand-ink-faint">
                      {districtSubtitle(district)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
