"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Briefcase,
  Building,
  Building2,
  Car,
  Check,
  ChevronDown,
  ClipboardList,
  Compass,
  Cpu,
  Crown,
  Factory,
  FlaskConical,
  GraduationCap,
  Hammer,
  HeartPulse,
  History,
  Hotel,
  Landmark,
  Monitor,
  Mountain,
  MapPin,
  Megaphone,
  Package,
  Pill,
  RefreshCw,
  Rocket,
  Search,
  Shirt,
  Square,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/design-system";
import { peopleAndFilterWarning } from "@/lib/enrichment/people-role-filter";
import {
  districtGroupsForScoutOptions,
  isScoutDistrictPicked,
  setScoutStateDistricts,
  toggleScoutDistrictPick,
  type ScoutLocationOption,
  type ScoutLocationScope,
} from "@/lib/geo/india";
import {
  SCOUT_BUSINESSES,
  SCOUT_CITY_GROUPS,
  SCOUT_DEPARTMENTS,
  SCOUT_EMPLOYEE_BANDS,
  SCOUT_INDUSTRIES,
  SCOUT_SENIORITY,
  type ScoutVerticalScope,
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
  employeeBands: string[];
  seniority: string[];
  departments: string[];
  selectedCount: number;
  settingsLoaded?: boolean;
  scoutCompaniesLimit?: number;
  scoutLeadsLimit?: number;
  loadingCompanies?: boolean;
  loadingMore?: boolean;
  loadingPeople?: boolean;
  saving?: boolean;
  scoutMode?: ScoutMode;
  companySearchQuery?: string;
  onCitiesChange: (cities: string[]) => void;
  onIndustryToggle: (industry: string) => void;
  onEmployeeBandToggle: (bandId: string) => void;
  onSeniorityToggle: (s: string) => void;
  onDepartmentToggle: (d: string) => void;
  onFetchNewCompanies: () => void;
  onFetchLeads: () => void;
  onSaveCompanies?: () => void;
  savingCompanies?: boolean;
  showingSaved?: boolean;
  onShowSaved?: () => void;
  onShowHistory?: () => void;
  activeSessionTitle?: string | null;
  onAddLeads: () => void;
  onScoutMore: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onScoutModeChange?: (mode: ScoutMode) => void;
  onCompanySearchQueryChange?: (query: string) => void;
  onSearchByName?: () => void;
  onStopSearch?: () => void;
  isMobileLayout?: boolean;
  filtersCollapsed?: boolean;
  onExpandFilters?: () => void;
  hideActions?: boolean;
  onFilterPanelChange?: (open: boolean) => void;
  locationOptions?: ScoutLocationOption[] | { label: string; group: string }[];
  locationScope?: ScoutLocationScope;
  onLocationScopeChange?: (scope: ScoutLocationScope) => void;
  verticalScope?: ScoutVerticalScope;
  onVerticalScopeChange?: (scope: ScoutVerticalScope) => void;
  businesses?: string[];
  onBusinessToggle?: (business: string) => void;
  peopleCities?: string[];
  onPeopleCitiesChange?: (cities: string[]) => void;
};

/* ─────────────────────────────────────────────
   Label helpers
───────────────────────────────────────────── */

function cityLabel(cities: string[], locationOptions?: Array<{ kind?: ScoutLocationOption["kind"]; group?: string }>): string {
  const areaOptions = locationOptions?.filter((o) => o.kind === "area") ?? [];
  const groups = [...new Set(areaOptions.map((o) => o.group).filter(Boolean))] as string[];
  if (areaOptions.length && cities.length) {
    if (groups.length > 1) {
      return cities.length === 1 ? cities[0] : `${cities[0]} +${cities.length - 1}`;
    }
    return groups[0] ?? cities[0];
  }
  if (cities.length === 0) return "Add location";
  if (cities.length === 1) return cities[0];
  return `${cities[0]} +${cities.length - 1}`;
}

function defaultLocationOptions(): ScoutLocationOption[] {
  return SCOUT_CITY_GROUPS.flatMap((g) =>
    g.cities.map((c) => ({
      id: c,
      label: c,
      group: g.label,
      kind: "district" as const,
      searchTerms: [c],
    })),
  );
}

function industryLabel(industries: string[]): string {
  if (industries.length === 0) return "Any industry";
  if (industries.length === 1) return industries[0];
  return `${industries.length} industries`;
}

function sizeLabel(employeeBands: string[]): string {
  if (employeeBands.length === 0) return "Any scale";
  const labels = SCOUT_EMPLOYEE_BANDS.filter((b) => employeeBands.includes(b.id)).map((b) => b.label);
  if (labels.length === 1) return labels[0];
  return `${labels.length} scales`;
}

function industryScaleLabel(industries: string[], employeeBands: string[]): string {
  if (industries.length === 0 && employeeBands.length === 0) return "Any industry";
  if (employeeBands.length === 0) return industryLabel(industries);
  if (industries.length === 0) return sizeLabel(employeeBands);
  return `${industryLabel(industries)} · ${sizeLabel(employeeBands)}`;
}

function businessLabel(businesses: string[]): string {
  if (businesses.length === 0) return "Any business";
  if (businesses.length === 1) return businesses[0];
  return `${businesses.length} businesses`;
}

function verticalScaleLabel(
  verticalScope: ScoutVerticalScope,
  industries: string[],
  businesses: string[],
  employeeBands: string[],
): string {
  if (verticalScope === "businesses") {
    if (businesses.length === 0 && employeeBands.length === 0) return "Any business";
    if (employeeBands.length === 0) return businessLabel(businesses);
    if (businesses.length === 0) return sizeLabel(employeeBands);
    return `${businessLabel(businesses)} · ${sizeLabel(employeeBands)}`;
  }
  return industryScaleLabel(industries, employeeBands);
}

function peopleLabel(seniority: string[], departments: string[], verticalScope?: ScoutVerticalScope): string {
  const total = seniority.length + departments.length;
  if (verticalScope === "businesses" && total === 0) return "Local seniors";
  if (total === 0) return "Any people";
  return `${total} filter${total > 1 ? "s" : ""}`;
}

function PeopleAndFilterNotice({
  seniority,
  departments,
  verticalScope,
  className,
}: {
  seniority: string[];
  departments: string[];
  verticalScope?: ScoutVerticalScope;
  className?: string;
}) {
  if (verticalScope === "businesses") {
    return (
      <p className={cn("rounded-xl bg-brand-stratus-yellow/20 px-3 py-2 text-[11.5px] font-medium leading-snug text-brand-ink", className)}>
        Fetch Leads looks for branch managers, principals, and unit heads in this area. Leave People empty unless you want a tighter seniority chip. Skip Head of HR and CHRO at corporate HQ.
      </p>
    );
  }
  const warning = peopleAndFilterWarning(seniority, departments);
  if (!warning) return null;
  return (
    <p className={cn("rounded-xl bg-brand-stratus-yellow/20 px-3 py-2 text-[11.5px] font-medium leading-snug text-brand-ink", className)}>
      {warning}
    </p>
  );
}

/* ─────────────────────────────────────────────
   Scout filter chip grid (Stratus tiles)
───────────────────────────────────────────── */

function ScoutChipGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ish-scout-chip-grid", className)}>{children}</div>;
}

function ScoutFilterChip({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "ish-scout-filter-chip",
        selected ? "ish-scout-chip-on" : "ish-scout-chip-off",
      )}
    >
      {icon ? <span className="ish-scout-filter-chip-icon">{icon}</span> : null}
      <span className="ish-scout-filter-chip-label">{label}</span>
    </button>
  );
}

/* ─────────────────────────────────────────────
   FilterChip
───────────────────────────────────────────── */

function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <ScoutFilterChip label={label} icon={icon} selected={active} onClick={onClick} />
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
        "group flex h-8 items-center gap-2 rounded-full px-3.5 text-left transition-all duration-150",
        active ? "ish-scout-pill-active" : "hover:bg-white/70",
      )}
    >
      <span className={cn("transition-colors", active || hasSelection ? "text-brand-ink" : "text-brand-ink-faint")}>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
          {label}
        </span>
        <span
          className={cn(
            "text-[13px] font-semibold leading-tight",
            hasSelection ? "text-brand-ink" : "text-brand-ink-soft",
          )}
        >
          {value}
        </span>
      </span>
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-brand-ink-faint transition-transform duration-200",
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
        "ish-scout-popover absolute top-full left-0 z-50 mt-2 transition-all duration-200 origin-top",
        open
          ? "pointer-events-auto scale-100 opacity-100 translate-y-0"
          : "pointer-events-none scale-95 opacity-0 -translate-y-1",
        width ?? "w-[min(360px,calc(100vw-2rem))]",
        className,
      )}
    >
      <div className="relative z-10 bg-transparent">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mobile filter sheet primitives
───────────────────────────────────────────── */

const SCALE_ICONS: Record<string, LucideIcon> = {
  micro: Package,
  small: Factory,
  medium: Building2,
  large: Landmark,
};

const BUSINESS_ICONS: Record<string, LucideIcon> = {
  Banks: Landmark,
  Schools: GraduationCap,
  Colleges: GraduationCap,
  Universities: GraduationCap,
  Hospitals: HeartPulse,
  Hotels: Hotel,
  "Government offices": Landmark,
  Clubs: Users,
  "Housing societies": Building,
  Hostels: Building2,
};

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Manufacturing: Factory,
  Automotive: Car,
  Textiles: Shirt,
  Electronics: Monitor,
  "Steel & Metals": Mountain,
  Chemicals: FlaskConical,
  "Energy & Power": Zap,
  "Real Estate": Building2,
  Technology: Cpu,
  "Financial Services": Landmark,
  Healthcare: HeartPulse,
  Retail: ShoppingBag,
  FMCG: Package,
  Construction: Hammer,
  Pharmaceuticals: Pill,
  Education: GraduationCap,
  Hospitality: UtensilsCrossed,
  Logistics: Truck,
};

const SENIORITY_ICONS: Record<string, LucideIcon> = {
  "C-Level": Crown,
  Founders: Rocket,
  VP: Briefcase,
  Director: UserCog,
  Manager: Users,
};

const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  HR: Users,
  Admin: ClipboardList,
  Procurement: ShoppingCart,
  Facilities: Building,
  Marketing: Megaphone,
  Operations: Settings,
  Leadership: Crown,
};

function MobileFilterGridChip({
  icon,
  label,
  sublabel,
  selected,
  onClick,
  disabled,
  size = "md",
}: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const large = size === "lg";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start rounded-2xl border text-left transition-all active:scale-[0.98]",
        large ? "min-h-[92px] gap-2.5 p-4" : "min-h-[80px] gap-2 p-3",
        selected
          ? "border-brand-stratus-blue/40 bg-brand-stratus-blue/10 ring-1 ring-brand-stratus-blue/25"
          : "border-brand-border/55 bg-white hover:bg-brand-canvas",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-brand-canvas text-brand-stratus-blue shadow-brand-sm",
            large ? "size-11" : "size-9",
          )}
        >
          {icon}
        </span>
        {selected ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-stratus-blue text-white">
            <Check className="size-3" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <span className={cn("line-clamp-2 font-semibold leading-snug text-brand-ink", large ? "text-[15px]" : "text-[13px]")}>
        {label}
      </span>
      {sublabel ? (
        <span className="line-clamp-1 text-[11px] text-brand-ink-soft">{sublabel}</span>
      ) : null}
    </button>
  );
}

function ScaleDsCard({
  band,
  selected,
  onToggle,
}: {
  band: (typeof SCOUT_EMPLOYEE_BANDS)[number];
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = SCALE_ICONS[band.id] ?? Factory;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "relative flex items-center gap-2.5 rounded-xl border bg-white px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-brand-stratus-blue bg-brand-stratus-blue/10 shadow-[var(--shadow-brand-sm)]"
          : "border-brand-border/60 hover:border-brand-stratus-blue/40 hover:bg-brand-canvas/50",
      )}
    >
      {selected ? (
        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand-stratus-blue text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          selected
            ? "bg-brand-stratus-blue/20 text-brand-stratus-blue"
            : "bg-brand-canvas text-brand-ink-faint",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 pr-4">
        <span className="block truncate text-[13px] font-semibold text-brand-ink">{band.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-brand-ink-faint">{band.sublabel}</span>
      </span>
    </button>
  );
}

function MobileSheetPrimaryButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        disabled
          ? "bg-brand-canvas text-brand-ink-faint"
          : "ish-scout-cta-yellow",
      )}
    >
      {label}
      {icon}
    </button>
  );
}

function districtHaystack(district: { displayName: string; name: string; aliases: string[] }): string {
  return [district.displayName, district.name, ...district.aliases].join(" ").toLowerCase();
}

function LocationAreaPicker({
  cities,
  onCitiesChange,
  locationOptions,
  compact,
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
  compact?: boolean;
}) {
  const groups: { name: string; options: typeof locationOptions }[] = [];
  for (const option of locationOptions) {
    const name = option.group ?? "Area of focus";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.options.push(option);
    else groups.push({ name, options: [option] });
  }
  const labels = [...new Set(locationOptions.map((option) => option.label))];
  const selectedCount = labels.filter((label) => cities.includes(label)).length;
  const allSelected = labels.length > 0 && selectedCount === labels.length;
  const noneSelected = selectedCount === 0;
  return (
    <div className="flex flex-col">
      <div className="ish-scout-filter-section-head px-4 pt-4">
        <p className="text-[12px] font-semibold text-brand-ink">
          {groups.length > 1 ? `${groups.length} focus areas` : (groups[0]?.name ?? "Area of focus")}
        </p>
        <div className="ish-scout-filter-actions">
          <button
            type="button"
            onClick={() => onCitiesChange(labels)}
            disabled={allSelected}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-blue transition-colors hover:bg-brand-stratus-blue/10 disabled:text-brand-ink-faint disabled:hover:bg-transparent"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onCitiesChange([])}
            disabled={noneSelected}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-blue transition-colors hover:bg-brand-stratus-blue/10 disabled:text-brand-ink-faint disabled:hover:bg-transparent"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="px-4 pb-3 text-[11px] leading-relaxed text-brand-ink-faint">
        Scout only the selected nearby areas. Clear all unselects chips and keeps these clusters.
      </p>
      {groups.map((group) => (
        <div key={group.name} className="pb-1">
          {groups.length > 1 ? (
            <p className="px-4 pb-2 text-[11px] font-semibold text-brand-ink-soft">{group.name}</p>
          ) : null}
          <ScoutChipGrid className="px-4 pb-4">
            {group.options.map((option) => {
              const selected = cities.includes(option.label);
              return (
                <ScoutFilterChip
                  key={`${group.name}:${option.label}`}
                  label={option.label}
                  selected={selected}
                  onClick={() =>
                    onCitiesChange(
                      selected ? cities.filter((c) => c !== option.label) : [...cities, option.label],
                    )
                  }
                />
              );
            })}
          </ScoutChipGrid>
        </div>
      ))}
      {noneSelected ? (
        <p className="px-4 pb-4 text-[11px] text-brand-ink-soft">Pick at least one nearby area to scout.</p>
      ) : null}
    </div>
  );
}

function LocationDistrictPicker({
  cities,
  onCitiesChange,
  locationOptions,
  compact,
  locationScope = "interest",
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
  compact?: boolean;
  locationScope?: ScoutLocationScope;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const groups = districtGroupsForScoutOptions(locationOptions);

  if (locationScope === "focus" && !locationOptions.some((option) => option.kind === "area")) {
    return (
      <div className="flex flex-col">
        <div className={cn("px-4 text-center", compact ? "py-8" : "py-6")}>
          <p className="text-[12.5px] font-semibold text-brand-ink">No Focus Area yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-brand-ink-soft">
            Set Areas of focus in Settings to scout neighborhood clusters.
          </p>
          <Link
            href="/settings?tab=enrichment"
            className="mt-3 inline-flex text-[12px] font-semibold text-brand-stratus-blue hover:underline"
          >
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  if (locationOptions.some((option) => option.kind === "area")) {
    return (
      <LocationAreaPicker
        cities={cities}
        onCitiesChange={onCitiesChange}
        locationOptions={locationOptions}
        compact={compact}
      />
    );
  }

  const filtered = groups
    .map((group) => ({
      ...group,
      districts: group.districts.filter(
        (d) =>
          !q ||
          districtHaystack(d).includes(q) ||
          group.state.name.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.districts.length > 0);

  function isExpanded(stateId: string, districtCount: number) {
    if (q) return true;
    if (stateId in collapsed) return !collapsed[stateId];
    return districtCount <= 9;
  }

  if (!groups.length) {
    return (
      <p className={cn("text-center text-[12px] text-brand-ink-faint", compact ? "px-4 py-8" : "py-6")}>
        Set locations in Settings, Enrichment (India, region, state, or district).
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className={cn("border-b border-brand-border/60", compact ? "px-3 py-2.5" : "px-3.5 py-3")}>
        <div className="ish-scout-search flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
          <Search className="size-3.5 shrink-0 text-brand-stratus-blue/80" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search districts or states"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-tight text-brand-ink outline-none placeholder:font-normal placeholder:text-brand-ink-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="flex size-5 items-center justify-center rounded-full bg-brand-ink-faint/15 text-brand-ink-soft hover:bg-brand-ink-faint/25"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 px-0.5">
          <p className="text-[11px] font-medium text-brand-ink-faint">
            {cities.length === 0
              ? "Nothing selected"
              : `${cities.length} location${cities.length === 1 ? "" : "s"} selected`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                let next = cities;
                for (const group of groups) {
                  next = setScoutStateDistricts(
                    next,
                    group.state.id,
                    true,
                    group.districts.map((d) => d.id),
                  );
                }
                onCitiesChange(next);
              }}
              disabled={groups.every(
                (g) => g.districts.length > 0 && g.districts.every((d) => isScoutDistrictPicked(cities, d)),
              )}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-blue transition-colors hover:bg-brand-stratus-blue/10 disabled:text-brand-ink-faint disabled:hover:bg-transparent"
            >
              All
            </button>
            <span className="text-[10px] text-brand-ink-faint/50" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={() => onCitiesChange([])}
              disabled={cities.length === 0}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-blue transition-colors hover:bg-brand-stratus-blue/10 disabled:text-brand-ink-faint disabled:hover:bg-transparent"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className={cn("flex flex-col gap-2", compact ? "px-2.5 py-2.5" : "px-3 py-3")}>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] font-medium text-brand-ink-faint">No districts match</p>
        ) : (
          filtered.map((group) => {
            const allowedIds = group.districts.map((d) => d.id);
            const selectedCount = group.districts.filter((d) => isScoutDistrictPicked(cities, d)).length;
            const allOn = selectedCount === group.districts.length && group.districts.length > 0;
            const noneOn = selectedCount === 0;
            const expanded = isExpanded(group.state.id, group.districts.length);
            const selectedNames = group.districts
              .filter((d) => isScoutDistrictPicked(cities, d))
              .map((d) => d.displayName);
            return (
              <div
                key={group.state.id}
                className="overflow-hidden rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]"
              >
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [group.state.id]: expanded }))
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-brand-stratus-blue/[0.06]"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-canvas text-brand-ink-soft transition-transform",
                        expanded ? "rotate-0" : "-rotate-90",
                      )}
                    >
                      <ChevronDown className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-brand-ink">
                      {group.state.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums",
                        selectedCount > 0
                          ? "bg-brand-stratus-blue/15 text-brand-ink"
                          : "bg-brand-canvas text-brand-ink-faint",
                      )}
                    >
                      {selectedCount}/{group.districts.length}
                    </span>
                  </button>
                  <div
                    className="flex shrink-0 items-center rounded-full bg-brand-canvas/90 p-0.5 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]"
                    role="group"
                    aria-label={`${group.state.name} selection`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onCitiesChange(setScoutStateDistricts(cities, group.state.id, true, allowedIds))
                      }
                      disabled={allOn}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        allOn
                          ? "bg-white text-brand-ink shadow-[var(--shadow-brand-sm)]"
                          : "text-brand-stratus-blue hover:text-brand-ink disabled:text-brand-ink-faint",
                      )}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onCitiesChange(setScoutStateDistricts(cities, group.state.id, false, allowedIds))
                      }
                      disabled={noneOn}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        noneOn
                          ? "bg-white text-brand-ink shadow-[var(--shadow-brand-sm)]"
                          : "text-brand-stratus-blue hover:text-brand-ink disabled:text-brand-ink-faint",
                      )}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {!expanded ? (
                  <p className="px-11 pb-2.5 text-[11.5px] leading-snug text-brand-ink-soft">
                    {allOn
                      ? `All ${group.districts.length} districts`
                      : selectedNames.length
                        ? selectedNames.slice(0, 4).join(", ") +
                          (selectedNames.length > 4 ? ` +${selectedNames.length - 4}` : "")
                        : "None selected"}
                  </p>
                ) : (
                  <ScoutChipGrid className="px-3 pb-3 pt-0.5">
                    {group.districts.map((district) => {
                      const selected = isScoutDistrictPicked(cities, district);
                      return (
                        <ScoutFilterChip
                          key={district.id}
                          label={district.displayName}
                          selected={selected}
                          onClick={() =>
                            onCitiesChange(toggleScoutDistrictPick(cities, district.id, allowedIds))
                          }
                        />
                      );
                    })}
                  </ScoutChipGrid>
                )}
              </div>
            );
          })
        )}
        {cities.length === 0 ? (
          <p className="px-1 pt-0.5 text-[11px] leading-relaxed text-brand-ink-faint">
            Select districts to scout, or leave empty until you are ready.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MobileCitySheetContent({
  cities,
  onCitiesChange,
  locationOptions,
  locationScope,
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
  locationScope?: ScoutLocationScope;
}) {
  return (
    <LocationDistrictPicker
      cities={cities}
      onCitiesChange={onCitiesChange}
      locationOptions={locationOptions}
      compact
      locationScope={locationScope}
    />
  );
}

function MobileIndustrySheetContent({
  industries,
  onIndustryToggle,
  employeeBands,
  onScaleToggle,
  verticalScope = "industries",
  onVerticalScopeChange,
  businesses = [],
  onBusinessToggle,
}: {
  industries: string[];
  onIndustryToggle: (i: string) => void;
  employeeBands: string[];
  onScaleToggle: (bandId: string) => void;
  verticalScope?: ScoutVerticalScope;
  onVerticalScopeChange?: (scope: ScoutVerticalScope) => void;
  businesses?: string[];
  onBusinessToggle?: (business: string) => void;
}) {
  const catalog = verticalScope === "businesses" ? [...SCOUT_BUSINESSES] : [...SCOUT_INDUSTRIES];
  const selected = verticalScope === "businesses" ? businesses : industries;
  const onToggle = verticalScope === "businesses" ? onBusinessToggle : onIndustryToggle;
  const icons = verticalScope === "businesses" ? BUSINESS_ICONS : INDUSTRY_ICONS;
  const allSelected = catalog.length > 0 && catalog.every((item) => selected.includes(item));
  const noneSelected = selected.length === 0;

  function selectAllVertical() {
    catalog
      .filter((item) => !selected.includes(item))
      .forEach((item) => onToggle?.(item));
  }

  function clearAllVertical() {
    [...selected].forEach((item) => onToggle?.(item));
  }

  return (
    <div className="flex flex-col px-1 py-2">
      {onVerticalScopeChange ? (
        <div className="mb-2 flex items-center px-3">
          <VerticalScopeKnob compact value={verticalScope} onChange={onVerticalScopeChange} />
        </div>
      ) : null}
      <div className="mb-3">
        <div className="ish-scout-filter-section-head px-3">
          <p className="ish-scout-filter-section-label">
            {verticalScope === "businesses" ? "Businesses" : "Industries"}
          </p>
          <div className="ish-scout-filter-actions">
            <button
              type="button"
              onClick={selectAllVertical}
              disabled={allSelected}
              className="text-[12px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAllVertical}
              disabled={noneSelected}
              className="text-[12px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
            >
              Clear all
            </button>
          </div>
        </div>
        <ScoutChipGrid className="px-3">
          {catalog.map((ind) => {
            const Icon = icons[ind] ?? Building2;
            return (
              <ScoutFilterChip
                key={ind}
                label={ind}
                icon={<Icon className="size-3.5" />}
                selected={selected.includes(ind)}
                onClick={() => onToggle?.(ind)}
              />
            );
          })}
        </ScoutChipGrid>
      </div>
      <div className="mb-2">
        <div className="ish-scout-filter-section-head px-3">
          <p className="ish-scout-filter-section-label">Scale</p>
          {employeeBands.length > 0 ? (
            <button
              type="button"
              onClick={() => employeeBands.forEach(onScaleToggle)}
              className="text-[12px] font-semibold text-brand-stratus-blue"
            >
              Any scale
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 px-3 sm:grid-cols-2">
          {SCOUT_EMPLOYEE_BANDS.map((band) => (
            <ScaleDsCard
              key={band.id}
              band={band}
              selected={employeeBands.includes(band.id)}
              onToggle={() => onScaleToggle(band.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MobilePeopleSheetContent({
  seniority,
  departments,
  verticalScope,
  onSeniorityToggle,
  onDepartmentToggle,
}: {
  seniority: string[];
  departments: string[];
  verticalScope?: ScoutVerticalScope;
  onSeniorityToggle: (s: string) => void;
  onDepartmentToggle: (d: string) => void;
}) {
  const hasAny = seniority.length + departments.length > 0;

  return (
    <div className="flex flex-col px-1 py-2">
      <div className="ish-scout-filter-section-head px-3">
        <p className="ish-scout-filter-section-label">People filters</p>
        {hasAny ? (
          <button
            type="button"
            onClick={() => {
              [...seniority].forEach((s) => onSeniorityToggle(s));
              [...departments].forEach((d) => onDepartmentToggle(d));
            }}
            className="text-[12px] font-semibold text-brand-stratus-blue"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <p className="ish-scout-filter-section-label mb-2.5 px-3 pt-1">Seniority</p>
      <ScoutChipGrid className="mb-4 px-3">
        {SCOUT_SENIORITY.map((s) => {
          const Icon = SENIORITY_ICONS[s] ?? Users;
          return (
            <FilterChip
              key={s}
              label={s}
              icon={<Icon className="size-3.5" />}
              active={seniority.includes(s)}
              onClick={() => onSeniorityToggle(s)}
            />
          );
        })}
      </ScoutChipGrid>

      <p className="ish-scout-filter-section-label mb-2.5 px-3">Department</p>
      <ScoutChipGrid className="px-3">
        {SCOUT_DEPARTMENTS.map((d) => {
          const Icon = DEPARTMENT_ICONS[d] ?? Users;
          return (
            <FilterChip
              key={d}
              label={d}
              icon={<Icon className="size-3.5" />}
              active={departments.includes(d)}
              onClick={() => onDepartmentToggle(d)}
            />
          );
        })}
      </ScoutChipGrid>

      <PeopleAndFilterNotice
        seniority={seniority}
        departments={departments}
        verticalScope={verticalScope}
        className="mx-3 mt-4"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   City Popover content
───────────────────────────────────────────── */

function CityPopoverContent({
  cities,
  onCitiesChange,
  locationOptions,
  locationScope,
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
  locationScope?: ScoutLocationScope;
}) {
  return (
    <LocationDistrictPicker
      cities={cities}
      onCitiesChange={onCitiesChange}
      locationOptions={locationOptions}
      locationScope={locationScope}
    />
  );
}

/* ─────────────────────────────────────────────
   Industry Popover content
───────────────────────────────────────────── */

function IndustryPopoverContent({
  industries,
  onIndustryToggle,
  employeeBands,
  onScaleToggle,
  verticalScope = "industries",
  onVerticalScopeChange,
  businesses = [],
  onBusinessToggle,
}: {
  industries: string[];
  onIndustryToggle: (i: string) => void;
  employeeBands: string[];
  onScaleToggle: (bandId: string) => void;
  verticalScope?: ScoutVerticalScope;
  onVerticalScopeChange?: (scope: ScoutVerticalScope) => void;
  businesses?: string[];
  onBusinessToggle?: (business: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const isBusiness = verticalScope === "businesses";
  const catalog = isBusiness ? [...SCOUT_BUSINESSES] : [...SCOUT_INDUSTRIES];
  const selectedItems = isBusiness ? businesses : industries;
  const icons = isBusiness ? BUSINESS_ICONS : INDUSTRY_ICONS;
  const filtered = catalog.filter((ind) => !q || ind.toLowerCase().includes(q));
  const allSelected = catalog.length > 0 && catalog.every((item) => selectedItems.includes(item));
  const noneSelected = selectedItems.length === 0;

  function selectAllVertical() {
    catalog
      .filter((item) => !selectedItems.includes(item))
      .forEach((item) => (isBusiness ? onBusinessToggle?.(item) : onIndustryToggle(item)));
  }

  function clearAllVertical() {
    [...selectedItems].forEach((item) =>
      isBusiness ? onBusinessToggle?.(item) : onIndustryToggle(item),
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-brand-border/60 p-3">
        {onVerticalScopeChange ? (
          <VerticalScopeKnob compact value={verticalScope} onChange={onVerticalScopeChange} />
        ) : null}
        <div className="ish-scout-search flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2">
          <Search className="size-3.5 shrink-0 text-brand-stratus-blue" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isBusiness ? "Search business…" : "Search industry…"}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-brand-ink-faint hover:text-brand-ink"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="ish-scout-filter-section-head">
          <p className="ish-scout-filter-section-label">
            {isBusiness ? "Business" : "Industry"}
          </p>
          <div className="ish-scout-filter-actions">
            <button
              type="button"
              onClick={selectAllVertical}
              disabled={allSelected}
              className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAllVertical}
              disabled={noneSelected}
              className="text-[11px] font-semibold text-brand-stratus-blue disabled:text-brand-ink-faint"
            >
              Clear all
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-brand-ink-faint">
            {isBusiness ? "No businesses match." : "No industries match."}
          </p>
        ) : (
          <ScoutChipGrid>
            {filtered.map((ind) => {
              const Icon = icons[ind] ?? Building2;
              const selected = selectedItems.includes(ind);
              return (
                <ScoutFilterChip
                  key={ind}
                  label={ind}
                  icon={<Icon className="size-3.5" />}
                  selected={selected}
                  onClick={() => (isBusiness ? onBusinessToggle?.(ind) : onIndustryToggle(ind))}
                />
              );
            })}
          </ScoutChipGrid>
        )}

        <div className="mt-5">
          <div className="ish-scout-filter-section-head">
            <p className="ish-scout-filter-section-label">Scale</p>
            {employeeBands.length > 0 ? (
              <button
                type="button"
                onClick={() => employeeBands.forEach(onScaleToggle)}
                className="text-[11px] font-semibold text-brand-stratus-blue"
              >
                Any scale
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SCOUT_EMPLOYEE_BANDS.map((band) => (
              <ScaleDsCard
                key={band.id}
                band={band}
                selected={employeeBands.includes(band.id)}
                onToggle={() => onScaleToggle(band.id)}
              />
            ))}
          </div>
        </div>
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
  verticalScope,
  onSeniorityToggle,
  onDepartmentToggle,
}: {
  seniority: string[];
  departments: string[];
  verticalScope?: ScoutVerticalScope;
  onSeniorityToggle: (s: string) => void;
  onDepartmentToggle: (d: string) => void;
}) {
  const hasAny = seniority.length + departments.length > 0;

  return (
    <div className="flex flex-col">
      <div className="p-4">
        <div className="ish-scout-filter-section-head">
          <p className="ish-scout-filter-section-label">People Filters</p>
          {hasAny ? (
            <button
              type="button"
              onClick={() => {
                [...seniority].forEach((s) => onSeniorityToggle(s));
                [...departments].forEach((d) => onDepartmentToggle(d));
              }}
              className="text-[11px] font-semibold text-brand-stratus-blue"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="mb-4">
          <p className="ish-scout-filter-section-label mb-2.5">Seniority</p>
          <ScoutChipGrid>
            {SCOUT_SENIORITY.map((s) => {
              const Icon = SENIORITY_ICONS[s] ?? Users;
              return (
                <FilterChip
                  key={s}
                  label={s}
                  icon={<Icon className="size-3.5" />}
                  active={seniority.includes(s)}
                  onClick={() => onSeniorityToggle(s)}
                />
              );
            })}
          </ScoutChipGrid>
        </div>

        <div>
          <p className="ish-scout-filter-section-label mb-2.5">Department</p>
          <ScoutChipGrid>
            {SCOUT_DEPARTMENTS.map((d) => {
              const Icon = DEPARTMENT_ICONS[d] ?? Users;
              return (
                <FilterChip
                  key={d}
                  label={d}
                  icon={<Icon className="size-3.5" />}
                  active={departments.includes(d)}
                  onClick={() => onDepartmentToggle(d)}
                />
              );
            })}
          </ScoutChipGrid>
        </div>

        <PeopleAndFilterNotice
          seniority={seniority}
          departments={departments}
          verticalScope={verticalScope}
          className="mt-3"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mode toggle (Autopilot / Search)
───────────────────────────────────────────── */

function ScopeKnob<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  embedded = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; name?: string }[];
  ariaLabel: string;
  embedded?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center",
        !embedded && "ish-scout-cluster p-0.5",
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-label={option.name ?? option.label}
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-all duration-150",
              active ? "ish-scout-mode-yellow" : "text-brand-ink-soft hover:text-brand-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function VerticalScopeKnob({
  value,
  onChange,
  embedded = false,
  compact = false,
}: {
  value: ScoutVerticalScope;
  onChange: (scope: ScoutVerticalScope) => void;
  embedded?: boolean;
  compact?: boolean;
}) {
  return (
    <ScopeKnob
      ariaLabel="Industry or business"
      embedded={embedded}
      value={value}
      onChange={onChange}
      options={[
        { value: "industries", label: compact ? "Industry" : "Industries", name: "Industries" },
        { value: "businesses", label: compact ? "Business" : "Businesses", name: "Businesses" },
      ]}
    />
  );
}

function AutopilotCluster({
  mode,
  onModeChange,
  locationScope,
  onLocationScopeChange,
}: {
  mode: ScoutMode;
  onModeChange?: (mode: ScoutMode) => void;
  locationScope: ScoutLocationScope;
  onLocationScopeChange?: (scope: ScoutLocationScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const autopilot = mode === "autopilot";

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!autopilot) setOpen(false);
  }, [autopilot]);

  return (
    <div
      ref={rootRef}
      className="ish-scout-cluster relative flex flex-wrap items-center"
    >
      <button
        type="button"
        aria-haspopup={onLocationScopeChange ? "menu" : undefined}
        aria-expanded={onLocationScopeChange ? open : undefined}
        aria-label={
          autopilot
            ? locationScope === "focus"
              ? "Autopilot, Focus Area"
              : "Autopilot, Area of Interest"
            : "Autopilot"
        }
        onClick={() => {
          onModeChange?.("autopilot");
          if (onLocationScopeChange) setOpen((v) => !v);
        }}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-all duration-150",
          autopilot ? "ish-scout-mode-yellow" : "text-brand-ink-soft hover:text-brand-ink",
        )}
      >
        <Zap className="size-3 shrink-0" />
        Autopilot
        {onLocationScopeChange ? (
          <ChevronDown
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
          />
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onModeChange?.("search");
        }}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-all duration-150",
          mode === "search" ? "ish-scout-mode-blue" : "text-brand-ink-soft hover:text-brand-ink",
        )}
      >
        <Search className="size-3" />
        Search
      </button>
      {open && onLocationScopeChange ? (
        <div
          role="menu"
          className="ish-scout-popover absolute left-0 top-full z-50 mt-1.5 min-w-[200px] py-1"
        >
          {(
            [
              ["focus", "Focus Area"],
              ["interest", "Area of Interest"],
            ] as const
          ).map(([scope, text]) => (
            <button
              key={scope}
              type="button"
              role="menuitem"
              onClick={() => {
                onLocationScopeChange(scope);
                onModeChange?.("autopilot");
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] font-semibold",
                locationScope === scope
                  ? "ish-scout-menu-on"
                  : "text-brand-ink-soft hover:bg-brand-stratus-blue/10 hover:text-brand-ink",
              )}
            >
              {text}
              {locationScope === scope ? <Check className="size-3.5 shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
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
    <div className="ish-scout-search flex min-w-[220px] flex-1 items-center gap-2 rounded-full px-3.5 py-2">
      <Building2 className="size-3.5 shrink-0 text-brand-ink-faint" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSearch(); }}
        placeholder="e.g. Chandra Sekar Hospital"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-brand-ink outline-none placeholder:text-brand-ink-faint"
        disabled={loading}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 text-brand-ink-faint hover:text-brand-ink"
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
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-active={active ? "true" : undefined}
      className="ish-scout-ghost flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  color: "yellow" | "green";
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-all duration-150 active:scale-[0.97]",
        !disabled && color === "yellow" && "ish-scout-cta-yellow hover:opacity-95",
        !disabled && color === "green" && "ish-scout-cta-blue hover:opacity-95",
        disabled && "ish-scout-cta-muted",
      )}
    >
      {label}
      {icon}
    </button>
  );
}


/* ─────────────────────────────────────────────
   Compact filter chip (mobile)
───────────────────────────────────────────── */

function CompactFilterChip({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-all active:scale-[0.97]",
        active ? "ish-scout-chip-on" : "ish-scout-ghost",
      )}
    >
      <span className={cn(active ? "text-brand-stratus-blue" : "text-brand-ink-faint")}>{icon}</span>
      {label}
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
  employeeBands,
  seniority: _seniority,
  departments: _departments,
  selectedCount,
  settingsLoaded = true,
  scoutCompaniesLimit = 1,
  scoutLeadsLimit = 1,
  loadingCompanies,
  loadingMore,
  loadingPeople,
  saving,
  scoutMode = "autopilot",
  companySearchQuery = "",
  onCitiesChange,
  onIndustryToggle,
  onEmployeeBandToggle,
  onSeniorityToggle: _onSeniorityToggle,
  onDepartmentToggle: _onDepartmentToggle,
  onFetchNewCompanies,
  onFetchLeads,
  onSaveCompanies,
  savingCompanies = false,
  showingSaved = false,
  onShowSaved,
  onShowHistory,
  activeSessionTitle = null,
  onAddLeads,
  onScoutMore,
  onLoadMore,
  onRefresh,
  onScoutModeChange,
  onCompanySearchQueryChange,
  onSearchByName,
  isMobileLayout = false,
  filtersCollapsed = false,
  onExpandFilters,
  hideActions = false,
  onFilterPanelChange,
  locationOptions,
  locationScope = "interest",
  onLocationScopeChange,
  verticalScope = "industries",
  onVerticalScopeChange,
  businesses = [],
  onBusinessToggle,
  peopleCities,
  onPeopleCitiesChange,
}: Props) {
  const resolvedLocationOptions = locationOptions ?? defaultLocationOptions();
  const [active, setActive] = useState<ActivePanel>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isSearchMode = scoutMode === "search";
  const searching = Boolean(loadingCompanies || loadingMore || loadingPeople);
  const canScout = settingsLoaded && cities.length > 0 && !searching;
  const canSearch = settingsLoaded && cities.length > 0 && companySearchQuery.trim().length > 0 && !searching;
  const volumeHint = `${scoutCompaniesLimit} cos · ${scoutLeadsLimit}/co`;
  const verticalLabel = verticalScaleLabel(verticalScope, industries, businesses, employeeBands);
  const verticalHasSelection =
    employeeBands.length + (verticalScope === "businesses" ? businesses.length : industries.length) > 0;

  const [mobileSheet, setMobileSheet] = useState<ActivePanel>(null);

  useEffect(() => {
    onFilterPanelChange?.(Boolean(active) || mobileSheet !== null);
  }, [active, mobileSheet, onFilterPanelChange]);


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

  if (isMobileLayout) {
    const isSearchMode = scoutMode === "search";

    if (filtersCollapsed) {
      return (
        <div className="ish-scout-toolbar px-4 py-2">
          <button
            type="button"
            onClick={onExpandFilters}
            className="ish-scout-cluster flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">Filters</p>
              <p className="truncate text-[13px] font-semibold text-brand-ink">
                {cityLabel(cities, resolvedLocationOptions)} · {verticalLabel}
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-brand-ink-faint" />
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="ish-scout-toolbar">
          {isSearchMode ? (
            <div className="px-4 pb-3 pt-2">
              <CompanySearchInput
                value={companySearchQuery}
                onChange={(v) => onCompanySearchQueryChange?.(v)}
                onSearch={() => onSearchByName?.()}
                loading={loadingCompanies}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
            <AutopilotCluster
              mode={scoutMode}
              onModeChange={onScoutModeChange}
              locationScope={locationScope}
              onLocationScopeChange={onLocationScopeChange}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CompactFilterChip
              icon={<MapPin className="size-3.5" />}
              label={cityLabel(cities, resolvedLocationOptions)}
              active={mobileSheet === "city"}
              onClick={() => setMobileSheet("city")}
            />
            <CompactFilterChip
              icon={<Building2 className="size-3.5" />}
              label={verticalLabel}
              active={mobileSheet === "industry"}
              onClick={() => setMobileSheet(cities.length === 0 ? "city" : "industry")}
            />
          </div>
        </div>

        <BottomSheet
          open={mobileSheet === "city"}
          onClose={() => setMobileSheet(null)}
          title="City"
          contentClassName="px-0 py-0"
          footer={
            <MobileSheetPrimaryButton
              label="Continue"
              icon={<ArrowRight className="size-4" />}
              disabled={cities.length === 0}
              onClick={() => setMobileSheet("industry")}
            />
          }
        >
          <MobileCitySheetContent
            cities={cities}
            onCitiesChange={onCitiesChange}
            locationOptions={resolvedLocationOptions}
            locationScope={locationScope}
          />
        </BottomSheet>
        <BottomSheet
          open={mobileSheet === "industry"}
          onClose={() => setMobileSheet(null)}
          title={verticalScope === "businesses" ? "Business & scale" : "Industry & scale"}
          contentClassName="px-0 py-0"
          footer={
            <MobileSheetPrimaryButton
              label="Apply filters"
              onClick={() => setMobileSheet(null)}
            />
          }
        >
          <MobileIndustrySheetContent
            industries={industries}
            onIndustryToggle={onIndustryToggle}
            employeeBands={employeeBands}
            onScaleToggle={onEmployeeBandToggle}
            verticalScope={verticalScope}
            onVerticalScopeChange={onVerticalScopeChange}
            businesses={businesses}
            onBusinessToggle={onBusinessToggle}
          />
        </BottomSheet>
      </>
    );
  }

  function toggle(panel: ActivePanel) {
    setActive((p) => (p === panel ? null : panel));
  }

  return (
    <>
      {active && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setActive(null)}
        />
      )}

      {/* ── Single unified bar ── */}
      <div
        ref={barRef}
        className={cn(
          "ish-scout-toolbar relative flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-2.5",
          active ? "z-50" : "z-30",
        )}
      >
        <AutopilotCluster
          mode={scoutMode}
          onModeChange={(m) => { setActive(null); onScoutModeChange?.(m); }}
          locationScope={locationScope}
          onLocationScopeChange={onLocationScopeChange}
        />

        {/* Thin separator */}
        <div className="ish-scout-rule hidden sm:block" aria-hidden />

        {/* Left cluster: filter pills inside a rounded container */}
        <div className="ish-scout-cluster">
          {/* City pill */}
          <div className="relative">
            <PillSegment
              icon={<MapPin className="size-3.5" />}
              label={locationScope === "focus" ? "Area" : "City"}
              value={cityLabel(cities, resolvedLocationOptions)}
              active={active === "city"}
              hasSelection={cities.length > 0}
              onClick={() => toggle("city")}
            />
            <Popover open={active === "city"} onClose={() => setActive(null)} width="w-[min(420px,calc(100vw-2rem))]">
              <CityPopoverContent
                cities={cities}
                onCitiesChange={onCitiesChange}
                locationOptions={resolvedLocationOptions}
                locationScope={locationScope}
              />
            </Popover>
          </div>

          {/* Divider */}
          <div className="ish-scout-rule mx-0.5" aria-hidden />

          {/* Industry / business pill */}
          <div className="relative">
            <PillSegment
              icon={<Building2 className="size-3.5" />}
              label={verticalScope === "businesses" ? "Business" : "Industry"}
              value={verticalLabel}
              active={active === "industry"}
              hasSelection={verticalHasSelection}
              onClick={() => toggle("industry")}
            />
            <Popover open={active === "industry"} onClose={() => setActive(null)} width="w-[min(440px,calc(100vw-2rem))]">
              <IndustryPopoverContent
                industries={industries}
                onIndustryToggle={onIndustryToggle}
                employeeBands={employeeBands}
                onScaleToggle={onEmployeeBandToggle}
                verticalScope={verticalScope}
                onVerticalScopeChange={onVerticalScopeChange}
                businesses={businesses}
                onBusinessToggle={onBusinessToggle}
              />
            </Popover>
          </div>
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
            className="ish-scout-hint hidden sm:inline"
            title="Scout volume from Settings. Lower saves Tavily/Gemini tokens"
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
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-all duration-150",
              canSearch ? "ish-scout-cta-blue hover:opacity-95" : "ish-scout-cta-muted",
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
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-all duration-150",
              canScout ? "ish-scout-cta-yellow hover:opacity-95" : "ish-scout-cta-muted",
            )}
          >
            <Search className="size-3.5" />
            {loadingCompanies ? "Scouting…" : "Scout"}
          </button>
        )}

        {/* Thin separator */}
        <div className="ish-scout-rule hidden sm:block" aria-hidden />

        {/* Right cluster: context-aware action buttons */}
        {!hideActions ? (
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
                    disabled={loadingMore || cities.length === 0 || showingSaved}
                    label={loadingMore ? "Loading…" : "Load More"}
                  />
                </>
              )}
              {onShowSaved ? (
                <SecondaryBtn
                  onClick={onShowSaved}
                  disabled={loadingCompanies || savingCompanies}
                  icon={<Bookmark className="size-3.5" />}
                  label="Saved"
                  active={showingSaved}
                />
              ) : null}
              {onShowHistory ? (
                <SecondaryBtn
                  onClick={onShowHistory}
                  disabled={loadingCompanies}
                  icon={<History className="size-3.5" />}
                  label="History"
                />
              ) : null}
              {activeSessionTitle && !showingSaved ? (
                <span
                  title={activeSessionTitle}
                  className="hidden max-w-[160px] truncate rounded-full bg-brand-stratus-blue/10 px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-blue lg:inline-block"
                >
                  {activeSessionTitle}
                </span>
              ) : null}
              {onSaveCompanies && selectedCount > 0 && !showingSaved ? (
                <SecondaryBtn
                  onClick={onSaveCompanies}
                  disabled={savingCompanies}
                  icon={<BookmarkPlus className="size-3.5" />}
                  label={savingCompanies ? "Saving…" : "Save companies"}
                />
              ) : null}
              <PrimaryBtn
                onClick={onFetchLeads}
                disabled={selectedCount === 0}
                label={
                  selectedCount > 0
                    ? showingSaved
                      ? `Extract leads · ${selectedCount} ${selectedCount === 1 ? "co." : "cos."}`
                      : `Fetch Leads · ${selectedCount} ${selectedCount === 1 ? "co." : "cos."}`
                    : showingSaved
                      ? "Select companies to extract"
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
        ) : null}
      </div>
    </>
  );
}
