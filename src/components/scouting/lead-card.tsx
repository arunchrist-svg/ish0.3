"use client";

import { cn } from "@/lib/utils";
import { Star, Bookmark, MessageCircle, Zap, Briefcase } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { COMPANIES } from "@/lib/scouting-data";
import { getInitials } from "@/lib/data";
import { getAvatarColor } from "@/design-system/tokens";

type Props = {
  person: Person;
  index: number;
  isSelected: boolean;
  isPrimary: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onContact: () => void;
  onBookmark: () => void;
};

function getScoreColor(score: number) {
  if (score >= 85) return "border-ish-green";
  if (score >= 70) return "border-[#e8a000]";
  return "border-[#e57373]";
}

export function LeadCard({
  person,
  index,
  isSelected,
  isPrimary,
  onToggleSelect,
  onView,
  onContact,
  onBookmark,
}: Props) {
  const company = COMPANIES.find((c) => c.id === person.companyId);
  const signalsCount = person.engagementSignals.length;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[20px] bg-gradient-to-b from-white to-[#f0fafa] transition-all duration-150",
        isPrimary
          ? "ring-2 ring-blue-500 shadow-[var(--shadow-ish)]"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)]",
        isSelected && !isPrimary && "ring-2 ring-ish-green",
      )}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        className="flex w-full px-5 pt-4 pb-1"
        aria-label={isSelected ? `Deselect ${person.name}` : `Select ${person.name}`}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            isSelected
              ? "border-ish-green bg-ish-green"
              : "border-ish-border bg-white",
          )}
        >
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>

      {/* View zone — rest of card */}
      <button
        type="button"
        onClick={onView}
        className="flex w-full flex-1 cursor-pointer flex-col p-5 text-left "
        aria-label={`View ${person.name}`}
      >
        <div className="mb-4 flex justify-center">
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-full border-[3px] font-bold text-[#5a4838]",
              getScoreColor(person.matchScore),
              getAvatarColor(index),
            )}
            style={{ fontSize: 18 }}
          >
            {getInitials(person.name)}
          </div>
        </div>

        <div className="mb-3 text-center">
          <div className="text-[15px] font-bold text-ish-ink">{person.name}</div>
          <div className="mt-0.5 text-[12px] text-ish-ink-soft">{person.title}</div>
          {company && (
            <div className="mt-0.5 text-[11px] text-ish-ink-faint">{company.name}</div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
          {person.isKeyDecisionMaker && (
            <span className="rounded-full bg-ish-black px-2 py-0.5 text-[10px] font-bold text-white">
              KEY
            </span>
          )}
          <span className="rounded-full bg-ish-app px-2 py-0.5 text-[10px] font-medium text-ish-ink-soft">
            {person.department}
          </span>
          <span className="rounded-full bg-ish-app px-2 py-0.5 text-[10px] font-medium text-ish-ink-soft">
            {person.seniority}
          </span>
        </div>

        <div className="mb-4 flex items-center justify-center gap-6 border-t border-ish-border pt-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[14px] font-bold text-ish-ink">
              <Star className="size-3.5 fill-ish-yellow text-ish-yellow" />
              {person.matchScore}
            </div>
            <div className="text-[10px] text-ish-ink-faint">Match</div>
          </div>
          <div className="h-6 w-px bg-ish-border" />
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[14px] font-bold text-ish-ink">
              <Zap className="size-3.5 text-ish-green" />
              {signalsCount}
            </div>
            <div className="text-[10px] text-ish-ink-faint">Signals</div>
          </div>
          <div className="h-6 w-px bg-ish-border" />
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[14px] font-bold text-ish-ink">
              <Briefcase className="size-3.5 text-ish-ink-soft" />
            </div>
            <div className="text-[10px] text-ish-ink-faint">{person.seniority}</div>
          </div>
        </div>
      </button>

      {/* Actions — outside view zone, own handlers */}
      <div className="flex items-center gap-2 px-5 pb-5">
        <button
          type="button"
          onClick={onContact}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ish-app py-2.5 text-[12px] font-semibold text-ish-ink transition-colors hover:bg-ish-border"
        >
          <MessageCircle className="size-3.5" />
          Get in touch
        </button>
        <button
          type="button"
          onClick={onBookmark}
          className="flex size-10 items-center justify-center rounded-full bg-white text-ish-ink-soft shadow-[var(--shadow-ish-sm)] transition-colors hover:text-ish-ink"
          aria-label="Save"
        >
          <Bookmark className="size-4" />
        </button>
      </div>
    </div>
  );
}
