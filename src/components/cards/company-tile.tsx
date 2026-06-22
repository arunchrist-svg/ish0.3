"use client";

import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { MapPin, Users, Check } from "lucide-react";
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
  const scoreColor = getScoreColor(company.giftScore);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => e.key === "Enter" && onView()}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white p-4 transition-all duration-200",
        isPrimary
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : isSelected
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
      )}
    >
      {/* Top row: logo + score */}
      <div className="mb-3.5 flex items-start justify-between">
        {/* Logo (tappable to select) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (selectable) onToggleSelect();
          }}
          disabled={!selectable}
          aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-ish-canvas transition-transform duration-150",
            selectable ? "cursor-pointer active:scale-95" : "cursor-default",
          )}
        >
          <CompanyLogo
            name={company.name}
            domain={company.domain}
            logo={company.logo}
            size="md"
            className="bg-ish-canvas ring-0"
            rounded="rounded-xl"
          />

          {/* Hover overlay hint */}
          {selectable && !isSelected && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/15 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <span className="size-4 rounded-full border-2 border-white" />
            </span>
          )}

          {/* Selected overlay */}
          {isSelected && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-ish-green/20"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-ish-green shadow-sm">
                <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
          )}
        </button>

        {/* Score badge */}
        <div
          className="flex items-baseline gap-0.5 rounded-full px-2.5 py-1"
          style={{ backgroundColor: `${scoreColor}18` }}
        >
          <span className="text-[14px] font-extrabold leading-none" style={{ color: scoreColor }}>
            {company.giftScore}
          </span>
          <span className="text-[8px] font-bold" style={{ color: scoreColor, opacity: 0.7 }}>%</span>
        </div>
      </div>

      {/* Company name + industry */}
      <div className="flex-1">
        <div
          className="mb-1.5 line-clamp-2 text-[14px] font-bold leading-snug text-ish-ink"
          title={company.name}
        >
          {company.name}
        </div>
        <span className="inline-block rounded-full bg-ish-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-ish-ink-soft">
          {company.type}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-0 my-3 h-px bg-ish-border/60" />

      {/* Footer: meta + Select CTA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
          <Users className="size-3 shrink-0" />
          <span>{company.employees}</span>
          <span className="text-ish-border">·</span>
          <MapPin className="size-3 shrink-0" />
          <span className="max-w-[70px] truncate">{company.city}</span>
        </div>

        {selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-150 active:scale-95",
              isSelected
                ? "bg-ish-green text-white shadow-[0_2px_6px_rgba(63,190,130,0.30)]"
                : "border border-ish-border bg-white text-ish-ink-soft hover:border-ish-ink-soft hover:text-ish-ink",
            )}
          >
            {isSelected ? (
              <>
                <Check className="size-3" strokeWidth={2.5} />
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
