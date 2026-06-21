"use client";

import { cn } from "@/lib/utils";
import { ScoreGauge } from "@/design-system";
import { Users, MapPin } from "lucide-react";
import type { Company } from "@/lib/scouting-data";

type Props = {
  company: Company;
  isSelected: boolean;
  isPrimary: boolean;
  onToggleSelect: () => void;
  onView: () => void;
};

export function CompanyTile({ company, isSelected, isPrimary, onToggleSelect, onView }: Props) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[18px] bg-white text-left transition-all duration-200",
        isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
        isSelected && !isPrimary && "ring-2 ring-ish-green",
      )}
    >
      {/* Top row: checkbox + score */}
      <button
        type="button"
        onClick={onToggleSelect}
        className="flex w-full items-center justify-between px-4 pt-3.5 pb-2"
        aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            isSelected
              ? "border-ish-green bg-ish-green"
              : "border-ish-border bg-white",
          )}
        >
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <ScoreGauge score={company.giftScore} size="sm" background />
      </button>

      {/* Main content */}
      <button
        type="button"
        onClick={onView}
        className="w-full cursor-pointer px-4 pb-4 pt-1 text-left"
        aria-label={`View ${company.name}`}
      >
        {/* Logo in a soft circle */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-ish-app text-2xl leading-none">
            {company.logo}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-[13.5px] font-bold leading-tight text-ish-ink">
              {company.name}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-ish-ink-soft">{company.type}</div>
          </div>
        </div>

        {/* Divider */}
        <div className="mb-2.5 h-px bg-ish-border/60" />

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[11px] text-ish-ink-faint">
          <span className="flex items-center gap-1">
            <Users className="size-3 shrink-0" />
            {company.employees}
          </span>
          <span className="text-ish-border">·</span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            {company.city}
          </span>
        </div>
      </button>
    </div>
  );
}
