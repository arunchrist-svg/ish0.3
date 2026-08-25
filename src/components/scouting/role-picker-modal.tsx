"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterAllClear } from "@/design-system";
import { assessPeopleFetchRisk, peopleAndFilterWarning } from "@/lib/enrichment/people-role-filter";
import { SCOUT_SENIORITY, SCOUT_DEPARTMENTS, type ScoutVerticalScope } from "@/lib/scouting-data";
import type { ScoutLocationScope } from "@/lib/geo/india";
import {
  FESTIVE_SWEETS_BUYER_DEPARTMENTS,
  festiveSweetsBuyerGuidance,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";

export function RolePickerModal({
  initialSeniority = [],
  initialDepartments = [],
  initialPeopleCities = [],
  platformIntent,
  verticalScope,
  onConfirm,
  onSkip,
  onClose,
}: {
  initialSeniority?: string[];
  initialDepartments?: string[];
  initialPeopleCities?: string[];
  platformIntent?: PlatformIntent | null;
  verticalScope?: ScoutVerticalScope;
  onConfirm: (seniority: string[], departments: string[], peopleCities: string[]) => void;
  onSkip: () => void;
  /** Dismiss without fetching (Cancel / X). Falls back to onSkip behavior only if omitted. */
  onClose?: () => void;
}) {
  const [chosenSeniority, setChosenSeniority] = useState<string[]>(initialSeniority);
  const [chosenDepts, setChosenDepts] = useState<string[]>(initialDepartments);

  const isBusiness = verticalScope === "businesses";
  const sweetsGuidance = festiveSweetsBuyerGuidance(platformIntent, isBusiness ? "business" : "industry");
  const dismiss = onClose ?? onSkip;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  function toggleSeniority(s: string) {
    setChosenSeniority((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function toggleDept(d: string) {
    setChosenDepts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const hasSelection = chosenSeniority.length > 0 || chosenDepts.length > 0;
  const andWarning = peopleAndFilterWarning(chosenSeniority, chosenDepts, [], {
    searchKind: isBusiness ? "business" : "industry",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,24,36,0.42)] backdrop-blur-[3px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className="ish-role-picker relative mx-4 w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-picker-title"
      >
        <div className="ish-role-picker-head relative px-6 py-4 pr-14">
          <p id="role-picker-title" className="text-[16px] font-bold tracking-tight text-brand-ink">
            Who are you looking for?
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-brand-ink-soft">
            {sweetsGuidance ??
              "Pick seniority or department. Matching both is stricter and often returns nobody."}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-brand-ink-soft transition hover:bg-black/[0.05] hover:text-brand-ink"
            aria-label="Cancel"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {!isBusiness ? (
            <>
              <div>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
                    Seniority
                  </p>
                  <FilterAllClear
                    label="Seniority selection"
                    allSelected={chosenSeniority.length === SCOUT_SENIORITY.length}
                    noneSelected={chosenSeniority.length === 0}
                    onAll={() => setChosenSeniority([...SCOUT_SENIORITY])}
                    onClear={() => setChosenSeniority([])}
                  />
                </div>
                <div className="ish-scout-chip-grid">
                  {SCOUT_SENIORITY.map((s) => {
                    const active = chosenSeniority.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSeniority(s)}
                        className={cn(
                          "ish-scout-filter-chip",
                          active ? "ish-role-picker-chip-on-yellow" : "ish-scout-chip-off",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-brand-ink-faint">
                    Department
                  </p>
                  <FilterAllClear
                    label="Department selection"
                    allSelected={chosenDepts.length === SCOUT_DEPARTMENTS.length}
                    noneSelected={chosenDepts.length === 0}
                    onAll={() => setChosenDepts([...SCOUT_DEPARTMENTS])}
                    onClear={() => setChosenDepts([])}
                  />
                </div>
                <div className="ish-scout-chip-grid">
                  {SCOUT_DEPARTMENTS.map((d) => {
                    const active = chosenDepts.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDept(d)}
                        className={cn(
                          "ish-scout-filter-chip",
                          active ? "ish-role-picker-chip-on-blue" : "ish-scout-chip-off",
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          {sweetsGuidance && !isBusiness ? (
            <button
              type="button"
              onClick={() => {
                setChosenSeniority([]);
                setChosenDepts([...FESTIVE_SWEETS_BUYER_DEPARTMENTS]);
              }}
              className="ish-role-picker-recommend px-3.5 py-2.5 text-left text-[12px] font-semibold"
            >
              Use recommended: HR + Procurement
            </button>
          ) : null}
          {isBusiness ? (
            <button
              type="button"
              onClick={() => {
                setChosenSeniority([]);
                setChosenDepts([]);
                onConfirm([], [], []);
              }}
              className="ish-role-picker-recommend px-3.5 py-2.5 text-left text-[12px] font-semibold"
            >
              Use local seniors for this area
            </button>
          ) : null}

          {andWarning ? (
            <p className="ish-role-picker-warn px-3.5 py-2.5 text-[12px] leading-snug">{andWarning}</p>
          ) : null}
        </div>

        <div className="ish-role-picker-foot flex items-center justify-between gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] font-semibold text-brand-ink-soft hover:text-brand-ink"
          >
            Skip, find any role
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(chosenSeniority, chosenDepts, [...initialPeopleCities]);
            }}
            disabled={!hasSelection && !isBusiness}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-5 py-2 text-[12.5px] font-bold transition-all duration-150",
              hasSelection || isBusiness
                ? "ish-role-picker-cta hover:opacity-95"
                : "ish-role-picker-cta-muted",
            )}
          >
            Find Decision-Makers →
          </button>
        </div>
      </div>
    </div>
  );
}

export function FetchLeadsRiskModal({
  companyCount,
  cities,
  seniority,
  departments,
  searchKind,
  locationScope,
  onCancel,
  onUseSuggestedFilters,
  onFetchWithoutFilters,
  onFetchAnyway,
}: {
  companyCount: number;
  cities: string[];
  seniority: string[];
  departments: string[];
  searchKind?: ScoutVerticalScope;
  locationScope?: ScoutLocationScope;
  onCancel: () => void;
  onUseSuggestedFilters: (() => void) | null;
  onFetchWithoutFilters: () => void;
  onFetchAnyway: () => void;
}) {
  const risk = assessPeopleFetchRisk({
    companyCount,
    cities,
    seniority,
    departments,
    searchKind: searchKind === "businesses" ? "business" : "industry",
    locationScope: locationScope === "focus" ? "focus" : "interest",
  });
  const senLabel = seniority.join(", ");
  const deptLabel = departments.join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,24,36,0.42)] backdrop-blur-[3px]">
      <div className="ish-role-picker mx-4 w-full max-w-md">
        <div className="ish-role-picker-head px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--brand-stratus-yellow-rgb),0.35)] text-brand-ink">
              <TriangleAlert className="size-4" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-brand-ink">{risk.headline}</p>
              <p className="mt-1 text-[12px] leading-snug text-brand-ink-soft">{risk.costLine}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-6 py-5">
          <p className="text-[13px] leading-snug text-brand-ink">{risk.emptyRiskLine}</p>
          {risk.suggestionLine ? (
            <p className="rounded-xl bg-[rgba(var(--brand-stratus-blue-rgb),0.12)] px-3 py-2 text-[12px] leading-snug text-brand-ink shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.22)]">
              {risk.suggestionLine}
            </p>
          ) : null}
          <p className="rounded-xl bg-[rgba(255,255,255,0.7)] px-3 py-2 text-[12px] leading-snug text-brand-ink-soft shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.12)]">
            Your filters: {senLabel} + {deptLabel}. Too many seniority and department chips at once often matches
            nobody.
          </p>
        </div>
        <div className="ish-role-picker-foot flex flex-col gap-2 px-6 py-4">
          {risk.suggestedFilters && onUseSuggestedFilters ? (
            <button
              type="button"
              onClick={onUseSuggestedFilters}
              className="rounded-full border border-[rgba(var(--brand-stratus-blue-rgb),0.28)] bg-[rgba(var(--brand-stratus-blue-rgb),0.12)] px-4 py-2.5 text-[12.5px] font-bold text-brand-ink hover:bg-[rgba(var(--brand-stratus-blue-rgb),0.18)]"
            >
              Use suggested filters and fetch
            </button>
          ) : null}
          <button
            type="button"
            onClick={onFetchWithoutFilters}
            className="ish-role-picker-cta rounded-full px-4 py-2.5 text-[12.5px] font-bold hover:opacity-95"
          >
            Fetch with no People filters
          </button>
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-[12px] font-semibold text-brand-ink-soft hover:text-brand-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onFetchAnyway}
              className="text-[12px] font-semibold text-brand-stratus-blue hover:opacity-90"
            >
              Keep my filters and fetch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
