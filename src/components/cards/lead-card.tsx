"use client";

import { cn } from "@/lib/utils";
import { ScoreGauge } from "@/design-system";
import { Bookmark, MessageCircle, Zap, Briefcase } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { COMPANIES } from "@/lib/scouting-data";
import { getInitials } from "@/lib/data";
import { getAvatarColor } from "@/design-system/tokens";

type Props = {
  person: Person;
  index: number;
  isSelected: boolean;
  isPrimary: boolean;
  alreadyAdded?: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onContact: () => void;
  onBookmark: () => void;
};

function getScoreRingColor(score: number): string {
  if (score >= 85) return "#3fbe82";
  if (score >= 70) return "#e8a000";
  return "#e57373";
}

export function LeadCard({
  person,
  index,
  isSelected,
  isPrimary,
  alreadyAdded = false,
  onToggleSelect,
  onView,
  onContact,
  onBookmark,
}: Props) {
  const company = COMPANIES.find((c) => c.id === person.companyId);
  const signalsCount = person.engagementSignals.length;
  const ringColor = getScoreRingColor(person.matchScore);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[20px] bg-white transition-all duration-200",
        alreadyAdded
          ? "opacity-50 cursor-not-allowed"
          : isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
        isSelected && !isPrimary && !alreadyAdded && "ring-2 ring-ish-green",
      )}
    >
      {/* Checkbox row */}
      <button
        type="button"
        onClick={alreadyAdded ? undefined : onToggleSelect}
        disabled={alreadyAdded}
        className="flex w-full items-center justify-between px-5 pt-4 pb-0"
        aria-label={alreadyAdded ? `${person.name} already added` : isSelected ? `Deselect ${person.name}` : `Select ${person.name}`}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            alreadyAdded
              ? "border-ish-border bg-ish-app"
              : isSelected
              ? "border-ish-green bg-ish-green"
              : "border-ish-border bg-white",
          )}
        >
          {alreadyAdded ? (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : isSelected ? (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
        {alreadyAdded && (
          <span className="text-[10px] font-semibold text-ish-ink-faint bg-ish-app rounded-full px-2 py-0.5">
            Already added
          </span>
        )}
      </button>

      {/* View zone */}
      <button
        type="button"
        onClick={onView}
        className="flex w-full flex-1 cursor-pointer flex-col px-5 pb-4 pt-3 text-left"
        aria-label={`View ${person.name}`}
      >
        {/* Avatar */}
        <div className="mb-3.5 flex justify-center">
          <div
            className={cn(
              "flex size-[60px] items-center justify-center rounded-full font-bold text-[#5a4838]",
              getAvatarColor(index),
            )}
            style={{
              fontSize: 18,
              boxShadow: `0 0 0 3px white, 0 0 0 5px ${ringColor}`,
            }}
          >
            {getInitials(person.name)}
          </div>
        </div>

        {/* Name + title */}
        <div className="mb-3 text-center">
          <div className="text-[14.5px] font-bold leading-snug text-ish-ink">{person.name}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-ish-ink-soft">{person.title}</div>
          {company && (
            <div className="mt-0.5 text-[11px] text-ish-ink-faint">{company.name}</div>
          )}
        </div>

        {/* Badges */}
        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
          {person.isKeyDecisionMaker && (
            <span className="rounded-full bg-ish-black px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
          <span className="rounded-full bg-ish-app px-2.5 py-0.5 text-[10px] font-medium text-ish-ink-soft">
            {person.department}
          </span>
          <span className="rounded-full bg-ish-app px-2.5 py-0.5 text-[10px] font-medium text-ish-ink-soft">
            {person.seniority}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center rounded-[12px] bg-ish-app px-3 py-3 gap-0">
          <div className="flex flex-1 flex-col items-center gap-1">
            <ScoreGauge score={person.matchScore} size="sm" background />
            <span className="text-[10px] text-ish-ink-faint">Match</span>
          </div>

          <div className="h-8 w-px bg-ish-border" />

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <Zap className="size-3.5 text-ish-green" />
              <span className="text-[14px] font-bold text-ish-ink">{signalsCount}</span>
            </div>
            <span className="text-[10px] text-ish-ink-faint">Signals</span>
          </div>

          <div className="h-8 w-px bg-ish-border" />

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <Briefcase className="size-3.5 text-ish-ink-soft" />
            </div>
            <span className="text-[10px] text-ish-ink-faint">{person.seniority}</span>
          </div>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2 px-5 pb-5">
        <button
          type="button"
          onClick={onContact}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ish-app py-2.5 text-[12px] font-semibold text-ish-ink transition-colors hover:bg-ish-border"
        >
          <MessageCircle className="size-3.5" />
          Get in touch
        </button>
        <button
          type="button"
          onClick={onBookmark}
          className="flex size-10 items-center justify-center rounded-full border border-ish-border bg-white text-ish-ink-soft transition-colors hover:text-ish-ink hover:bg-ish-app"
          aria-label="Save"
        >
          <Bookmark className="size-4" />
        </button>
      </div>
    </div>
  );
}
