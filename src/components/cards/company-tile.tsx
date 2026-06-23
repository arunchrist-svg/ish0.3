"use client";

import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { MapPin, Users, Check } from "lucide-react";
import type { Company } from "@/lib/scouting-data";
import { CompanyLogo } from "@/components/company/company-logo";
import { scoutCardSurface } from "./scout-card-surface";

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

  function handleCardClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-card-action]")) return;
    onView();
    if (selectable) onToggleSelect();
  }

  function handleSelectClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectable) return;
    onToggleSelect();
    onView();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleCardClick(e as unknown as React.MouseEvent);
      }}
      className={scoutCardSurface({ isSelected, isPrimary, layout: "column", className: "p-4" })}
    >
      {isSelected && selectable && (
        <span
          aria-hidden
          className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-white/80 text-ish-ink shadow-sm"
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      )}

      <div className="mb-3.5 flex items-start justify-between">
        <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-ish-canvas">
          <CompanyLogo
            name={company.name}
            domain={company.domain}
            logo={company.logo}
            size="md"
            className="bg-ish-canvas ring-0"
            rounded="rounded-xl"
          />
        </div>

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

      <div className="mx-0 my-3 h-px bg-ish-border/60" />

      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-ish-ink-faint">
        <Users className="size-3 shrink-0" />
        <span>{company.employees}</span>
        <span className="text-ish-border">·</span>
        <MapPin className="size-3 shrink-0" />
        <span className="max-w-[120px] truncate">{company.city}</span>
      </div>

      {selectable && (
        <button
          type="button"
          data-card-action
          data-selected={isSelected ? "true" : "false"}
          onClick={handleSelectClick}
          aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
          className={cn(
            "ish-scout-select-cta flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold transition-all active:scale-[0.98]",
            isSelected
              ? "text-ish-ink"
              : "border border-ish-border/80 bg-white/60 text-ish-ink-soft hover:border-ish-ink-soft hover:text-ish-ink",
          )}
        >
          {isSelected ? (
            <>
              <Check className="size-3.5" strokeWidth={2.5} />
              Selected
            </>
          ) : (
            "Select"
          )}
        </button>
      )}
    </div>
  );
}
