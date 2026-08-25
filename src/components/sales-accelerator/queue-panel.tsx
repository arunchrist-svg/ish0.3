"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Mail, RefreshCw } from "lucide-react";
import { IshAvatar, ScoreBadge, SearchBar } from "@/design-system";
import { LeadAddMenu } from "@/components/leads/lead-add-menu";
import { cn } from "@/lib/utils";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { useLoadMoreOnScroll } from "@/hooks/use-load-more-on-scroll";
import { statusToDisplayLabel } from "@/lib/pipeline-status";
import { getScoreTone, scoreToneClasses, text } from "@/design-system/tokens";
import type { LeadQueueItem } from "@/lib/api-client";
import { countDuplicateExtras } from "@/lib/leads/duplicates";
import { scoutCardSurface } from "@/components/cards/scout-card-surface";
import { LeadsViewToggle } from "@/components/leads/leads-view-toggle";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import {
  applyLeadListView,
  emptyLeadFilterState,
  type LeadAddedByUserOption,
  type LeadPanelFilterId,
  type LeadQueueSort,
  type LeadQuickFilterId,
} from "@/lib/leads/lead-filters";

export {
  LEAD_QUEUE_SORT_STORAGE_KEY,
  parseLeadQueueSort,
  sortLeadsQueue,
  type LeadQueueSort,
} from "@/lib/leads/lead-filters";

export function filterLeadsByQuery(leads: LeadQueueItem[], query: string): LeadQueueItem[] {
  return applyLeadListView(leads, {
    search: query,
    filters: emptyLeadFilterState(),
    sort: "score",
  });
}

type Props = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  onImportLeads?: () => void;
  onAddLead?: () => void;
  onLinkedInLead?: () => void;
  canWrite?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  listScrollRef?: React.RefObject<HTMLDivElement | null>;
  sort?: LeadQueueSort;
  onSortChange?: (sort: LeadQueueSort) => void;
  quickFilter?: LeadQuickFilterId | null;
  onQuickFilterChange?: (next: LeadQuickFilterId | null) => void;
  panelFilters?: Set<LeadPanelFilterId>;
  onPanelFiltersChange?: (next: Set<LeadPanelFilterId>) => void;
  addedByUserId?: string | null;
  onAddedByUserIdChange?: (next: string | null) => void;
  addedByUsers?: LeadAddedByUserOption[];
  onMergeDuplicates?: () => void | Promise<void>;
  mergingDuplicates?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
};


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

function companySizeLabel(employees?: string | null): string | null {
  const value = employees?.trim();
  if (!value || value === "—") return null;
  return /employee/i.test(value) ? value : `${value} employees`;
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
        <div className="line-clamp-2 min-w-0 text-[14px] font-semibold leading-snug text-brand-ink">{item.name}</div>
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
      <div className="flex items-end justify-between gap-2">
        <span className="shrink-0 rounded-md bg-white/55 px-2 py-0.5 text-[10.5px] font-bold text-brand-ink-soft">
          {statusToDisplayLabel(item.status)}
        </span>
        <ScoreBadge score={item.score} />
      </div>
    </button>
  );
}

export function QueuePanel({
  leads,
  activeId,
  onSelect,
  onRefresh,
  onImportLeads,
  onAddLead,
  onLinkedInLead,
  canWrite,
  searchQuery: controlledSearch,
  onSearchQueryChange,
  listScrollRef,
  sort: controlledSort,
  onSortChange,
  quickFilter: controlledQuick,
  onQuickFilterChange,
  panelFilters: controlledPanel,
  onPanelFiltersChange,
  addedByUserId: controlledAddedByUserId,
  onAddedByUserIdChange,
  addedByUsers = [],
  onMergeDuplicates,
  mergingDuplicates,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const isMobile = useIsMobileLayout();
  const [internalSearch, setInternalSearch] = useState("");
  const [internalSort, setInternalSort] = useState<LeadQueueSort>("score");
  const [internalQuick, setInternalQuick] = useState<LeadQuickFilterId | null>(null);
  const [internalPanel, setInternalPanel] = useState<Set<LeadPanelFilterId>>(new Set());
  const [internalAddedByUserId, setInternalAddedByUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearch;
  const sort = controlledSort ?? internalSort;
  const quick = controlledQuick ?? internalQuick;
  const panel = controlledPanel ?? internalPanel;
  const addedByUserId = controlledAddedByUserId ?? internalAddedByUserId;

  function setSort(next: LeadQueueSort) {
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  }

  function setQuick(next: LeadQuickFilterId | null) {
    if (onQuickFilterChange) onQuickFilterChange(next);
    else setInternalQuick(next);
  }

  function setPanel(next: Set<LeadPanelFilterId>) {
    if (onPanelFiltersChange) onPanelFiltersChange(next);
    else setInternalPanel(next);
  }

  function setAddedByUserId(next: string | null) {
    if (onAddedByUserIdChange) onAddedByUserIdChange(next);
    else setInternalAddedByUserId(next);
  }

  const filters = useMemo(() => ({ quick, panel, addedByUserId }), [quick, panel, addedByUserId]);

  const filteredLeads = useMemo(
    () => applyLeadListView(leads, { search: searchQuery, filters, sort }),
    [leads, searchQuery, filters, sort],
  );

  const duplicateExtra = useMemo(() => countDuplicateExtras(leads), [leads]);
  const hasActiveFilters = Boolean(quick) || panel.size > 0 || Boolean(addedByUserId);
  const emptyMessage = searchQuery
    ? `No leads match "${searchQuery}"`
    : hasActiveFilters
      ? "No leads match these filters"
      : isMobile
        ? "No leads yet"
        : "No leads";

  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const scrollRoot = isMobile ? listScrollRef : desktopScrollRef;
  const canLazyLoad = Boolean(hasMore && onLoadMore);
  const loadMoreSentinelRef = useLoadMoreOnScroll({
    enabled: canLazyLoad,
    loading: Boolean(loadingMore),
    onLoadMore,
    root: scrollRoot,
  });

  const lazyLoadFooter = canLazyLoad ? (
    <div
      ref={loadMoreSentinelRef}
      className="flex h-10 items-center justify-center py-3"
      aria-hidden={!loadingMore}
    >
      {loadingMore ? (
        <Loader2 className="size-4 animate-spin text-brand-ink-faint" aria-label="Loading more leads" />
      ) : null}
    </div>
  ) : null;

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
                {hasActiveFilters ? ` · ${panel.size + (quick ? 1 : 0) + (addedByUserId ? 1 : 0)} filters` : ""}
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
            <LeadFilterBar
              quick={quick}
              panel={panel}
              sort={sort}
              addedByUserId={addedByUserId}
              addedByUsers={addedByUsers}
              onQuickChange={setQuick}
              onPanelChange={setPanel}
              onSortChange={setSort}
              onAddedByUserIdChange={setAddedByUserId}
              size={40}
            />
            {canWrite && onAddLead && onLinkedInLead && onImportLeads ? (
              <LeadAddMenu
                size={40}
                disabled={mergingDuplicates}
                onAddLead={onAddLead}
                onLinkedIn={onLinkedInLead}
                onUpload={onImportLeads}
              />
            ) : null}
          </div>
          {canWrite && onMergeDuplicates && duplicateExtra > 0 ? (
            <div className="mt-2.5">
              <MergeDuplicatesButton
                count={duplicateExtra}
                merging={!!mergingDuplicates}
                onMerge={() => void onMergeDuplicates()}
              />
            </div>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={listScrollRef} className="h-full overflow-y-auto ish-page-padding py-4">
            {filteredLeads.length === 0 ? (
              <div className="mt-12 text-center text-[13px] text-brand-ink-soft">
                {emptyMessage}
                {hasActiveFilters ? (
                  <button
                    type="button"
                    className="mt-2 block w-full text-[12px] font-semibold text-brand-stratus-blue"
                    onClick={() => {
                      setQuick(null);
                      setPanel(new Set());
                    }}
                  >
                    Clear all
                  </button>
                ) : null}
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
            {lazyLoadFooter}
          </div>
          {mergingDuplicates ? <MergingDuplicatesOverlay /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-white/50 ish-glass-sidebar p-4 lg:w-[330px] lg:p-[22px_18px]">
      {canWrite && onMergeDuplicates && duplicateExtra > 0 ? (
        <div className="mb-3">
          <MergeDuplicatesButton
            count={duplicateExtra}
            merging={!!mergingDuplicates}
            onMerge={() => void onMergeDuplicates()}
          />
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div ref={desktopScrollRef} className="h-full overflow-y-auto scrollbar-none px-3 py-1">
          {filteredLeads.length === 0 ? (
            <div className="mt-8 px-2 text-center text-[12px] text-brand-ink-faint">
              {emptyMessage}
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="mt-2 block w-full text-[12px] font-semibold text-brand-stratus-blue"
                  onClick={() => {
                    setQuick(null);
                    setPanel(new Set());
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          ) : (
            filteredLeads.map((item, i) => (
              <QueueCard
                key={item.id}
                item={item}
                index={i}
                active={activeId === item.id}
                onClick={() => onSelect(item.id)}
              />
            ))
          )}
          {lazyLoadFooter}
        </div>
        {mergingDuplicates ? <MergingDuplicatesOverlay /> : null}
      </div>
    </div>
  );
}
