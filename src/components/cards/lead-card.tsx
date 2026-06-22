"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { Bookmark, MessageCircle, Zap, ExternalLink } from "lucide-react";
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
  selectable?: boolean;
  companyName?: string;
  directoryLeadId?: string;
};


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
  selectable = true,
  companyName,
  directoryLeadId,
}: Props) {
  const company = companyName
    ? { name: companyName }
    : COMPANIES.find((c) => c.id === person.companyId);
  const signalsCount = person.engagementSignals.length;
  const scoreColor = getScoreColor(person.matchScore);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-white transition-all duration-200",
        alreadyAdded
          ? "opacity-50 cursor-not-allowed"
          : isPrimary
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : isSelected
          ? "shadow-[var(--shadow-ish)] ring-[1.5px] ring-ish-green"
          : "shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)] hover:-translate-y-0.5",
      )}
    >
      {/* Clickable body */}
      <button
        type="button"
        onClick={alreadyAdded ? undefined : onView}
        disabled={alreadyAdded}
        className="flex w-full flex-1 cursor-pointer flex-col px-4 pb-3 pt-4 text-left"
        aria-label={`View ${person.name}`}
      >
        {/* Top row: avatar (selector) + score */}
        <div className="mb-3.5 flex items-start justify-between">
          {/* Avatar as selector */}
          <button
            type="button"
            disabled={alreadyAdded || !selectable}
            onClick={(e) => {
              e.stopPropagation();
              if (!alreadyAdded && selectable) onToggleSelect();
            }}
            className={cn(
              "relative flex size-[56px] shrink-0 items-center justify-center rounded-full font-bold text-[#5a4838] transition-transform duration-150",
              selectable && !alreadyAdded && "active:scale-95",
            )}
            style={{ fontSize: 17 }}
            aria-label={alreadyAdded ? `${person.name} already added` : isSelected ? `Deselect ${person.name}` : `Select ${person.name}`}
          >
            {/* Avatar background */}
            <div
              className={cn(
                "flex size-full items-center justify-center rounded-full font-bold",
                getAvatarColor(index),
              )}
            >
              {getInitials(person.name)}
            </div>
            {/* Selected checkmark overlay */}
            {(isSelected || alreadyAdded) && (
              <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-ish-green shadow-sm">
                <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>

          {/* Score + signals */}
          <div className="flex flex-col items-end gap-1.5">
            <div
              className="flex items-baseline gap-0.5 rounded-full px-2.5 py-1 text-white"
              style={{ backgroundColor: scoreColor }}
            >
              <span className="text-[14px] font-extrabold leading-none">{person.matchScore}</span>
              <span className="text-[8px] font-semibold opacity-80">%</span>
            </div>
            {signalsCount > 0 && (
              <div className="flex items-center gap-1">
                <Zap className="size-3 text-ish-green" />
                <span className="text-[11px] font-semibold text-ish-ink-soft">{signalsCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Name + KEY badge */}
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[15px] font-bold leading-tight text-ish-ink line-clamp-1">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-ish-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>

        {/* Title */}
        <div className="mb-0.5 text-[12px] font-medium leading-snug text-ish-ink-soft line-clamp-1">
          {person.title}
        </div>

        {/* Company */}
        {company && (
          <div className="mb-3 text-[11px] text-ish-ink-faint line-clamp-1">{company.name}</div>
        )}

        {/* Dept + seniority tags */}
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-ish-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-ish-ink-soft">
            {person.department}
          </span>
          <span className="rounded-full bg-ish-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-ish-ink-soft">
            {person.seniority}
          </span>
          {alreadyAdded && (
            <span className="rounded-full bg-ish-border px-2.5 py-0.5 text-[10px] font-semibold text-ish-ink-faint">
              Already added
            </span>
          )}
        </div>
      </button>

      {/* Divider */}
      <div className="mx-4 h-px bg-ish-border/60" />

      {/* CTA row */}
      {directoryLeadId ? (
        <div className="px-4 py-3">
          <Link
            href={`/?lead=${directoryLeadId}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ish-canvas py-2 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-ish-border active:scale-[0.98]"
          >
            Open lead
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onContact}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ish-canvas py-2 text-[12px] font-semibold text-ish-ink transition-all hover:bg-ish-border active:scale-[0.98]"
          >
            <MessageCircle className="size-3.5 text-ish-ink-soft" />
            Get in touch
          </button>
          <button
            type="button"
            onClick={onBookmark}
            className="flex size-9 items-center justify-center rounded-xl border border-ish-border/70 bg-white text-ish-ink-faint transition-all hover:border-ish-ink-soft hover:text-ish-ink active:scale-95"
            aria-label="Save"
          >
            <Bookmark className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
