"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, RefreshCw, Search, Mail, X, Plus } from "lucide-react";
import { CircleButton, IshAvatar, ScoreBadge, SearchBar, Separator } from "@/design-system";
import { cn } from "@/lib/utils";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { statusToDisplayLabel } from "@/lib/pipeline-status";
import { getScoreTone, scoreToneClasses, text } from "@/design-system/tokens";
import type { LeadQueueItem } from "@/lib/api-client";

type Props = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  onAddLead?: () => void;
  canWrite?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  listScrollRef?: React.RefObject<HTMLDivElement | null>;
};

export function filterLeadsByQuery(leads: LeadQueueItem[], query: string): LeadQueueItem[] {
  return leads.filter((item) => matchesQuery(item, query));
}

function matchesQuery(item: LeadQueueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.company, item.title, item.city, item.status, item.action, item.emailStatus]
    .some((field) => field?.toLowerCase().includes(q));
}

function emailStatusDot(status: string) {
  if (status === "verified") return "bg-ish-green";
  if (status === "unverified") return "bg-[#e8a000]";
  return "bg-ish-ink-faint";
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
  const subtitle = [item.title, item.company].filter((v) => v && v !== "—").join(" · ")
    || [item.company, item.city].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ish-leads-card flex h-full w-full flex-col rounded-2xl p-3 text-left",
        "transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "active:scale-[0.98]",
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
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-ish-ink">{item.name}</div>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-ish-ink-soft">{subtitle}</p>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-ish-border/35 pt-2">
        <span className="min-w-0 truncate rounded-full bg-ish-canvas px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ish-ink-soft">
          {statusToDisplayLabel(item.status)}
        </span>
        <span
          className={cn("size-2 shrink-0 rounded-full ring-2 ring-white", emailStatusDot(item.emailStatus))}
          title={item.emailStatus}
        />
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ish-queue-card mb-2 w-full cursor-pointer rounded-[18px] p-4 text-left",
        "transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:translate-y-[-1px] active:scale-[0.99]",
        active
          ? "ish-queue-card-active bg-ish-yellow-gradient"
          : "bg-white shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)]",
      )}
    >
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <IshAvatar name={item.name} index={index} size={42} />
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-bold text-ish-ink">{item.name}</div>
            <div className="mt-0.5 truncate text-xs text-ish-ink-soft">{item.action}</div>
          </div>
        </div>
        <div
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white/60",
            "transition-transform duration-300",
            active && "scale-110",
          )}
        >
          <Mail className="size-3.5 text-ish-ink-soft" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-white/55 px-2 py-0.5 text-[10.5px] font-bold text-ish-ink-soft">
            {statusToDisplayLabel(item.status)}
          </span>
          <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-ish-ink-faint">
            <span className={cn("size-1.5 shrink-0 rounded-full", emailStatusDot(item.emailStatus))} />
            {item.emailStatus}
          </span>
        </div>
        <ScoreBadge score={item.score} />
      </div>
    </button>
  );
}

export function QueuePanel({ leads, activeId, onSelect, onRefresh, onAddLead, canWrite, searchQuery: controlledSearch, onSearchQueryChange, listScrollRef }: Props) {
  const isMobile = useIsMobileLayout();
  const [searchOpen, setSearchOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearch;

  const filteredLeads = useMemo(
    () => filterLeadsByQuery(leads, searchQuery),
    [leads, searchQuery],
  );

  const today = filteredLeads.slice(0, Math.min(3, filteredLeads.length));
  const older = filteredLeads.slice(3);

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
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
        <div className="sticky top-0 z-20 border-b border-ish-border/40 bg-white/80 px-4 pb-2.5 pt-[max(env(safe-area-inset-top),10px)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className={text.pageTitle}>Leads</h1>
              <p className="text-[12px] text-ish-ink-soft">
                {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"}
                {searchQuery ? ` · "${searchQuery}"` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="flex size-10 items-center justify-center rounded-full bg-white text-ish-ink shadow-ish-sm ring-1 ring-ish-border/40 active:scale-95"
                aria-label="Refresh leads"
              >
                <RefreshCw className={cn("size-4 text-ish-stratus-blue", refreshing && "animate-spin")} />
              </button>
              <Link
                href="/leads/board"
                className="flex size-10 items-center justify-center rounded-full bg-white text-ish-ink shadow-ish-sm ring-1 ring-ish-border/40 active:scale-95"
                aria-label="Board view"
              >
                <Calendar className="size-4 text-ish-stratus-blue" />
              </Link>
            </div>
          </div>
          <div className="mt-3">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search leads"
              className="!px-0 !py-0"
            />
          </div>
        </div>

        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto ish-page-padding py-4">
          {filteredLeads.length === 0 ? (
            <div className="mt-12 text-center text-[13px] text-ish-ink-soft">
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
      </div>
    );
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r border-white/50 ish-glass-sidebar p-4 lg:w-[330px] lg:p-[22px_18px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xl font-bold text-ish-ink">My Leads</span>
        <div className="flex gap-1.5">
          {canWrite && onAddLead ? (
            <CircleButton size={30} onClick={onAddLead} aria-label="Add lead">
              <Plus className="size-3.5" />
            </CircleButton>
          ) : null}
          <CircleButton size={30} onClick={() => void handleRefresh()}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </CircleButton>
          <CircleButton size={30}>
            <Calendar className="size-3.5" />
          </CircleButton>
          <CircleButton
            size={30}
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
        </div>
      </div>

      {searchOpen ? (
        <div className="relative mb-3 mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, company…"
            className={cn(
              "w-full rounded-xl border border-ish-border/60 bg-white py-2 pl-9 pr-8 text-[13px] text-ish-ink",
              "placeholder:text-ish-ink-faint focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/12",
            )}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ish-ink-faint hover:bg-ish-canvas hover:text-ish-ink"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none px-3 py-1">
        {filteredLeads.length === 0 ? (
          <div className="mt-8 px-2 text-center text-[12px] text-ish-ink-faint">
            {searchQuery ? `No leads match "${searchQuery}"` : "No leads"}
          </div>
        ) : (
          <>
            {today.length > 0 ? (
              <>
                <div className="mb-2.5 mt-4 text-xs font-semibold text-ish-ink-faint">RECENT</div>
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
                  <Separator className="flex-1 bg-ish-border" />
                  <span className="text-[11.5px] font-semibold text-ish-ink-faint">EARLIER</span>
                  <Separator className="flex-1 bg-ish-border" />
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
        )}
      </div>
    </div>
  );
}
