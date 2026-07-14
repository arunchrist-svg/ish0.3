"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { Bookmark, MessageCircle, Zap, ExternalLink, Check, ChevronRight } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { COMPANIES } from "@/lib/scouting-data";
import { getInitials } from "@/lib/data";
import { getAvatarColor } from "@/design-system/tokens";
import { scoutCardSurface } from "./scout-card-surface";

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
  compact?: boolean;
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
  compact = false,
}: Props) {
  const company = companyName
    ? { name: companyName }
    : COMPANIES.find((c) => c.id === person.companyId);
  const signalsCount = person.engagementSignals.length;
  const scoreColor = getScoreColor(person.matchScore);

  function handleCardClick(e: React.MouseEvent) {
    if (alreadyAdded) return;
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
    if (alreadyAdded || !selectable) return;
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
        tabIndex={alreadyAdded ? -1 : 0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !alreadyAdded) handleCardClick(e as unknown as React.MouseEvent);
        }}
        className={scoutCardSurface({
          isSelected,
          isPrimary: false,
          disabled: alreadyAdded,
          layout: "column",
          className: "min-h-[156px] p-3 text-left",
        })}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-[#5a4838]",
              getAvatarColor(index),
            )}
          >
            {getInitials(person.name)}
          </div>
          <div className="flex items-center gap-1">
            <div
              className="flex items-baseline gap-0.5 rounded-full px-2 py-0.5 text-white"
              style={{ backgroundColor: scoreColor }}
            >
              <span className="text-[11px] font-extrabold leading-none">{person.matchScore}</span>
            </div>
            <button
              type="button"
              data-card-action
              onClick={handleDetailsClick}
              className="flex size-7 items-center justify-center rounded-full bg-white/90 text-ish-ink-soft shadow-sm ring-1 ring-ish-border/50 active:scale-95"
              aria-label={`View ${person.name}`}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ish-ink">{person.name}</span>
            {person.isKeyDecisionMaker ? (
              <span className="mt-0.5 shrink-0 rounded bg-ish-black px-1 py-0.5 text-[8px] font-bold text-white">KEY</span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-ish-ink-soft">{person.title}</p>
          {company ? <p className="mt-0.5 line-clamp-1 text-[10px] text-ish-ink-faint">{company.name}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-full bg-ish-canvas px-1.5 py-0.5 text-[9px] font-medium text-ish-ink-soft">{person.department}</span>
            <span className="rounded-full bg-ish-canvas px-1.5 py-0.5 text-[9px] font-medium text-ish-ink-soft">{person.seniority}</span>
          </div>
        </div>
        {alreadyAdded ? (
          <div className="mt-2.5 rounded-xl border border-ish-border/60 bg-ish-canvas py-2 text-center text-[10px] font-semibold text-ish-ink-faint">
            Already added
          </div>
        ) : selectable ? (
          <div
            className={cn(
              "mt-2.5 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-semibold transition-colors",
              isSelected
                ? "border-ish-stratus-blue/35 bg-ish-stratus-blue/10 text-ish-stratus-blue"
                : "border-ish-border/60 bg-white/70 text-ish-ink-soft",
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
      tabIndex={alreadyAdded ? -1 : 0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !alreadyAdded) handleCardClick(e as unknown as React.MouseEvent);
      }}
      className={scoutCardSurface({
        isSelected,
        isPrimary,
        disabled: alreadyAdded,
        layout: "column",
      })}
    >
      {isSelected && selectable && !alreadyAdded && (
        <span
          aria-hidden
          className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-white/80 text-ish-ink shadow-sm"
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      )}

      <div className="flex flex-1 flex-col px-4 pb-3 pt-4 text-left">
        <div className="mb-3.5 flex items-start justify-between">
          <div
            className={cn(
              "flex size-[56px] shrink-0 items-center justify-center rounded-full font-bold text-[#5a4838]",
              getAvatarColor(index),
            )}
            style={{ fontSize: 17 }}
          >
            {getInitials(person.name)}
          </div>

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

        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[15px] font-bold leading-tight text-ish-ink line-clamp-1">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-ish-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>

        <div className="mb-0.5 text-[12px] font-medium leading-snug text-ish-ink-soft line-clamp-1">
          {person.title}
        </div>

        {company && (
          <div className="mb-3 text-[11px] text-ish-ink-faint line-clamp-1">{company.name}</div>
        )}

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
      </div>

      <div className="mx-4 h-px bg-ish-border/60" />

      {directoryLeadId ? (
        <div className="px-4 py-3" data-card-action>
          <Link
            href={`/?lead=${directoryLeadId}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ish-canvas py-2 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-ish-border active:scale-[0.98]"
          >
            Open lead
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          {selectable && !alreadyAdded && (
            <button
              type="button"
              data-card-action
              data-selected={isSelected ? "true" : "false"}
              onClick={handleSelectClick}
              aria-label={isSelected ? `Deselect ${person.name}` : `Select ${person.name}`}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-card-action
              onClick={(e) => {
                e.stopPropagation();
                onContact();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ish-canvas py-2 text-[12px] font-semibold text-ish-ink transition-all hover:bg-ish-border active:scale-[0.98]"
            >
              <MessageCircle className="size-3.5 text-ish-ink-soft" />
              Get in touch
            </button>
            <button
              type="button"
              data-card-action
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
              className="flex size-9 items-center justify-center rounded-xl border border-ish-border/70 bg-white text-ish-ink-faint transition-all hover:border-ish-ink-soft hover:text-ish-ink active:scale-95"
              aria-label="Save"
            >
              <Bookmark className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
