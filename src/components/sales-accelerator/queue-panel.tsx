"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, RefreshCw, Search, Mail, X } from "lucide-react";
import { CircleButton, IshAvatar, ScoreBadge, Separator } from "@/design-system";
import { cn } from "@/lib/utils";
import type { LeadQueueItem } from "@/lib/api-client";

type Props = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
};

function matchesQuery(item: LeadQueueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.company, item.title, item.city, item.status, item.action, item.emailStatus]
    .some((field) => field?.toLowerCase().includes(q));
}

export function QueuePanel({ leads, activeId, onSelect, onRefresh }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredLeads = useMemo(
    () => leads.filter((item) => matchesQuery(item, searchQuery)),
    [leads, searchQuery],
  );

  const today = filteredLeads.slice(0, Math.min(3, filteredLeads.length));
  const older = filteredLeads.slice(3);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
    }
  }, [searchOpen]);

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setSearchQuery("");
      return !open;
    });
  }

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex h-full w-[330px] shrink-0 flex-col border-r border-white/50 ish-glass-sidebar p-[22px_18px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xl font-bold text-ish-ink">My Leads</span>
        <div className="flex gap-1.5">
          <CircleButton size={30} onClick={() => void handleRefresh()}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </CircleButton>
          <CircleButton size={30}>
            <Calendar className="size-3.5" />
          </CircleButton>
          <CircleButton size={30} active={searchOpen} onClick={toggleSearch} aria-label="Search leads">
            <Search className="size-3.5" />
          </CircleButton>
        </div>
      </div>

      {searchOpen && (
        <div className="relative mb-3 mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, company…"
            className={cn(
              "w-full rounded-xl border border-ish-border/60 bg-white py-2 pl-9 pr-8 text-[13px] text-ish-ink",
              "placeholder:text-ish-ink-faint focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/12",
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ish-ink-faint hover:bg-ish-canvas hover:text-ish-ink"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
        {filteredLeads.length === 0 ? (
          <div className="mt-8 px-2 text-center text-[12px] text-ish-ink-faint">
            {searchQuery ? `No leads match "${searchQuery}"` : "No leads"}
          </div>
        ) : (
          <>
            {today.length > 0 && (
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
            )}

            {older.length > 0 && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}

function emailStatusDot(status: string) {
  if (status === "verified") return "bg-ish-green";
  if (status === "unverified") return "bg-[#e8a000]";
  return "bg-ish-ink-faint";
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
        "mb-2.5 w-full cursor-pointer overflow-hidden rounded-[18px] p-4 text-left",
        "transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:translate-y-[-1px] active:scale-[0.99]",
        active
          ? "bg-ish-yellow-gradient shadow-[var(--shadow-ish-yellow)]"
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
            {item.status}
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
