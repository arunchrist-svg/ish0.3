"use client";

import { useMemo, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-stratus-blue" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${stateName} districts`}
          className="w-full rounded-2xl border border-brand-border/70 bg-white py-2.5 pl-10 pr-3 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/50 focus:ring-2 focus:ring-brand-stratus-blue/15"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[12px] text-brand-ink-soft">
          <span className="font-semibold text-brand-ink">{selectedIds.length}</span>
          {" of "}
          {districts.length} selected
        </p>
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="text-[12px] font-semibold text-brand-stratus-blue"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="mt-3 max-h-[min(52vh,380px)] overflow-y-auto pr-0.5">
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-border bg-brand-canvas/60 px-4 py-8 text-center text-[13px] text-brand-ink-soft">
            {`No districts match "${query.trim()}".`}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((district) => {
              const checked = selected.has(district.id);
              return (
                <button
                  key={district.id}
                  type="button"
                  onClick={() => onToggle(district.id)}
                  aria-pressed={checked}
                  className={cn(
                    "relative flex items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left transition-colors",
                    checked
                      ? "border-brand-stratus-blue bg-brand-stratus-blue/10 shadow-[var(--shadow-brand-sm)]"
                      : "border-brand-border/60 hover:border-brand-stratus-blue/40 hover:bg-brand-canvas/50",
                  )}
                >
                  {checked ? (
                    <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-brand-stratus-blue text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      checked
                        ? "bg-brand-stratus-blue/20 text-brand-stratus-blue"
                        : "bg-brand-canvas text-brand-ink-faint",
                    )}
                  >
                    <MapPin className="size-4" />
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
