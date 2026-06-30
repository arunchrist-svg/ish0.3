"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet, IshAvatar, SearchBar } from "@/design-system";
import { getScoreTone, scoreToneClasses } from "@/design-system/tokens";
import type { LeadQueueItem } from "@/lib/api-client";
import { hapticLight } from "@/lib/capacitor/platform";

const CHIP_LIMIT = 5;

type LeadSwitcherRailProps = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onBack?: () => void;
};

function partitionChipLeads(leads: LeadQueueItem[], activeId: string) {
  if (leads.length <= CHIP_LIMIT) {
    return { chips: leads, overflow: [] as LeadQueueItem[] };
  }

  let chips = leads.slice(0, CHIP_LIMIT);
  const activeIdx = leads.findIndex((l) => l.id === activeId);
  if (activeIdx >= CHIP_LIMIT) {
    chips = [...leads.slice(0, CHIP_LIMIT - 1), leads[activeIdx]!];
  }

  const chipIds = new Set(chips.map((l) => l.id));
  const overflow = leads.filter((l) => !chipIds.has(l.id));
  return { chips, overflow };
}

function LeadChip({
  lead,
  index,
  active,
  chipRef,
  onSelect,
}: {
  lead: LeadQueueItem;
  index: number;
  active: boolean;
  chipRef?: RefObject<HTMLButtonElement | null>;
  onSelect: () => void;
}) {
  const tone = getScoreTone(lead.score);
  return (
    <button
      ref={chipRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "ish-lead-switcher-chip flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 transition-all active:scale-[0.97]",
        active && "ish-lead-switcher-chip-active",
      )}
    >
      <IshAvatar name={lead.name} index={index} size={24} className="ring-1 ring-white" />
      <span className="max-w-[72px] truncate text-[12px] font-semibold text-ish-ink">{lead.name}</span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
          scoreToneClasses[tone],
        )}
      >
        {lead.score}
      </span>
    </button>
  );
}

export function LeadSwitcherRail({ leads, activeId, onSelect, onBack }: LeadSwitcherRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetQuery, setSheetQuery] = useState("");

  const { chips, overflow } = useMemo(
    () => partitionChipLeads(leads, activeId),
    [leads, activeId],
  );

  const sheetLeads = useMemo(() => {
    const pool = overflow.length > 0 ? overflow : leads;
    const q = sheetQuery.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.title?.toLowerCase().includes(q),
    );
  }, [overflow, leads, sheetQuery]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  if (leads.length <= 1 && !onBack) return null;

  function pickLead(id: string) {
    if (id === activeId) return;
    void hapticLight();
    onSelect(id);
    setSheetOpen(false);
    setSheetQuery("");
  }

  return (
    <>
      <div className="ish-lead-switcher-rail shrink-0 border-b border-ish-border/40 lg:hidden">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-ish-ink shadow-ish-sm active:scale-95"
              aria-label="Back to leads"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}

          <div ref={scrollRef} className="ish-scroll-tabs flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {chips.map((lead) => {
              const index = leads.findIndex((l) => l.id === lead.id);
              const active = lead.id === activeId;
              return (
                <LeadChip
                  key={lead.id}
                  lead={lead}
                  index={index >= 0 ? index : 0}
                  active={active}
                  chipRef={active ? activeRef : undefined}
                  onSelect={() => pickLead(lead.id)}
                />
              );
            })}
          </div>

          {overflow.length > 0 ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex shrink-0 items-center gap-0.5 rounded-xl border border-ish-border/60 bg-white/90 px-2 py-1.5 text-[11px] font-bold text-ish-ink shadow-ish-sm active:scale-95"
              aria-label={`${overflow.length} more leads`}
            >
              <span>+{overflow.length}</span>
              <ChevronDown className="size-3.5 text-ish-ink-soft" />
            </button>
          ) : null}
        </div>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSheetQuery("");
        }}
        title="Switch lead"
      >
        {overflow.length > 5 ? (
          <SearchBar
            value={sheetQuery}
            onChange={setSheetQuery}
            placeholder="Search leads…"
            className="mb-3"
          />
        ) : null}
        <div className="space-y-1">
          {sheetLeads.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ish-ink-soft">No leads match your search</p>
          ) : (
            sheetLeads.map((lead, index) => {
              const active = lead.id === activeId;
              const tone = getScoreTone(lead.score);
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => pickLead(lead.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                    active ? "bg-ish-stratus-blue/10 ring-1 ring-ish-stratus-blue/30" : "hover:bg-ish-canvas",
                  )}
                >
                  <IshAvatar name={lead.name} index={index} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ish-ink">{lead.name}</div>
                    <div className="truncate text-[12px] text-ish-ink-soft">
                      {[lead.title, lead.company].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      scoreToneClasses[tone],
                    )}
                  >
                    {lead.score}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </BottomSheet>
    </>
  );
}
