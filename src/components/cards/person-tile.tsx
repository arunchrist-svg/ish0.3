"use client";

import { cn } from "@/lib/utils";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar, ScoreGauge } from "@/design-system";

type Props = {
  person: Person;
  index: number;
  isSelected: boolean;
  isPrimary: boolean;
  onCheckboxClick: (e: React.MouseEvent) => void;
  onTileClick: () => void;
};

export function PersonTile({ person, index, isSelected, isPrimary, onCheckboxClick, onTileClick }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTileClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTileClick();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-white p-3.5 text-left transition-all duration-150",
        isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)]",
      )}
    >
      <button
        type="button"
        onClick={onCheckboxClick}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-100",
          isSelected
            ? "border-ish-green bg-ish-green"
            : "border-ish-border bg-white group-hover:border-ish-ink-faint",
        )}
        aria-label={isSelected ? "Deselect" : "Select"}
      >
        {isSelected && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <IshAvatar name={person.name} index={index} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold text-ish-ink">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-ish-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ish-ink-soft">{person.title}</div>
        <div className="mt-0.5 text-[10.5px] text-ish-ink-faint">{person.department}</div>
      </div>

      <ScoreGauge score={person.matchScore} size="sm" background />
    </div>
  );
}
