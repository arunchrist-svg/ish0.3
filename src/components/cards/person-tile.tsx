"use client";

import { cn } from "@/lib/utils";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar } from "@/design-system";

function getScoreColor(score: number): string {
  if (score >= 75) return "#3fbe82";
  if (score >= 50) return "#e8a000";
  return "#e57373";
}

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
        "group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left transition-all duration-150",
        isPrimary
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : isSelected
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : "border border-ish-border/60 hover:border-ish-border hover:shadow-[var(--shadow-ish-sm)]",
      )}
    >
      {/* Left selection bar */}
      {selectable && (
        <div
          className={cn(
            "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-200",
            isSelected ? "bg-ish-green opacity-100" : "bg-transparent opacity-0 group-hover:opacity-40 group-hover:bg-ish-border",
          )}
        />
      )}

      {/* Checkbox tap area (invisible, covers avatar) */}
      {selectable && (
        <button
          type="button"
          onClick={onCheckboxClick}
          className="relative shrink-0"
          aria-label={isSelected ? "Deselect" : "Select"}
        >
          <IshAvatar name={person.name} index={index} size={40} />
          {isSelected && (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-white bg-ish-green">
              <svg width="7" height="6" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </button>
      )}

      {!selectable && <IshAvatar name={person.name} index={index} size={40} />}

      {/* Text */}
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

      {/* Score badge */}
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
