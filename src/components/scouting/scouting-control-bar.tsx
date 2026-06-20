"use client";

import { ArrowRight, X, MapPin, Plus, Compass, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCOUT_CITIES, SCOUT_INDUSTRIES } from "@/lib/scouting-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/design-system";
import type { DataMode } from "@/lib/enrichment/types";

type Props = {
  view: "companies" | "people";
  cities: string[];
  industries: string[];
  dataMode: DataMode;
  selectedCount: number;
  saving?: boolean;
  onCityToggle: (city: string) => void;
  onIndustryToggle: (industry: string) => void;
  onDataModeChange: (mode: DataMode) => void;
  onFetchLeads: () => void;
  onAddLeads: () => void;
  onScoutMore: () => void;
};

const DATA_MODES: { value: DataMode; label: string; title: string }[] = [
  { value: "free", label: "Free", title: "Tavily + AI extraction (dev mode)" },
  { value: "paid", label: "Paid", title: "Apollo + Hunter (requires API keys)" },
  { value: "auto", label: "Auto", title: "Paid if keys set, else Free" },
];

export function ScoutingControlBar({
  view, cities, industries, dataMode, selectedCount, saving,
  onCityToggle, onIndustryToggle, onDataModeChange,
  onFetchLeads, onAddLeads, onScoutMore,
}: Props) {
  const availableCities = SCOUT_CITIES.filter((c) => !cities.includes(c));

  return (
    <div className="flex items-center gap-3 border-b border-ish-border bg-white px-5 py-3">
      {/* Multi-city selector */}
      <div className="flex items-center gap-1.5">
        <MapPin className="size-4 text-ish-ink-soft" />
        <div className="flex flex-wrap items-center gap-1.5">
          {cities.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full bg-ish-yellow px-2.5 py-1 text-[11.5px] font-semibold text-ish-ink shadow-[var(--shadow-ish-yellow-sm)]"
            >
              {c}
              <button
                type="button"
                onClick={() => onCityToggle(c)}
                className="flex size-3.5 items-center justify-center rounded-full hover:bg-ish-ink/10"
                aria-label={`Remove ${c}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {availableCities.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-full border border-dashed border-ish-border bg-white px-2.5 py-1 text-[11.5px] font-medium text-ish-ink-soft transition-colors hover:border-ish-ink-soft hover:text-ish-ink">
                <Plus className="size-3" />
                Add City
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                {availableCities.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => onCityToggle(c)}>
                    {c}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="h-5 w-px bg-ish-border" />

      {/* Industry chips */}
      <div className="flex flex-1 flex-wrap gap-1.5">
        {SCOUT_INDUSTRIES.map((ind) => {
          const active = industries.includes(ind);
          return (
            <button
              key={ind}
              type="button"
              onClick={() => onIndustryToggle(ind)}
              className={cn(
                "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all duration-100",
                active
                  ? "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)]"
                  : "bg-ish-app text-ish-ink-soft hover:bg-ish-border",
              )}
            >
              {ind}
            </button>
          );
        })}
      </div>

      {/* Data mode toggle */}
      <div className="flex items-center gap-1 rounded-xl border border-ish-border bg-ish-app p-1">
        <Database className="ml-1.5 size-3.5 text-ish-ink-soft" />
        {DATA_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.title}
            onClick={() => onDataModeChange(m.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
              dataMode === m.value
                ? "bg-white text-ish-ink shadow-[var(--shadow-ish-sm)]"
                : "text-ish-ink-soft hover:text-ish-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Scout More button */}
      {view === "people" && (
        <button
          type="button"
          onClick={onScoutMore}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ish-border bg-white px-3 py-2 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-app"
        >
          <Compass className="size-3.5" />
          Scout More
        </button>
      )}

      {/* CTA button */}
      {view === "companies" ? (
        <button
          type="button"
          onClick={onFetchLeads}
          disabled={selectedCount === 0}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all duration-150",
            selectedCount > 0
              ? "bg-ish-black shadow-[var(--shadow-ish)] hover:opacity-90"
              : "cursor-not-allowed bg-ish-ink-faint opacity-50",
          )}
        >
          Fetch Leads from {selectedCount > 0 ? selectedCount : "—"}{" "}
          {selectedCount === 1 ? "Company" : "Companies"}
          <ArrowRight className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onAddLeads}
          disabled={selectedCount === 0 || saving}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all duration-150",
            selectedCount > 0 && !saving
              ? "bg-ish-green shadow-[var(--shadow-ish)] hover:opacity-90"
              : "cursor-not-allowed bg-ish-ink-faint opacity-50",
          )}
        >
          {saving ? "Saving…" : `Add ${selectedCount > 0 ? selectedCount : "—"} as Leads`}
          <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}
