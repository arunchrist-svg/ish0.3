"use client";

import { cn } from "@/lib/utils";
import { ScoreGauge } from "@/design-system";
import { Users, MapPin, Check } from "lucide-react";
import type { Company } from "@/lib/scouting-data";
import { CompanyLogo } from "@/components/company/company-logo";

type Props = {
  company: Company;
  isSelected: boolean;
  isPrimary: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  selectable?: boolean;
};

export function CompanyTile({
  company,
  isSelected,
  isPrimary,
  onToggleSelect,
  onView,
  selectable = true,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => e.key === "Enter" && onView()}
      className={cn(
        "group relative flex min-h-[172px] cursor-pointer flex-col overflow-hidden rounded-[20px] bg-white p-4 transition-all duration-200",
        isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
        isSelected && !isPrimary && "ring-2 ring-ish-green",
      )}
    >
      {/* Top row: logo (select overlay) + score badge */}
      <div className="mb-3 flex items-start justify-between">
        {/* Logo with Google-Photos-style selection overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (selectable) onToggleSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              if (selectable) onToggleSelect();
            }
          }}
          disabled={!selectable}
          aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-ish-app text-[26px] leading-none",
            selectable ? "cursor-pointer" : "cursor-default",
          )}
        >
          <CompanyLogo
            name={company.name}
            domain={company.domain}
            logo={company.logo}
            size="md"
            className="bg-ish-app ring-0"
            rounded="rounded-[12px]"
          />

          {/* Hover hint: empty white ring */}
          {selectable && !isSelected && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <span className="size-5 rounded-full border-2 border-white" />
            </span>
          )}

          {/* Selected: green checkmark */}
          {isSelected && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/20"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-ish-green">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
          )}
        </button>

        <ScoreGauge score={company.giftScore} size="sm" background />
      </div>

      {/* Body */}
      <div className="flex-1">
        <div
          className="mb-1.5 line-clamp-2 text-[13.5px] font-bold leading-snug text-ish-ink"
          title={company.name}
        >
          {company.name}
        </div>
        <span className="inline-block rounded-full bg-ish-app px-2.5 py-0.5 text-[11px] font-medium text-ish-ink-soft">
          {company.type}
        </span>
      </div>

      {/* Bottom row: meta left + Select CTA right */}
      <div className="mt-3 flex items-center justify-between border-t border-ish-border/50 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
          <Users className="size-3 shrink-0" />
          <span>{company.employees}</span>
          <span className="text-ish-border">·</span>
          <MapPin className="size-3 shrink-0" />
          <span className="max-w-[80px] truncate">{company.city}</span>
        </div>

        {selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onToggleSelect();
              }
            }}
            aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
              isSelected
                ? "bg-ish-green text-white"
                : "border border-ish-border bg-white text-ish-ink-soft hover:border-ish-ink-soft hover:text-ish-ink",
            )}
          >
            {isSelected ? (
              <>
                <Check className="size-3" />
                Selected
              </>
            ) : (
              "Select"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
