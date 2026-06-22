"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Compass,
  MapPin,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCOUT_CITY_GROUPS,
  SCOUT_DEPARTMENTS,
  SCOUT_INDUSTRIES,
  SCOUT_SENIORITY,
  getCityMeta,
  type ScoutCity,
} from "@/lib/scouting-data";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

type ActivePanel = "city" | "industry" | "people" | null;

export type ScoutMode = "autopilot" | "search";

type Props = {
  view: "companies" | "people";
  cities: string[];
  industries: string[];
  seniority: string[];
  departments: string[];
  selectedCount: number;
  settingsLoaded?: boolean;
  scoutCompaniesLimit?: number;
  scoutLeadsLimit?: number;
  loadingCompanies?: boolean;
  loadingMore?: boolean;
  saving?: boolean;
  scoutMode?: ScoutMode;
  companySearchQuery?: string;
  onCitiesChange: (cities: string[]) => void;
  onIndustryToggle: (industry: string) => void;
  onSeniorityToggle: (s: string) => void;
  onDepartmentToggle: (d: string) => void;
  onFetchNewCompanies: () => void;
  onFetchLeads: () => void;
  onAddLeads: () => void;
  onScoutMore: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onScoutModeChange?: (mode: ScoutMode) => void;
  onCompanySearchQueryChange?: (query: string) => void;
  onSearchByName?: () => void;
};

/* ─────────────────────────────────────────────
   Label helpers
───────────────────────────────────────────── */

function cityLabel(cities: string[]): string {
  if (cities.length === 0) return "Add city";
  if (cities.length === 1) return cities[0];
  return `${cities[0]} +${cities.length - 1}`;
}

function industryLabel(industries: string[]): string {
  if (industries.length === 0) return "Any industry";
  if (industries.length === 1) return industries[0];
  return `${industries.length} industries`;
}

function peopleLabel(seniority: string[], departments: string[]): string {
  const total = seniority.length + departments.length;
  if (total === 0) return "Any people";
  return `${total} filter${total > 1 ? "s" : ""}`;
}

/* ─────────────────────────────────────────────
   FilterChip
───────────────────────────────────────────── */

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all duration-150",
        active
          ? "bg-ish-ink text-white"
          : "bg-ish-app text-ish-ink-soft hover:bg-ish-border hover:text-ish-ink",
      )}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Pill trigger button
───────────────────────────────────────────── */

function PillSegment({
  icon,
  label,
  value,
  active,
  hasSelection,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  active: boolean;
  hasSelection: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-full px-4 py-2 text-left transition-all duration-150",
        active
          ? "bg-white shadow-[0_2px_12px_rgba(20,20,30,0.10)] ring-1 ring-ish-border"
          : "hover:bg-ish-app",
      )}
    >
      <span className={cn("transition-colors", active || hasSelection ? "text-ish-ink" : "text-ish-ink-faint")}>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
          {label}
        </span>
        <span
          className={cn(
            "text-[13px] font-semibold leading-tight",
            hasSelection ? "text-ish-ink" : "text-ish-ink-soft",
          )}
        >
          {value}
        </span>
      </span>
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-ish-ink-faint transition-transform duration-200",
          active && "rotate-180",
        )}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────
   Popover wrapper (opens below its trigger)
───────────────────────────────────────────── */

function Popover({
  open,
  onClose,
  width,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-ish-border bg-white shadow-[var(--shadow-ish-float)] transition-all duration-200 origin-top",
        open
          ? "pointer-events-auto scale-100 opacity-100 translate-y-0"
          : "pointer-events-none scale-95 opacity-0 -translate-y-1",
        width ?? "w-[340px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   City Popover content
───────────────────────────────────────────── */

function CityPopoverContent({
  cities,
  onCitiesChange,
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const filtered = SCOUT_CITY_GROUPS.map((g) => ({
    ...g,
    cities: g.cities.filter((c) => {
      const m = getCityMeta(c);
      return !q || c.toLowerCase().includes(q);
    }),
  })).filter((g) => g.cities.length > 0);

  function toggle(city: ScoutCity) {
    if (cities.includes(city)) {
      if (cities.length <= 1) return;
      onCitiesChange(cities.filter((c) => c !== city));
    } else {
      onCitiesChange([...cities, city]);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="border-b border-ish-border p-3">
        <div className="flex items-center gap-2 rounded-xl border border-ish-border bg-ish-app px-3 py-2">
          <Search className="size-3.5 shrink-0 text-ish-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ish-ink outline-none placeholder:text-ish-ink-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="text-ish-ink-faint hover:text-ish-ink"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* City groups */}
      <div className="p-3">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-ish-ink-faint">No cities match.</p>
        ) : (
          filtered.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.cities.map((city) => {
                  const meta = getCityMeta(city);
                  const selected = cities.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggle(city as ScoutCity)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150",
                        selected
                          ? "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)]"
                          : "bg-ish-app text-ish-ink-soft hover:bg-ish-border hover:text-ish-ink",
                      )}
                    >
                      <span className="leading-none">{meta.icon}</span>
                      {city}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer: selected chips + clear */}
      {cities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-ish-border bg-ish-app/60 px-3 py-2.5">
          {cities.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full bg-ish-yellow px-2.5 py-0.5 text-[11px] font-bold text-ish-ink"
            >
              {c}
              <button
                type="button"
                disabled={cities.length <= 1}
                onClick={() => onCitiesChange(cities.filter((x) => x !== c))}
                className="disabled:opacity-40"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Industry Popover content
───────────────────────────────────────────── */

function IndustryPopoverContent({
  industries,
  onToggle,
}: {
  industries: string[];
  onToggle: (i: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-ish-ink-soft">Select industries to scout</p>
        {industries.length > 0 && (
          <button
            type="button"
            onClick={() => industries.forEach((i) => onToggle(i))}
            className="text-[11px] font-semibold text-ish-ink-faint hover:text-ish-ink"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SCOUT_INDUSTRIES.map((ind) => (
          <FilterChip
            key={ind}
            label={ind}
            active={industries.includes(ind)}
            onClick={() => onToggle(ind)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   People Popover content
───────────────────────────────────────────── */

function PeoplePopoverContent({
  seniority,
  departments,
  onSeniorityToggle,
  onDepartmentToggle,
}: {
  seniority: string[];
  departments: string[];
  onSeniorityToggle: (s: string) => void;
  onDepartmentToggle: (d: string) => void;
}) {
  const hasAny = seniority.length + departments.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-ish-ink-soft">Filter by seniority & department</p>
        {hasAny && (
          <button
            type="button"
            onClick={() => {
              [...seniority].forEach((s) => onSeniorityToggle(s));
              [...departments].forEach((d) => onDepartmentToggle(d));
            }}
            className="text-[11px] font-semibold text-ish-ink-faint hover:text-ish-ink"
          >
            Clear all
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
          Seniority
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SCOUT_SENIORITY.map((s) => (
            <FilterChip
              key={s}
              label={s}
              active={seniority.includes(s)}
              onClick={() => onSeniorityToggle(s)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[9.5px] font-bold uppercase tracking-widest text-ish-ink-faint">
          Department
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SCOUT_DEPARTMENTS.map((d) => (
            <FilterChip
              key={d}
              label={d}
              active={departments.includes(d)}
              onClick={() => onDepartmentToggle(d)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mode toggle (Autopilot / Search)
───────────────────────────────────────────── */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ScoutMode;
  onChange: (m: ScoutMode) => void;
}) {
  return (
    <div className="flex items-center rounded-full border border-ish-border bg-ish-app/60 p-1 shadow-[var(--shadow-ish-sm)]">
      <button
        type="button"
        onClick={() => onChange("autopilot")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-all duration-150",
          mode === "autopilot"
            ? "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)]"
            : "text-ish-ink-soft hover:text-ish-ink",
        )}
      >
        <span className="text-[10px]">⚡</span>
        Autopilot
      </button>
      <button
        type="button"
        onClick={() => onChange("search")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-all duration-150",
          mode === "search"
            ? "bg-ish-ink text-white shadow-[var(--shadow-ish)]"
            : "text-ish-ink-soft hover:text-ish-ink",
        )}
      >
        <Search className="size-3" />
        Search
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Company search input (Search mode)
───────────────────────────────────────────── */

function CompanySearchInput({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-ish-border bg-white px-3.5 py-2 shadow-[var(--shadow-ish-sm)]">
      <Building2 className="size-3.5 shrink-0 text-ish-ink-faint" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSearch(); }}
        placeholder="e.g. Chandra Sekar Hospital"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-ish-ink outline-none placeholder:text-ish-ink-faint"
        disabled={loading}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 text-ish-ink-faint hover:text-ish-ink"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Button atoms
───────────────────────────────────────────── */

function SecondaryBtn({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ish-border bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-app disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function PrimaryBtn({
  onClick,
  disabled,
  icon,
  label,
  color,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  color: "yellow" | "green";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12.5px] font-bold transition-all duration-150",
        !disabled && color === "yellow" &&
          "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)] hover:opacity-90",
        !disabled && color === "green" &&
          "bg-ish-green text-white shadow-[var(--shadow-ish)] hover:opacity-90",
        disabled && "cursor-not-allowed bg-ish-app text-ish-ink-faint",
      )}
    >
      {label}
      {icon}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Main ScoutingToolbar
───────────────────────────────────────────── */

export function ScoutingToolbar({
  view,
  cities,
  industries,
  seniority,
  departments,
  selectedCount,
  settingsLoaded = true,
  scoutCompaniesLimit = 1,
  scoutLeadsLimit = 1,
  loadingCompanies,
  loadingMore,
  saving,
  scoutMode = "autopilot",
  companySearchQuery = "",
  onCitiesChange,
  onIndustryToggle,
  onSeniorityToggle,
  onDepartmentToggle,
  onFetchNewCompanies,
  onFetchLeads,
  onAddLeads,
  onScoutMore,
  onLoadMore,
  onRefresh,
  onScoutModeChange,
  onCompanySearchQueryChange,
  onSearchByName,
}: Props) {
  const [active, setActive] = useState<ActivePanel>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isSearchMode = scoutMode === "search";
  const canScout = settingsLoaded && cities.length > 0 && !loadingCompanies;
  const canSearch = settingsLoaded && cities.length > 0 && companySearchQuery.trim().length > 0 && !loadingCompanies;
  const volumeHint = `${scoutCompaniesLimit} cos · ${scoutLeadsLimit} leads`;

  // Close on outside click
  useEffect(() => {
    if (!active) return;
    function handle(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [active]);

  // Close on Escape
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(null);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  function toggle(panel: ActivePanel) {
    setActive((p) => (p === panel ? null : panel));
  }

  return (
    <>
      {/* Subtle backdrop dimmer */}
      {active && (
        <div
          aria-hidden
          className="fixed inset-0 z-20"
          onClick={() => setActive(null)}
        />
      )}

      {/* ── Single unified bar ── */}
      <div
        ref={barRef}
        className="relative z-30 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-ish-border bg-white px-4 py-2.5"
      >
        {/* Mode toggle: Autopilot / Search */}
        <ModeToggle
          mode={scoutMode}
          onChange={(m) => { setActive(null); onScoutModeChange?.(m); }}
        />

        {/* Thin separator */}
        <div className="mx-1 hidden h-6 w-px bg-ish-border sm:block" aria-hidden />

        {/* Left cluster: filter pills inside a rounded container */}
        <div className="flex items-center rounded-full border border-ish-border bg-ish-app/60 p-1 shadow-[var(--shadow-ish-sm)]">
          {/* City pill */}
          <div className="relative">
            <PillSegment
              icon={<MapPin className="size-3.5" />}
              label="City"
              value={cityLabel(cities)}
              active={active === "city"}
              hasSelection={cities.length > 0}
              onClick={() => toggle("city")}
            />
            <Popover open={active === "city"} onClose={() => setActive(null)} width="w-[360px]">
              <CityPopoverContent cities={cities} onCitiesChange={onCitiesChange} />
            </Popover>
          </div>

          {/* Divider */}
          <div className="mx-0.5 h-6 w-px bg-ish-border" aria-hidden />

          {/* Industry pill */}
          <div className="relative">
            <PillSegment
              icon={<Building2 className="size-3.5" />}
              label="Industry"
              value={industryLabel(industries)}
              active={active === "industry"}
              hasSelection={industries.length > 0}
              onClick={() => toggle("industry")}
            />
            <Popover open={active === "industry"} onClose={() => setActive(null)} width="w-[400px]">
              <IndustryPopoverContent industries={industries} onToggle={onIndustryToggle} />
            </Popover>
          </div>

          {/* People pill — Autopilot only */}
          {!isSearchMode && (
            <>
              <div className="mx-0.5 h-6 w-px bg-ish-border" aria-hidden />
              <div className="relative">
                <PillSegment
                  icon={<Users className="size-3.5" />}
                  label="People"
                  value={peopleLabel(seniority, departments)}
                  active={active === "people"}
                  hasSelection={seniority.length + departments.length > 0}
                  onClick={() => toggle("people")}
                />
                <Popover open={active === "people"} onClose={() => setActive(null)} width="w-[380px]">
                  <PeoplePopoverContent
                    seniority={seniority}
                    departments={departments}
                    onSeniorityToggle={onSeniorityToggle}
                    onDepartmentToggle={onDepartmentToggle}
                  />
                </Popover>
              </div>
            </>
          )}
        </div>

        {/* Search mode: company name input */}
        {isSearchMode && (
          <CompanySearchInput
            value={companySearchQuery}
            onChange={(v) => onCompanySearchQueryChange?.(v)}
            onSearch={() => { setActive(null); onSearchByName?.(); }}
            loading={loadingCompanies}
          />
        )}

        {/* Autopilot: volume hint */}
        {!isSearchMode && (
          <span
            className="hidden rounded-full bg-ish-app px-2.5 py-1 text-[10px] font-medium text-ish-ink-soft sm:inline"
            title="Scout volume from Settings — lower saves Tavily/Gemini tokens"
          >
            {volumeHint}
          </span>
        )}

        {/* CTA: Scout (Autopilot) or Search (Search mode) */}
        {isSearchMode ? (
          <button
            type="button"
            onClick={() => { setActive(null); onSearchByName?.(); }}
            disabled={!canSearch}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold transition-all duration-150",
              canSearch
                ? "bg-ish-ink text-white shadow-[var(--shadow-ish)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-app text-ish-ink-faint",
            )}
          >
            <Search className="size-3.5" />
            {loadingCompanies ? "Searching…" : "Search"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setActive(null); onFetchNewCompanies(); }}
            disabled={!canScout}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold transition-all duration-150",
              canScout
                ? "bg-ish-yellow text-ish-ink shadow-[var(--shadow-ish-yellow-sm)] hover:opacity-90"
                : "cursor-not-allowed bg-ish-app text-ish-ink-faint",
            )}
          >
            <Search className="size-3.5" />
            {loadingCompanies ? "Scouting…" : "Scout"}
          </button>
        )}

        {/* Thin separator */}
        <div className="mx-1 hidden h-6 w-px bg-ish-border sm:block" aria-hidden />

        {/* Right cluster: context-aware action buttons */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view === "companies" ? (
            <>
              {/* Refresh & Load More only in Autopilot mode */}
              {!isSearchMode && (
                <>
                  <SecondaryBtn
                    onClick={onRefresh}
                    disabled={loadingCompanies || cities.length === 0}
                    icon={<RefreshCw className="size-3.5" />}
                    label="Refresh"
                  />
                  <SecondaryBtn
                    onClick={onLoadMore}
                    disabled={loadingMore || cities.length === 0}
                    label={loadingMore ? "Loading…" : "Load More"}
                  />
                </>
              )}
              <PrimaryBtn
                onClick={onFetchLeads}
                disabled={selectedCount === 0}
                label={
                  selectedCount > 0
                    ? `Fetch Leads · ${selectedCount} ${selectedCount === 1 ? "co." : "cos."}`
                    : "Select companies first"
                }
                icon={<ArrowRight className="size-3.5" />}
                color="green"
              />
            </>
          ) : (
            <>
              <SecondaryBtn
                onClick={onScoutMore}
                disabled={loadingMore}
                icon={<Compass className="size-3.5" />}
                label={loadingMore ? "Scouting…" : "Scout More"}
              />
              <PrimaryBtn
                onClick={onAddLeads}
                disabled={selectedCount === 0 || saving}
                label={saving ? "Saving…" : `Add ${selectedCount > 0 ? selectedCount : "—"} as Leads`}
                icon={<ArrowRight className="size-3.5" />}
                color="green"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
