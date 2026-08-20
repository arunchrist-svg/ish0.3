"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Check, ChevronDown, Clock3, Loader2, Mail, Plus, RefreshCw, Search, Upload, X } from "lucide-react";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import { CircleButton, IshAvatar, ScoreBadge, SearchBar, Separator } from "@/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { statusToDisplayLabel } from "@/lib/pipeline-status";
import { getScoreTone, scoreToneClasses, text } from "@/design-system/tokens";
import type { LeadQueueItem } from "@/lib/api-client";
import { countDuplicateExtras } from "@/lib/leads/duplicates";
import { scoutCardSurface } from "@/components/cards/scout-card-surface";
import { LeadsViewToggle } from "@/components/leads/leads-view-toggle";

export type LeadQueueSort = "score" | "date";

export const LEAD_QUEUE_SORT_STORAGE_KEY = "ish-leads-queue-sort";

type Props = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  onAddLead?: () => void;
  onAddFromLinkedIn?: () => void;
  onImportLeads?: () => void;
  canWrite?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  listScrollRef?: React.RefObject<HTMLDivElement | null>;
  sort?: LeadQueueSort;
  onSortChange?: (sort: LeadQueueSort) => void;
  onMergeDuplicates?: () => void | Promise<void>;
  mergingDuplicates?: boolean;
};

export function filterLeadsByQuery(leads: LeadQueueItem[], query: string): LeadQueueItem[] {
  return leads.filter((item) => matchesQuery(item, query));
}

function createdAtMs(item: LeadQueueItem): number {
  if (!item.createdAt) return 0;
  const ms = new Date(item.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function sortLeadsQueue(leads: LeadQueueItem[], sort: LeadQueueSort): LeadQueueItem[] {
  return [...leads].sort((a, b) => {
    if (sort === "date") {
      const diff = createdAtMs(b) - createdAtMs(a);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    }
    const diff = (b.score ?? 0) - (a.score ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function parseLeadQueueSort(value: string | null | undefined): LeadQueueSort {
  if (value === "date" || value === "recent") return "date";
  if (value === "score" || value === "score_desc" || value === "score_asc") return "score";
  return "score";
}

function MergeDuplicatesButton({
  count,
  merging,
  onMerge,
}: {
  count: number;
  merging: boolean;
  onMerge: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onMerge}
      disabled={merging}
      aria-busy={merging}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-stratus-blue/25 bg-brand-stratus-blue/8 px-3 py-2 text-[12px] font-semibold text-brand-stratus-blue transition-colors hover:bg-brand-stratus-blue/12 disabled:pointer-events-none disabled:opacity-60"
    >
      {merging ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {merging ? "Merging duplicates…" : `Merge ${count} duplicate${count === 1 ? "" : "s"}`}
    </button>
  );
}

function MergingDuplicatesOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-brand-stratus-blue/20 bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-stratus-blue shadow-[var(--shadow-brand-sm)]">
        <Loader2 className="size-3.5 animate-spin" />
        Merging duplicates…
      </div>
    </div>
  );
}

const SORT_OPTIONS: { value: LeadQueueSort; label: string; Icon: typeof ArrowDownWideNarrow }[] = [
  { value: "score", label: "Score", Icon: ArrowDownWideNarrow },
  { value: "date", label: "Date", Icon: Clock3 },
];

function SortByDropdown({
  sort,
  onChange,
  className,
}: {
  sort: LeadQueueSort;
  onChange: (sort: LeadQueueSort) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((option) => option.value === sort) ?? SORT_OPTIONS[0];
  const CurrentIcon = current.Icon;

  function selectSort(value: LeadQueueSort) {
    onChange(value);
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full border border-brand-stratus-blue/30 bg-white/90 px-2 text-[11px] font-semibold text-brand-ink",
          "shadow-[var(--shadow-brand-sm)] backdrop-blur-sm outline-none",
          "hover:border-brand-stratus-blue/45 hover:bg-white",
          "focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/25",
          open && "border-brand-stratus-blue/50",
          className,
        )}
        aria-label={`Sort by ${current.label}`}
      >
        <CurrentIcon className="size-3 text-brand-stratus-blue" />
        <span>{current.label}</span>
        <ChevronDown className={cn("size-3 text-brand-stratus-blue/70 transition-transform", open && "rotate-180")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[148px] rounded-xl border border-brand-stratus-blue/25 bg-white/95 p-1 text-brand-ink shadow-[var(--shadow-brand)] backdrop-blur-md"
      >
        {SORT_OPTIONS.map(({ value, label, Icon }) => {
          const selected = value === sort;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => selectSort(value)}
              className={cn(
                "cursor-pointer gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold",
                "focus:bg-brand-stratus-blue/10 focus:text-brand-ink",
                selected && "bg-brand-stratus-blue/10 text-brand-stratus-blue",
              )}
            >
              <Icon className={cn("size-3.5", selected ? "text-brand-stratus-blue" : "text-brand-ink-soft")} />
              <span className="flex-1">{label}</span>
              {selected ? <Check className="size-3.5 text-brand-stratus-blue" strokeWidth={2.5} /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function matchesQuery(item: LeadQueueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.company, item.employees, item.title, item.city, item.status, item.action, item.emailStatus]
    .some((field) => field?.toLowerCase().includes(q));
}

function companySizeLabel(employees?: string | null): string | null {
  const value = employees?.trim();
  if (!value || value === "—") return null;
  return /employee/i.test(value) ? value : `${value} employees`;
}

function emailStatusDot(status: string) {
  if (status === "verified") return "bg-brand-green";
  if (status === "unverified") return "bg-[#e8a000]";
  return "bg-brand-ink-faint";
}

function CompactLeadCard({
  item,
  index,
  active,
  onClick,
}: {
  item: LeadQueueItem;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const scoreTone = getScoreTone(item.score);
  const size = companySizeLabel(item.employees);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        scoutCardSurface({
          isSelected: active,
          isPrimary: false,
          layout: "column",
          className: "min-h-[132px] p-3 text-left active:scale-[0.98]",
        }),
        active && "ish-leads-card-active",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <IshAvatar name={item.name} index={index} size={36} className="ring-2 ring-white" />
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums",
            scoreToneClasses[scoreTone],
          )}
        >
          {item.score}
        </span>
      </div>
      <div className="mt-2.5 min-w-0 flex-1">
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-brand-ink">{item.name}</div>
        <p className="mt-0.5 truncate text-[11px] font-medium text-brand-ink-soft">{item.company}</p>
        {size ? (
          <p className="mt-0.5 truncate text-[10.5px] text-brand-ink-faint">{size}</p>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-brand-border/35 pt-2">
        <span className="min-w-0 truncate rounded-full bg-brand-canvas px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-ink-soft">
          {statusToDisplayLabel(item.status)}
        </span>
        {active ? <Check className="size-3.5 text-brand-stratus-blue" strokeWidth={2.5} /> : null}
      </div>
    </button>
  );
}

function QueueCard({
  item,
  index,
  active,
  onClick,
}: {
  item: LeadQueueItem;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const size = companySizeLabel(item.employees);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ish-queue-card mb-2 w-full cursor-pointer rounded-[18px] p-4 text-left",
        "transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:translate-y-[-1px] active:scale-[0.99]",
        active
          ? "ish-queue-card-active bg-brand-yellow-gradient"
          : "bg-white shadow-[var(--shadow-brand-sm)] hover:shadow-[var(--shadow-brand)]",
      )}
    >
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <IshAvatar name={item.name} index={index} size={42} />
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-bold text-brand-ink">{item.name}</div>
            <div className="mt-0.5 truncate text-xs font-medium text-brand-ink-soft">{item.company}</div>
            {size ? (
              <div className="mt-0.5 truncate text-[11px] text-brand-ink-faint">{size}</div>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white/60",
            "transition-transform duration-300",
            active && "scale-110",
          )}
        >
          <Mail className="size-3.5 text-brand-ink-soft" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 rounded-md bg-white/55 px-2 py-0.5 text-[10.5px] font-bold text-brand-ink-soft">
          {statusToDisplayLabel(item.status)}
        </span>
        <ScoreBadge score={item.score} />
      </div>
    </button>
  );
}

export function QueuePanel({ leads, activeId, onSelect, onRefresh, onAddLead, onAddFromLinkedIn, onImportLeads, canWrite, searchQuery: controlledSearch, onSearchQueryChange, listScrollRef, sort: controlledSort, onSortChange, onMergeDuplicates, mergingDuplicates }: Props) {
  const isMobile = useIsMobileLayout();
  const [searchOpen, setSearchOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [internalSort, setInternalSort] = useState<LeadQueueSort>("score");
  const [refreshing, setRefreshing] = useState(false);
  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearch;
  const sort = controlledSort ?? internalSort;

  function setSort(next: LeadQueueSort) {
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  }

  const filteredLeads = useMemo(
    () => sortLeadsQueue(filterLeadsByQuery(leads, searchQuery), sort),
    [leads, searchQuery, sort],
  );

  const duplicateExtra = useMemo(() => countDuplicateExtras(leads), [leads]);

  const groupedByRecency = sort === "date";
  const today = groupedByRecency ? filteredLeads.slice(0, Math.min(3, filteredLeads.length)) : [];
  const older = groupedByRecency ? filteredLeads.slice(3) : [];

  async function handleRefresh() {
    if (!onRefresh || refreshing || mergingDuplicates) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (isMobile) {
    return (
      <div className="ish-leads-page flex h-full w-full min-w-0 flex-col">
        <div className="sticky top-0 z-20 border-b border-brand-border/40 bg-white/80 px-4 pb-2.5 pt-[max(env(safe-area-inset-top),10px)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className={text.pageTitle}>Leads</h1>
              <p className="text-[12px] text-brand-ink-soft">
                {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"}
                {searchQuery ? ` · "${searchQuery}"` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <LeadsViewToggle />
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing || mergingDuplicates}
                className="flex size-10 items-center justify-center rounded-full bg-white text-brand-ink shadow-brand-sm ring-1 ring-brand-border/40 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                aria-label="Refresh leads"
              >
                <RefreshCw className={cn("size-4 text-brand-stratus-blue", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search leads"
                className="!px-0 !py-0"
              />
            </div>
            {canWrite && onImportLeads ? (
              <button
                type="button"
                onClick={onImportLeads}
                disabled={mergingDuplicates}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-ink shadow-brand-sm ring-1 ring-brand-border/40 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                aria-label="Import leads from spreadsheet"
              >
                <Upload className="size-4 text-brand-stratus-blue" />
              </button>
            ) : null}
          </div>
          <div className="mt-2.5">
            <SortByDropdown sort={sort} onChange={setSort} />

          {canWrite && onMergeDuplicates && duplicateExtra > 0 ? (
            <MergeDuplicatesButton
              count={duplicateExtra}
              merging={!!mergingDuplicates}
              onMerge={() => void onMergeDuplicates()}
            />
          ) : null}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={listScrollRef} className="h-full overflow-y-auto ish-page-padding py-4">
            {filteredLeads.length === 0 ? (
              <div className="mt-12 text-center text-[13px] text-brand-ink-soft">
                {searchQuery ? `No leads match "${searchQuery}"` : "No leads yet"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredLeads.map((item, i) => (
                  <CompactLeadCard
                    key={item.id}
                    item={item}
                    index={i}
                    active={activeId === item.id}
                    onClick={() => onSelect(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
          {mergingDuplicates ? <MergingDuplicatesOverlay /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-white/50 ish-glass-sidebar p-4 lg:w-[330px] lg:p-[22px_18px]">
      <div className="mb-3 min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-bold leading-none text-brand-ink">Leads</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {canWrite && onAddFromLinkedIn ? (
              <CircleButton
                size={26}
                onClick={mergingDuplicates ? undefined : onAddFromLinkedIn}
                className={cn(mergingDuplicates && "pointer-events-none opacity-50")}
                aria-label="Add from LinkedIn"
              >
                <LinkedInGlyph className="size-3.5" />
              </CircleButton>
            ) : null}
            {canWrite && onAddLead ? (
              <CircleButton
                size={26}
                onClick={mergingDuplicates ? undefined : onAddLead}
                className={cn(mergingDuplicates && "pointer-events-none opacity-50")}
                aria-label="Add lead"
              >
                <Plus className="size-3.5" />
              </CircleButton>
            ) : null}
            <CircleButton
              size={26}
              onClick={mergingDuplicates ? undefined : () => void handleRefresh()}
              className={cn(mergingDuplicates && "pointer-events-none opacity-50")}
              aria-label="Refresh leads"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </CircleButton>
            <CircleButton
              size={26}
              active={searchOpen}
              onClick={() => {
                setSearchOpen((open) => {
                  if (open) setSearchQuery("");
                  return !open;
                });
              }}
              aria-label="Search leads"
            >
              <Search className="size-3.5" />
            </CircleButton>
            {canWrite && onImportLeads ? (
              <CircleButton
                size={26}
                onClick={mergingDuplicates ? undefined : onImportLeads}
                className={cn(mergingDuplicates && "pointer-events-none opacity-50")}
                aria-label="Import leads from spreadsheet"
              >
                <Upload className="size-3.5" />
              </CircleButton>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <LeadsViewToggle />
          <SortByDropdown sort={sort} onChange={setSort} />
        </div>
      </div>

      {canWrite && onMergeDuplicates && duplicateExtra > 0 ? (
        <div className="mb-3">
          <MergeDuplicatesButton
            count={duplicateExtra}
            merging={!!mergingDuplicates}
            onMerge={() => void onMergeDuplicates()}
          />
        </div>
      ) : null}

      {searchOpen ? (
        <div className="relative mb-3 mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, company…"
            className={cn(
              "w-full rounded-xl border border-brand-border/60 bg-white py-2 pl-9 pr-8 text-[13px] text-brand-ink",
              "placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-brand-stratus-blue/12",
            )}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-brand-ink-faint hover:bg-brand-canvas hover:text-brand-ink"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto scrollbar-none px-3 py-1">
          {filteredLeads.length === 0 ? (
            <div className="mt-8 px-2 text-center text-[12px] text-brand-ink-faint">
              {searchQuery ? `No leads match "${searchQuery}"` : "No leads"}
            </div>
          ) : groupedByRecency ? (
            <>
              {today.length > 0 ? (
                <>
                  <div className="mb-2.5 mt-4 text-xs font-semibold text-brand-ink-faint">RECENT</div>
                  {today.map((item, i) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      index={i}
                      active={activeId === item.id}
                      onClick={() => onSelect(item.id)}
                    />
                  ))}
                </>
              ) : null}

              {older.length > 0 ? (
                <>
                  <div className="my-4 flex items-center gap-2.5">
                    <Separator className="flex-1 bg-brand-border" />
                    <span className="text-[11.5px] font-semibold text-brand-ink-faint">EARLIER</span>
                    <Separator className="flex-1 bg-brand-border" />
                  </div>
                  {older.map((item, i) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      index={i + 3}
                      active={activeId === item.id}
                      onClick={() => onSelect(item.id)}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="mb-2.5 mt-2 text-xs font-semibold text-brand-ink-faint">
                HIGHEST SCORE
              </div>
              {filteredLeads.map((item, i) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  index={i}
                  active={activeId === item.id}
                  onClick={() => onSelect(item.id)}
                />
              ))}
            </>
          )}
        </div>
        {mergingDuplicates ? <MergingDuplicatesOverlay /> : null}
      </div>
    </div>
  );
}
