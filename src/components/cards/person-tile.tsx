"use client";

import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { Check } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar } from "@/design-system";
import { scoutCardSurface } from "./scout-card-surface";

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

  function handleRowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-card-action]")) return;
    onTileClick();
    if (selectable) onCheckboxClick(e);
  }

  function handleSelectClick(e: React.MouseEvent) {
    e.stopPropagation();
    onCheckboxClick(e);
    onTileClick();
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
          className="absolute right-3 top-3 z-10 flex size-5 items-center justify-center rounded-full bg-white/80 text-ish-ink shadow-sm"
        >
          <Check className="size-3" strokeWidth={2.5} />
        </span>
      )}

      <IshAvatar name={person.name} index={index} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold text-ish-ink">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-ish-black px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-ish-ink-soft">{person.title}</div>
        <div className="mt-0.5 text-[10.5px] text-ish-ink-faint">{person.department} · {person.seniority}</div>
      </div>

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
              ? "text-ish-ink"
              : "border border-ish-border bg-white/60 text-ish-ink-soft hover:border-ish-ink-soft hover:text-ish-ink",
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
