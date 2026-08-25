"use client";

import { cn, displayPersonTitle, isBlankPersonField, personLinkedInHref } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { Check } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { COMPANIES } from "@/lib/scouting-data";
import { IshAvatar } from "@/design-system";
import { scoutCardSurface } from "./scout-card-surface";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";

type Props = {
  person: Person;
  index: number;
  isSelected: boolean;
  isPrimary: boolean;
  onCheckboxClick: (e: React.MouseEvent) => void;
  onTileClick: () => void;
  selectable?: boolean;
  /** Narrow rail / Accounts detail: stacked actions, no badge collisions. */
  compact?: boolean;
};

export function PersonTile({
  person,
  index,
  isSelected,
  isPrimary,
  onCheckboxClick,
  onTileClick,
  selectable = true,
  compact = false,
}: Props) {
  const scoreColor = getScoreColor(person.matchScore);
  const companyName = COMPANIES.find((c) => c.id === person.companyId)?.name;
  const linkedIn = personLinkedInHref({
    linkedIn: person.linkedIn,
    name: person.name,
    companyName,
  });
  const roleLine = [person.department, person.seniority].filter((value) => !isBlankPersonField(value)).join(" · ");

  function handleRowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-card-action]")) return;
    onTileClick();
  }

  function handleSelectClick(e: React.MouseEvent) {
    e.stopPropagation();
    onCheckboxClick(e);
  }

  const linkedInButton = (
    <a
      href={linkedIn.href}
      target="_blank"
      rel="noopener noreferrer"
      data-card-action
      onClick={(e) => e.stopPropagation()}
      aria-label={linkedIn.hasProfile ? `Open ${person.name} on LinkedIn` : `Search LinkedIn for ${person.name}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-[#0A66C2] text-white transition-opacity hover:opacity-90 active:scale-95",
        compact ? "size-7" : "size-8",
      )}
    >
      <LinkedInGlyph className={compact ? "size-3" : "size-3.5"} />
    </a>
  );

  const selectButton = selectable ? (
    <button
      type="button"
      data-card-action
      data-selected={isSelected ? "true" : "false"}
      onClick={handleSelectClick}
      aria-label={isSelected ? "Deselect" : "Select"}
      className={cn(
        "ish-scout-select-cta flex shrink-0 items-center gap-1 rounded-full font-semibold transition-all active:scale-95",
        compact ? "px-2.5 py-1 text-[10.5px]" : "px-3 py-1.5 text-[11px]",
        isSelected
          ? "text-brand-ink"
          : "border border-brand-border bg-white/60 text-brand-ink-soft hover:border-brand-ink-soft hover:text-brand-ink",
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
  ) : null;

  const scorePill = (
    <div
      className={cn(
        "flex shrink-0 items-baseline gap-0.5 rounded-full",
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
      )}
      style={{ backgroundColor: `${scoreColor}18` }}
      title={person.matchScoreReason}
    >
      <span
        className={cn("font-extrabold leading-none", compact ? "text-[12px]" : "text-[13px]")}
        style={{ color: scoreColor }}
      >
        {person.matchScore}
      </span>
      <span className="text-[8px] font-bold" style={{ color: scoreColor, opacity: 0.7 }}>
        %
      </span>
    </div>
  );

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick(e as unknown as React.MouseEvent);
          }
        }}
        className={scoutCardSurface({
          isSelected,
          isPrimary,
          layout: "column",
          className: "gap-0 px-3.5 py-3 text-left",
        })}
      >
        <div className="flex items-start gap-3">
          <IshAvatar name={person.name} index={index} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold text-brand-ink">{person.name}</span>
                  {person.isKeyDecisionMaker ? (
                    <span className="shrink-0 rounded-[5px] bg-brand-black px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-white">
                      KEY
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-brand-ink-soft">
                  {displayPersonTitle(person.title)}
                </div>
                {roleLine ? (
                  <div className="mt-0.5 text-[10px] text-brand-ink-faint">{roleLine}</div>
                ) : null}
              </div>
              {scorePill}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              {linkedInButton}
              {selectButton}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick(e as unknown as React.MouseEvent);
        }
      }}
      className={scoutCardSurface({
        isSelected,
        isPrimary,
        layout: "row",
        className: "gap-3 px-4 py-3",
      })}
    >
      {isSelected && selectable && (
        <span
          aria-hidden
          className="absolute right-3 top-3 z-10 flex size-5 items-center justify-center rounded-full bg-white/80 text-brand-ink shadow-sm"
        >
          <Check className="size-3" strokeWidth={2.5} />
        </span>
      )}

      <IshAvatar name={person.name} index={index} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold text-brand-ink">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-brand-black px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-brand-ink-soft">{displayPersonTitle(person.title)}</div>
        {roleLine ? (
          <div className="mt-0.5 text-[10.5px] text-brand-ink-faint">{roleLine}</div>
        ) : null}
      </div>

      {linkedInButton}
      {selectButton}
      {scorePill}
    </div>
  );
}
