"use client";

import { ArrowRight, Compass, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CitySelector } from "./city-selector";
import { IndustrySelector } from "./industry-selector";

type Props = {
  view: "companies" | "people";
  cities: string[];
  industries: string[];
  selectedCount: number;
  settingsLoaded?: boolean;
  loadingCompanies?: boolean;
  loadingMore?: boolean;
  saving?: boolean;
  onCitiesChange: (cities: string[]) => void;
  onIndustryToggle: (industry: string) => void;
  onFetchNewCompanies: () => void;
  onFetchLeads: () => void;
  onAddLeads: () => void;
  onScoutMore: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
};

/** Scouting tools bar — filters and actions in one compact row. */
export function ScoutingControlBar({
  view,
  cities,
  industries,
  selectedCount,
  settingsLoaded = true,
  loadingCompanies,
  loadingMore,
  saving,
  onCitiesChange,
  onIndustryToggle,
  onFetchNewCompanies,
  onFetchLeads,
  onAddLeads,
  onScoutMore,
  onLoadMore,
  onRefresh,
}: Props) {
  const canFetchCompanies = settingsLoaded && cities.length > 0 && !loadingCompanies;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ish-border bg-white px-5 py-2.5">
      <CitySelector
        cities={cities}
        onCitiesChange={onCitiesChange}
        className="max-w-[min(100%,280px)] shrink-0"
      />

      <div className="hidden h-5 w-px shrink-0 bg-ish-border sm:block" aria-hidden />

      <IndustrySelector
        industries={industries}
        onIndustriesChange={(next) => {
          const added = next.filter((i) => !industries.includes(i));
          const removed = industries.filter((i) => !next.includes(i));
          added.forEach(onIndustryToggle);
          removed.forEach(onIndustryToggle);
        }}
        className="min-w-[160px] flex-1"
      />

      {view === "companies" ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={onFetchNewCompanies}
            disabled={!canFetchCompanies}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-all duration-150",
              canFetchCompanies
                ? "bg-ish-black shadow-[var(--shadow-ish)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-ink-faint opacity-50",
            )}
          >
            <Search className="size-3.5" />
            {loadingCompanies ? "Fetching…" : "Fetch New Companies"}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loadingCompanies || cities.length === 0}
            title="Refresh discovery with current filters"
            className="flex shrink-0 items-center gap-1 rounded-xl border border-ish-border bg-white px-3 py-1.5 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-app disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>

          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore || cities.length === 0}
            className="flex shrink-0 items-center rounded-xl border border-ish-border bg-white px-3 py-1.5 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-app disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load More"}
          </button>

          <button
            type="button"
            onClick={onFetchLeads}
            disabled={selectedCount === 0}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-all duration-150 sm:ml-1",
              selectedCount > 0
                ? "bg-ish-green shadow-[var(--shadow-ish)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-ink-faint opacity-50",
            )}
          >
            Fetch Leads from {selectedCount > 0 ? selectedCount : "—"}{" "}
            {selectedCount === 1 ? "Company" : "Companies"}
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex w-full shrink-0 items-center gap-2 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={onScoutMore}
            disabled={loadingMore}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-ish-border bg-white px-3 py-1.5 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-app disabled:opacity-50"
          >
            <Compass className="size-3.5" />
            {loadingMore ? "Scouting…" : "Scout More"}
          </button>

          <button
            type="button"
            onClick={onAddLeads}
            disabled={selectedCount === 0 || saving}
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-all duration-150 sm:ml-0",
              selectedCount > 0 && !saving
                ? "bg-ish-green shadow-[var(--shadow-ish)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-ink-faint opacity-50",
            )}
          >
            {saving ? "Saving…" : `Add ${selectedCount > 0 ? selectedCount : "—"} as Leads`}
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
