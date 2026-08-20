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
};

export function PersonTile({
  person,
  index,
  isSelected,
  isPrimary,
  onCheckboxClick,
  onTileClick,
  selectable = true,
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

      <a
        href={linkedIn.href}
        target="_blank"
        rel="noopener noreferrer"
        data-card-action
        onClick={(e) => e.stopPropagation()}
        aria-label={linkedIn.hasProfile ? `Open ${person.name} on LinkedIn` : `Search LinkedIn for ${person.name}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0A66C2] text-white transition-opacity hover:opacity-90 active:scale-95"
      >
        <LinkedInGlyph className="size-3.5" />
      </a>

      {selectable && (
        <button
          type="button"
          data-card-action
          data-selected={isSelected ? "true" : "false"}
          onClick={handleSelectClick}
          aria-label={isSelected ? "Deselect" : "Select"}
          className={cn(
            "ish-scout-select-cta flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95",
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
      )}

      <div
        className="flex shrink-0 items-baseline gap-0.5 rounded-full px-2 py-1"
        style={{ backgroundColor: `${scoreColor}18` }}
      >
        <span className="text-[13px] font-extrabold leading-none" style={{ color: scoreColor }}>
          {person.matchScore}
        </span>
        <span className="text-[8px] font-bold" style={{ color: scoreColor, opacity: 0.7 }}>%</span>
      </div>
    </div>
  );
}
