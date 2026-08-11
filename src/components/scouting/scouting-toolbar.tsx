"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
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
  GraduationCap,
  Hammer,
  HeartPulse,
  Landmark,
  MapPin,
  Megaphone,
  Package,
  Pill,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/design-system";
import {
  districtGroupsForScoutOptions,
  isScoutDistrictPicked,
  setScoutStateDistricts,
  toggleScoutDistrictPick,
  type ScoutLocationOption,
} from "@/lib/geo/india";
import {
  SCOUT_CITY_GROUPS,
  SCOUT_DEPARTMENTS,
  SCOUT_EMPLOYEE_BANDS,
  SCOUT_INDUSTRIES,
  SCOUT_SENIORITY,
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
  onAddLeads: () => void;
  onScoutMore: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onScoutModeChange?: (mode: ScoutMode) => void;
  onCompanySearchQueryChange?: (query: string) => void;
  onSearchByName?: () => void;
  isMobileLayout?: boolean;
  filtersCollapsed?: boolean;
  onExpandFilters?: () => void;
  hideActions?: boolean;
  onFilterPanelChange?: (open: boolean) => void;
  locationOptions?: ScoutLocationOption[] | { label: string; group: string }[];
};

/* ─────────────────────────────────────────────
   Label helpers
───────────────────────────────────────────── */

function cityLabel(cities: string[]): string {
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 active:scale-[0.97]",
        active
          ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
          : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
      )}
    >
      {icon ? <span className="shrink-0 leading-none">{icon}</span> : null}
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
          ? "bg-white shadow-[0_2px_12px_rgba(20,20,30,0.10)] ring-1 ring-brand-border"
          : "hover:bg-brand-app",
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
        "absolute top-full left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[var(--shadow-brand-float)] transition-all duration-200 origin-top",
        open
          ? "pointer-events-auto scale-100 opacity-100 translate-y-0"
          : "pointer-events-none scale-95 opacity-0 -translate-y-1",
        width ?? "w-[min(360px,calc(100vw-2rem))]",
        className,
      )}
    >
      <div className="relative z-10 bg-white">{children}</div>
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

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Manufacturing: Factory,
  "Real Estate": Building,
  Technology: Cpu,
  "Financial Services": Landmark,
  Healthcare: HeartPulse,
  Retail: ShoppingBag,
  FMCG: Package,
  Construction: Hammer,
  Automotive: Car,
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
          : "bg-brand-yellow-gradient text-brand-black shadow-brand-yellow-sm",
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

function LocationDistrictPicker({
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
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const groups = districtGroupsForScoutOptions(locationOptions);

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
        Set locations in Settings → Enrichment (India, region, state, or district).
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className={cn("border-b border-brand-border", compact ? "px-3 py-2" : "p-3")}>
        <div className="flex items-center gap-2 rounded-full border border-brand-border bg-white px-3 py-2 shadow-[var(--shadow-brand-sm)]">
          <Search className="size-3.5 shrink-0 text-brand-stratus-blue" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search districts or states…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
          />
          {query ? (
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
          ) : null}
        </div>
      </div>

      <div className={cn("overflow-y-auto", compact ? "max-h-[min(52vh,360px)] px-3 py-2" : "max-h-[min(42vh,320px)] p-3")}>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-brand-ink-faint">No districts match.</p>
        ) : (
          filtered.map((group) => {
            const allowedIds = group.districts.map((d) => d.id);
            const selectedCount = group.districts.filter((d) => isScoutDistrictPicked(cities, d)).length;
            const allOn = selectedCount === group.districts.length && group.districts.length > 0;
            const expanded = isExpanded(group.state.id, group.districts.length);
            const selectedNames = group.districts
              .filter((d) => isScoutDistrictPicked(cities, d))
              .map((d) => d.displayName);
            return (
              <div key={group.state.id} className="mb-2 last:mb-0">
                <div className="flex items-center gap-2 rounded-xl bg-brand-canvas/70 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [group.state.id]: expanded }))
                    }
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-brand-ink-faint transition-transform",
                        expanded ? "rotate-0" : "-rotate-90",
                      )}
                    />
                    <span className="truncate text-[11px] font-bold uppercase tracking-widest text-brand-ink">
                      {group.state.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-ink-soft shadow-[var(--shadow-brand-sm)]">
                      {selectedCount}/{group.districts.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCitiesChange(setScoutStateDistricts(cities, group.state.id, !allOn, allowedIds))}
                    className="shrink-0 text-[11px] font-semibold text-brand-stratus-blue"
                  >
                    {allOn ? "Clear" : "All"}
                  </button>
                </div>

                {!expanded ? (
                  <p className="px-8 py-1.5 text-[11px] text-brand-ink-soft">
                    {allOn
                      ? `All ${group.districts.length} districts`
                      : selectedNames.length
                        ? selectedNames.slice(0, 4).join(", ") + (selectedNames.length > 4 ? ` +${selectedNames.length - 4}` : "")
                        : "None selected"}
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 px-1 pb-1">
                    {group.districts.map((district) => {
                      const selected = isScoutDistrictPicked(cities, district);
                      return (
                        <button
                          key={district.id}
                          type="button"
                          onClick={() => onCitiesChange(toggleScoutDistrictPick(cities, district.id, allowedIds))}
                          aria-pressed={selected}
                          title={
                            district.name.toLowerCase() !== district.displayName.toLowerCase()
                              ? district.name
                              : undefined
                          }
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-all duration-150",
                            selected
                              ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
                              : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                          )}
                        >
                          {district.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cities.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-border bg-brand-app/60 px-3 py-2">
          {cities.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
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
      ) : null}
    </div>
  );
}

function MobileCitySheetContent({
  cities,
  onCitiesChange,
  locationOptions,
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
}) {
  return (
    <LocationDistrictPicker
      cities={cities}
      onCitiesChange={onCitiesChange}
      locationOptions={locationOptions}
      compact
    />
  );
}

function MobileIndustrySheetContent({
  industries,
  onIndustryToggle,
  employeeBands,
  onScaleToggle,
}: {
  industries: string[];
  onIndustryToggle: (i: string) => void;
  employeeBands: string[];
  onScaleToggle: (bandId: string) => void;
}) {
  return (
    <div className="flex flex-col px-1 py-2">
      <div className="mb-3">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
          Industries
        </p>
        <div className="grid grid-cols-2 gap-2 px-3">
          {SCOUT_INDUSTRIES.map((ind) => {
            const Icon = INDUSTRY_ICONS[ind] ?? Building2;
            return (
              <MobileFilterGridChip
                key={ind}
                icon={<Icon className="size-4" />}
                label={ind}
                selected={industries.includes(ind)}
                onClick={() => onIndustryToggle(ind)}
              />
            );
          })}
        </div>
      </div>
      <div className="mb-2">
        <div className="mb-1.5 flex items-center justify-between px-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
            Scale
          </p>
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
        <div className="grid grid-cols-1 gap-1.5 px-3 sm:grid-cols-2">
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
    <div className="flex flex-col px-1 py-2">
      <div className="mb-2 flex items-center justify-between px-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
          People filters
        </p>
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

      <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
        Seniority
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2.5 px-3">
        {SCOUT_SENIORITY.map((s) => {
          const Icon = SENIORITY_ICONS[s] ?? Users;
          return (
            <MobileFilterGridChip
              key={s}
              size="lg"
              icon={<Icon className="size-5" />}
              label={s}
              selected={seniority.includes(s)}
              onClick={() => onSeniorityToggle(s)}
            />
          );
        })}
      </div>

      <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
        Department
      </p>
      <div className="grid grid-cols-2 gap-2.5 px-3">
        {SCOUT_DEPARTMENTS.map((d) => {
          const Icon = DEPARTMENT_ICONS[d] ?? Users;
          return (
            <MobileFilterGridChip
              key={d}
              size="lg"
              icon={<Icon className="size-5" />}
              label={d}
              selected={departments.includes(d)}
              onClick={() => onDepartmentToggle(d)}
            />
          );
        })}
      </div>
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
}: {
  cities: string[];
  onCitiesChange: (c: string[]) => void;
  locationOptions: Array<{ label: string; group?: string; kind?: ScoutLocationOption["kind"] }>;
}) {
  return (
    <LocationDistrictPicker
      cities={cities}
      onCitiesChange={onCitiesChange}
      locationOptions={locationOptions}
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
}: {
  industries: string[];
  onIndustryToggle: (i: string) => void;
  employeeBands: string[];
  onScaleToggle: (bandId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const filtered = SCOUT_INDUSTRIES.filter(
    (ind) => !q || ind.toLowerCase().includes(q),
  );
  const selectedScales = SCOUT_EMPLOYEE_BANDS.filter((b) => employeeBands.includes(b.id));
  const hasFooter = industries.length > 0 || selectedScales.length > 0;

  return (
    <div className="flex flex-col">
      <div className="border-b border-brand-border p-3">
        <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-app px-3 py-2">
          <Search className="size-3.5 shrink-0 text-brand-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search industry…"
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

      <div className="max-h-[min(70vh,440px)] overflow-y-auto p-3">
        <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
          Industry
        </p>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-brand-ink-faint">No industries match.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((ind) => {
              const Icon = INDUSTRY_ICONS[ind] ?? Building2;
              const selected = industries.includes(ind);
              return (
                <button
                  key={ind}
                  type="button"
                  onClick={() => onIndustryToggle(ind)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150",
                    selected
                      ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
                      : "bg-brand-app text-brand-ink-soft hover:bg-brand-border hover:text-brand-ink",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {ind}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
              Scale
            </p>
            {employeeBands.length > 0 ? (
              <button
                type="button"
                onClick={() => employeeBands.forEach(onScaleToggle)}
                className="text-[11px] font-semibold text-brand-ink-faint hover:text-brand-ink"
              >
                Any scale
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
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

      {hasFooter && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-border bg-brand-app/60 px-3 py-2.5">
          {industries.map((ind) => (
            <span
              key={ind}
              className="flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
            >
              {ind}
              <button
                type="button"
                onClick={() => onIndustryToggle(ind)}
                className="disabled:opacity-40"
                aria-label={`Remove ${ind}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {selectedScales.map((band) => (
            <span
              key={band.id}
              className="flex items-center gap-1 rounded-full border border-brand-stratus-blue/30 bg-brand-stratus-blue/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
            >
              {band.label}
              <button
                type="button"
                onClick={() => onScaleToggle(band.id)}
                aria-label={`Remove ${band.label}`}
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
    <div className="flex flex-col">
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
            People Filters
          </p>
          {hasAny && (
            <button
              type="button"
              onClick={() => {
                [...seniority].forEach((s) => onSeniorityToggle(s));
                [...departments].forEach((d) => onDepartmentToggle(d));
              }}
              className="text-[11px] font-semibold text-brand-ink-faint hover:text-brand-ink"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
            Seniority
          </p>
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
            Department
          </p>
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </div>
      </div>

      {hasAny && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-border bg-brand-app/60 px-3 py-2.5">
          {seniority.map((s) => (
            <span
              key={`seniority-${s}`}
              className="flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
            >
              {s}
              <button
                type="button"
                onClick={() => onSeniorityToggle(s)}
                className="text-brand-ink/70 hover:text-brand-ink"
                aria-label={`Remove ${s}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {departments.map((d) => (
            <span
              key={`department-${d}`}
              className="flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
            >
              {d}
              <button
                type="button"
                onClick={() => onDepartmentToggle(d)}
                className="text-brand-ink/70 hover:text-brand-ink"
                aria-label={`Remove ${d}`}
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
    <div className="flex items-center rounded-full border border-brand-border bg-brand-app/60 p-1 shadow-[var(--shadow-brand-sm)]">
      <button
        type="button"
        onClick={() => onChange("autopilot")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-all duration-150",
          mode === "autopilot"
            ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
            : "text-brand-ink-soft hover:text-brand-ink",
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
            ? "bg-brand-ink text-white shadow-[var(--shadow-brand)]"
            : "text-brand-ink-soft hover:text-brand-ink",
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
    <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-brand-border bg-white px-3.5 py-2 shadow-[var(--shadow-brand-sm)]">
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
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-border bg-white px-4 py-2 text-[12.5px] font-semibold text-brand-ink shadow-[var(--shadow-brand-sm)] transition-all hover:bg-brand-canvas active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
        "flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.97]",
        !disabled && color === "yellow" &&
          "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)] hover:opacity-90",
        !disabled && color === "green" &&
          "bg-brand-green text-white shadow-[0_2px_8px_rgba(63,190,130,0.35)] hover:opacity-90",
        disabled && "cursor-not-allowed bg-brand-canvas text-brand-ink-faint",
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
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-[0.97]",
        active
          ? "border-brand-stratus-yellow/50 bg-white text-brand-ink shadow-brand-sm"
          : "border-brand-border/60 bg-white/80 text-brand-ink-soft shadow-brand-sm",
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
  onEmployeeBandToggle,
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
  isMobileLayout = false,
  filtersCollapsed = false,
  onExpandFilters,
  hideActions = false,
  onFilterPanelChange,
  locationOptions,
}: Props) {
  const resolvedLocationOptions = locationOptions ?? defaultLocationOptions();
  const [active, setActive] = useState<ActivePanel>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isSearchMode = scoutMode === "search";
  const canScout = settingsLoaded && cities.length > 0 && !loadingCompanies;
  const canSearch = settingsLoaded && cities.length > 0 && companySearchQuery.trim().length > 0 && !loadingCompanies;
  const volumeHint = `${scoutCompaniesLimit} cos · ${scoutLeadsLimit} leads`;

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
        <div className="border-b border-brand-border/40 bg-white/70 px-4 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={onExpandFilters}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-brand-border/50 bg-white/90 px-3.5 py-2.5 text-left shadow-brand-sm active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">Filters</p>
              <p className="truncate text-[13px] font-semibold text-brand-ink">
                {cityLabel(cities)} · {industryScaleLabel(industries, employeeBands)}
                {!isSearchMode && seniority.length + departments.length > 0
                  ? ` · ${peopleLabel(seniority, departments)}`
                  : ""}
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-brand-ink-faint" />
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="border-b border-brand-border/40 bg-white/70 backdrop-blur-xl">
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
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CompactFilterChip
              icon={<MapPin className="size-3.5" />}
              label={cityLabel(cities)}
              active={mobileSheet === "city"}
              onClick={() => setMobileSheet("city")}
            />
            <CompactFilterChip
              icon={<Building2 className="size-3.5" />}
              label={industryScaleLabel(industries, employeeBands)}
              active={mobileSheet === "industry"}
              onClick={() => setMobileSheet(cities.length === 0 ? "city" : "industry")}
            />
            {!isSearchMode ? (
              <CompactFilterChip
                icon={<Users className="size-3.5" />}
                label={peopleLabel(seniority, departments)}
                active={mobileSheet === "people"}
                onClick={() => {
                  if (cities.length === 0) setMobileSheet("city");
                  else setMobileSheet("people");
                }}
              />
            ) : null}
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
          <MobileCitySheetContent cities={cities} onCitiesChange={onCitiesChange} locationOptions={resolvedLocationOptions} />
        </BottomSheet>
        <BottomSheet
          open={mobileSheet === "industry"}
          onClose={() => setMobileSheet(null)}
          title="Industry & scale"
          contentClassName="px-0 py-0"
          footer={
            <MobileSheetPrimaryButton
              label={isSearchMode ? "Apply filters" : "Continue"}
              icon={isSearchMode ? undefined : <ArrowRight className="size-4" />}
              onClick={() => setMobileSheet(isSearchMode ? null : "people")}
            />
          }
        >
          <MobileIndustrySheetContent
            industries={industries}
            onIndustryToggle={onIndustryToggle}
            employeeBands={employeeBands}
            onScaleToggle={onEmployeeBandToggle}
          />
        </BottomSheet>
        {!isSearchMode ? (
          <BottomSheet
            open={mobileSheet === "people"}
            onClose={() => setMobileSheet(null)}
            title="People"
            contentClassName="px-0 py-0"
            footer={
              <MobileSheetPrimaryButton
                label="Apply filters"
                onClick={() => setMobileSheet(null)}
              />
            }
          >
            <MobilePeopleSheetContent
              seniority={seniority}
              departments={departments}
              onSeniorityToggle={onSeniorityToggle}
              onDepartmentToggle={onDepartmentToggle}
            />
          </BottomSheet>
        ) : null}
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
          "relative flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-brand-border bg-white px-4 py-2.5",
          active ? "z-50" : "z-30",
        )}
      >
        {/* Mode toggle: Autopilot / Search */}
        <ModeToggle
          mode={scoutMode}
          onChange={(m) => { setActive(null); onScoutModeChange?.(m); }}
        />

        {/* Thin separator */}
        <div className="mx-1 hidden h-6 w-px bg-brand-border sm:block" aria-hidden />

        {/* Left cluster: filter pills inside a rounded container */}
        <div className="flex items-center rounded-full border border-brand-border bg-brand-app/60 p-1 shadow-[var(--shadow-brand-sm)]">
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
            <Popover open={active === "city"} onClose={() => setActive(null)} width="w-[min(420px,calc(100vw-2rem))]">
              <CityPopoverContent cities={cities} onCitiesChange={onCitiesChange} locationOptions={resolvedLocationOptions} />
            </Popover>
          </div>

          {/* Divider */}
          <div className="mx-0.5 h-6 w-px bg-brand-border" aria-hidden />

          {/* Industry pill */}
          <div className="relative">
            <PillSegment
              icon={<Building2 className="size-3.5" />}
              label="Industry"
              value={industryScaleLabel(industries, employeeBands)}
              active={active === "industry"}
              hasSelection={industries.length + employeeBands.length > 0}
              onClick={() => toggle("industry")}
            />
            <Popover open={active === "industry"} onClose={() => setActive(null)} width="w-[400px]">
              <IndustryPopoverContent
                industries={industries}
                onIndustryToggle={onIndustryToggle}
                employeeBands={employeeBands}
                onScaleToggle={onEmployeeBandToggle}
              />
            </Popover>
          </div>

          {/* People pill — Autopilot only */}
          {!isSearchMode && (
            <>
              <div className="mx-0.5 h-6 w-px bg-brand-border" aria-hidden />
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
            className="hidden rounded-full bg-brand-app px-2.5 py-1 text-[10px] font-medium text-brand-ink-soft sm:inline"
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
                ? "bg-brand-ink text-white shadow-[var(--shadow-brand)] hover:opacity-90"
                : "cursor-not-allowed bg-brand-app text-brand-ink-faint",
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
                ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)] hover:opacity-90"
                : "cursor-not-allowed bg-brand-app text-brand-ink-faint",
            )}
          >
            <Search className="size-3.5" />
            {loadingCompanies ? "Scouting…" : "Scout"}
          </button>
        )}

        {/* Thin separator */}
        <div className="mx-1 hidden h-6 w-px bg-brand-border sm:block" aria-hidden />

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
        ) : null}
      </div>
    </>
  );
}
