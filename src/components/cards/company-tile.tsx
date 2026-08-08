"use client";

import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { MapPin, Users, Check, ChevronRight } from "lucide-react";
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
  compact?: boolean;
};

export function CompanyTile({
  company,
  isSelected,
  isPrimary,
  onToggleSelect,
  onView,
  selectable = true,
  compact = false,
}: Props) {
  const scoreColor = getScoreColor(company.fitScore);

  function handleCardClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-card-action]")) return;
    if (compact) {
      if (selectable) onToggleSelect();
      return;
    }
    onView();
    if (selectable) onToggleSelect();
  }

  function handleSelectClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectable) return;
    onToggleSelect();
    if (!compact) onView();
  }

  function handleDetailsClick(e: React.MouseEvent) {
    e.stopPropagation();
    onView();
  }

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCardClick(e as unknown as React.MouseEvent);
        }}
        className={scoutCardSurface({
          isSelected,
          isPrimary: false,
          layout: "column",
          className: "min-h-[148px] p-3 text-left",
        })}
      >
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-canvas">
            <CompanyLogo
              name={company.name}
              domain={company.domain}
              logo={company.logo}
              size="sm"
              className="bg-brand-canvas ring-0"
              rounded="rounded-lg"
            />
          </div>
          <div className="flex items-center gap-1">
            <div
              className="flex items-baseline gap-0.5 rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${scoreColor}18` }}
            >
              <span className="text-[12px] font-extrabold leading-none" style={{ color: scoreColor }}>
                {company.fitScore}
              </span>
            </div>
            <button
              type="button"
              data-card-action
              onClick={handleDetailsClick}
              className="flex size-7 items-center justify-center rounded-full bg-white/90 text-brand-ink-soft shadow-sm ring-1 ring-brand-border/50 active:scale-95"
              aria-label={`View ${company.name}`}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-brand-ink">{company.name}</div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-brand-ink-soft">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{company.city}</span>
          </div>
          <span className="mt-1.5 inline-block max-w-full truncate rounded-full bg-brand-canvas px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-ink-soft">
            {company.type}
          </span>
        </div>
        {selectable ? (
          <div
            className={cn(
              "mt-2.5 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-semibold transition-colors",
              isSelected
                ? "border-brand-stratus-blue/35 bg-brand-stratus-blue/10 text-brand-stratus-blue"
                : "border-brand-border/60 bg-white/70 text-brand-ink-soft",
            )}
          >
            {isSelected ? (
              <>
                <Check className="size-3.5" strokeWidth={2.5} />
                Selected
              </>
            ) : (
              "Tap to select"
            )}
          </div>
        ) : null}
      </div>
    );
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
          className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-white/80 text-brand-ink shadow-sm"
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      )}

      <div className="mb-3.5 flex items-start justify-between">
        <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-canvas">
          <CompanyLogo
            name={company.name}
            domain={company.domain}
            logo={company.logo}
            size="md"
            className="bg-brand-canvas ring-0"
            rounded="rounded-xl"
          />
        </div>

        <div
          className="flex items-baseline gap-0.5 rounded-full px-2.5 py-1"
          style={{ backgroundColor: `${scoreColor}18` }}
        >
          <span className="text-[14px] font-extrabold leading-none" style={{ color: scoreColor }}>
            {company.fitScore}
          </span>
          <span className="text-[8px] font-bold" style={{ color: scoreColor, opacity: 0.7 }}>%</span>
        </div>
      </div>

      <div className="flex-1">
        <div
          className="mb-1.5 line-clamp-2 text-[14px] font-bold leading-snug text-brand-ink"
          title={company.name}
        >
          {company.name}
        </div>
        <span className="inline-block rounded-full bg-brand-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-brand-ink-soft">
          {company.type}
        </span>
      </div>

      <div className="mx-0 my-3 h-px bg-brand-border/60" />

      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-brand-ink-faint">
        <Users className="size-3 shrink-0" />
        <span>{company.employees}</span>
        <span className="text-brand-border">·</span>
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
              ? "text-brand-ink"
              : "border border-brand-border/80 bg-white/60 text-brand-ink-soft hover:border-brand-ink-soft hover:text-brand-ink",
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
