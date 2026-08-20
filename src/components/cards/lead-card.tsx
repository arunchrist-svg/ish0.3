"use client";

import Link from "next/link";
import { cn, displayPersonTitle, isBlankPersonField, personLinkedInHref } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { Bookmark, MessageCircle, Zap, ExternalLink, Check, ChevronRight } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { COMPANIES } from "@/lib/scouting-data";
import { getInitials } from "@/lib/data";
import { getAvatarColor } from "@/design-system/tokens";
import { scoutCardSurface } from "./scout-card-surface";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";

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

function personMetaChips(person: Person): string[] {
  return [person.department, person.seniority, person.location].filter(
    (value): value is string => !isBlankPersonField(value),
  );
}

function LinkedInCardButton({
  href,
  name,
  hasProfile,
  size,
}: {
  href: string;
  name: string;
  hasProfile: boolean;
  size: "sm" | "md";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-card-action
      onClick={(e) => e.stopPropagation()}
      aria-label={hasProfile ? `Open ${name} on LinkedIn` : `Search LinkedIn for ${name}`}
      title={hasProfile ? "Open LinkedIn profile" : "Search on LinkedIn"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-[#0A66C2] text-white transition-opacity hover:opacity-90 active:scale-95",
        size === "sm" ? "size-7" : "size-9",
      )}
    >
      <LinkedInGlyph className={size === "sm" ? "size-3" : "size-3.5"} />
    </a>
  );
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
  const title = displayPersonTitle(person.title);
  const chips = personMetaChips(person);
  const linkedIn = personLinkedInHref({
    linkedIn: person.linkedIn,
    name: person.name,
    companyName: company?.name,
  });

  function handleCardClick(e: React.MouseEvent) {
    if (alreadyAdded) return;
    if ((e.target as HTMLElement).closest("[data-card-action]")) return;
    if (compact) {
      if (selectable) onToggleSelect();
      return;
    }
    onView();
  }

  function handleSelectClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (alreadyAdded || !selectable) return;
    onToggleSelect();
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
            <LinkedInCardButton href={linkedIn.href} name={person.name} hasProfile={linkedIn.hasProfile} size="sm" />
            <button
              type="button"
              data-card-action
              onClick={handleDetailsClick}
              className="flex size-7 items-center justify-center rounded-full bg-white/90 text-brand-ink-soft shadow-sm ring-1 ring-brand-border/50 active:scale-95"
              aria-label={`View ${person.name}`}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-brand-ink">{person.name}</span>
            {person.isKeyDecisionMaker ? (
              <span className="mt-0.5 shrink-0 rounded bg-brand-black px-1 py-0.5 text-[8px] font-bold text-white">KEY</span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-brand-ink-soft">{title}</p>
          {company ? <p className="mt-0.5 line-clamp-1 text-[10px] text-brand-ink-faint">{company.name}</p> : null}
          {chips.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-brand-canvas px-1.5 py-0.5 text-[9px] font-medium text-brand-ink-soft"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {alreadyAdded ? (
          <div className="mt-2.5 rounded-xl border border-brand-border/60 bg-brand-canvas py-2 text-center text-[10px] font-semibold text-brand-ink-faint">
            Already added
          </div>
        ) : selectable ? (
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
          className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-white/80 text-brand-ink shadow-sm"
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
                <Zap className="size-3 text-brand-green" />
                <span className="text-[11px] font-semibold text-brand-ink-soft">{signalsCount}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[15px] font-bold leading-tight text-brand-ink line-clamp-1">{person.name}</span>
          {person.isKeyDecisionMaker && (
            <span className="shrink-0 rounded-[5px] bg-brand-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
              KEY
            </span>
          )}
        </div>

        <div className="mb-0.5 text-[12px] font-medium leading-snug text-brand-ink-soft line-clamp-1">
          {title}
        </div>

        {company && (
          <div className="mb-3 text-[11px] text-brand-ink-faint line-clamp-1">{company.name}</div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-brand-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-brand-ink-soft"
            >
              {chip}
            </span>
          ))}
          {alreadyAdded && (
            <span className="rounded-full bg-brand-border px-2.5 py-0.5 text-[10px] font-semibold text-brand-ink-faint">
              Already added
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 h-px bg-brand-border/60" />

      {directoryLeadId ? (
        <div className="flex items-center gap-2 px-4 py-3" data-card-action>
          <Link
            href={`/?lead=${directoryLeadId}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-canvas py-2 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-brand-border active:scale-[0.98]"
          >
            Open lead
            <ExternalLink className="size-3.5" />
          </Link>
          <LinkedInCardButton href={linkedIn.href} name={person.name} hasProfile={linkedIn.hasProfile} size="md" />
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-card-action
              onClick={(e) => {
                e.stopPropagation();
                onContact();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-canvas py-2 text-[12px] font-semibold text-brand-ink transition-all hover:bg-brand-border active:scale-[0.98]"
            >
              <MessageCircle className="size-3.5 text-brand-ink-soft" />
              Get in touch
            </button>
            <LinkedInCardButton href={linkedIn.href} name={person.name} hasProfile={linkedIn.hasProfile} size="md" />
            <button
              type="button"
              data-card-action
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
              className="flex size-9 items-center justify-center rounded-xl border border-brand-border/70 bg-white text-brand-ink-faint transition-all hover:border-brand-ink-soft hover:text-brand-ink active:scale-95"
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
