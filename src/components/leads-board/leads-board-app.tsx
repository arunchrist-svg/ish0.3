"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeadAddedByUsers, fetchLeadsPage } from "@/lib/api-client";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  groupLeadsByPipelineStage,
  PIPELINE_STAGES,
} from "@/lib/pipeline-status";
import { toast } from "sonner";
import { BoardColumn } from "./board-column";
import {
  sendEmailsForLeads,
  writeEmailsForLeads,
  type BoardBulkProgress,
  type SendQueueItem,
} from "./board-bulk-actions";
import { MobilePageLayout, SearchBar, AppPageHeader } from "@/design-system";
import { LeadsViewToggle } from "@/components/leads/leads-view-toggle";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { useLoadMoreOnScroll } from "@/hooks/use-load-more-on-scroll";
import {
  applyLeadListView,
  LEAD_ADDED_BY_STORAGE_KEY,
  LEAD_PANEL_FILTERS_STORAGE_KEY,
  LEAD_QUEUE_SORT_STORAGE_KEY,
  LEAD_QUICK_FILTER_STORAGE_KEY,
  parseAddedByUserId,
  parseLeadQueueSort,
  parsePanelFilters,
  parseQuickFilter,
  sortLeadsQueue,
  type LeadAddedByUserOption,
  type LeadPanelFilterId,
  type LeadQueueSort,
  type LeadQuickFilterId,
} from "@/lib/leads/lead-filters";

const SEND_QUEUE_STORAGE_KEY = "ish-board-send-queue";

function sendQueueStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function remainingGapMinutes(item: SendQueueItem, now = Date.now()): number | undefined {
  if (item.status !== "waiting" || !item.waitUntil) return item.gapMinutes;
  return Math.max(1, Math.ceil((item.waitUntil - now) / 60_000));
}

function loadStoredSendQueue(): SendQueueItem[] {
  const storage = sendQueueStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(SEND_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SendQueueItem[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.map((item) => {
      if (item.status === "waiting" && item.waitUntil) {
        if (item.waitUntil <= now) {
          return { ...item, status: "queued", gapMinutes: undefined, waitUntil: undefined };
        }
        return { ...item, gapMinutes: remainingGapMinutes(item, now) };
      }
      if (item.status === "sending") {
        return { ...item, status: "queued", gapMinutes: undefined, waitUntil: undefined };
      }
      return item;
    });
  } catch {
    return [];
  }
}

function persistSendQueue(queue: SendQueueItem[]) {
  const storage = sendQueueStorage();
  if (!storage) return;
  try {
    if (!queue.length) storage.removeItem(SEND_QUEUE_STORAGE_KEY);
    else storage.setItem(SEND_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* ignore quota / private mode */
  }
}

function sendBusyLabel(queue: SendQueueItem[]): string {
  const total = queue.length;
  if (!total) return "Sending…";
  const done = queue.filter((item) =>
    item.status === "sent" || item.status === "failed" || item.status === "cancelled",
  ).length;
  const current = Math.min(done + 1, total);
  const waiting = queue.find((item) => item.status === "waiting");
  const waitMins = waiting ? remainingGapMinutes(waiting) : undefined;
  if (waitMins) {
    return `Waiting ${waitMins}m · ${done} of ${total}`;
  }
  return `Sending ${current} of ${total}`;
}

export function LeadsBoardApp() {
  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [queueSort, setQueueSort] = useState<LeadQueueSort>("score");
  const [quickFilter, setQuickFilter] = useState<LeadQuickFilterId | null>(null);
  const [panelFilters, setPanelFilters] = useState<Set<LeadPanelFilterId>>(new Set());
  const [addedByUserId, setAddedByUserId] = useState<string | null>(null);
  const [addedByUsers, setAddedByUsers] = useState<LeadAddedByUserOption[]>([]);
  const [writingProgress, setWritingProgress] = useState<BoardBulkProgress | null>(null);
  const [sending, setSending] = useState(false);
  const [sendQueue, setSendQueue] = useState<SendQueueItem[]>([]);
  const sendAbortRef = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queueHydrated = useRef(false);

  useEffect(() => {
    const stored = loadStoredSendQueue().filter(
      (item) => item.status === "sent" || item.status === "failed",
    );
    setSendQueue(stored);
    queueHydrated.current = true;
    setQueueSort(parseLeadQueueSort(localStorage.getItem(LEAD_QUEUE_SORT_STORAGE_KEY)));
    setQuickFilter(parseQuickFilter(localStorage.getItem(LEAD_QUICK_FILTER_STORAGE_KEY)));
    setPanelFilters(parsePanelFilters(localStorage.getItem(LEAD_PANEL_FILTERS_STORAGE_KEY)));
    setAddedByUserId(parseAddedByUserId(localStorage.getItem(LEAD_ADDED_BY_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    void fetchLeadAddedByUsers()
      .then((users) => setAddedByUsers(users.map((user) => ({ id: user.id, name: user.name }))))
      .catch(() => setAddedByUsers([]));
  }, []);

  function handleQuickFilterChange(next: LeadQuickFilterId | null) {
    setQuickFilter(next);
    if (next) localStorage.setItem(LEAD_QUICK_FILTER_STORAGE_KEY, next);
    else localStorage.removeItem(LEAD_QUICK_FILTER_STORAGE_KEY);
  }

  function handlePanelFiltersChange(next: Set<LeadPanelFilterId>) {
    setPanelFilters(next);
    localStorage.setItem(LEAD_PANEL_FILTERS_STORAGE_KEY, JSON.stringify([...next]));
  }

  function handleQueueSortChange(next: LeadQueueSort) {
    setQueueSort(next);
    localStorage.setItem(LEAD_QUEUE_SORT_STORAGE_KEY, next);
  }

  function handleAddedByUserIdChange(next: string | null) {
    setAddedByUserId(next);
    if (next) localStorage.setItem(LEAD_ADDED_BY_STORAGE_KEY, next);
    else localStorage.removeItem(LEAD_ADDED_BY_STORAGE_KEY);
  }

  useEffect(() => {
    if (!queueHydrated.current) return;
    persistSendQueue(sendQueue);
  }, [sendQueue]);

  useEffect(() => {
    if (!sendQueue.some((item) => item.status === "waiting" && item.waitUntil)) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [sendQueue]);

  useEffect(() => {
    return () => sendAbortRef.current?.abort();
  }, []);

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const page = await fetchLeadsPage({ limit: 50 });
      setLeads(page.leads);
      setNextCursor(page.nextCursor);
    } catch {
      toast.error("Could not load leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchLeadsPage({ limit: 50, cursor: nextCursor });
      setLeads((prev) => [...prev, ...page.leads]);
      setNextCursor(page.nextCursor);
    } catch {
      toast.error("Could not load more leads");
    } finally {
      setLoadingMore(false);
    }
  }

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useLoadMoreOnScroll({
    enabled: Boolean(nextCursor) && !loading,
    loading: loadingMore,
    onLoadMore: loadMore,
    root: boardScrollRef,
  });

  useEffect(() => {
    load();
  }, []);

  const filteredLeads = useMemo(
    () =>
      applyLeadListView(leads, {
        search,
        filters: { quick: quickFilter, panel: panelFilters, addedByUserId },
        sort: queueSort,
      }),
    [leads, search, quickFilter, panelFilters, addedByUserId, queueSort],
  );

  const grouped = useMemo(() => {
    const groups = groupLeadsByPipelineStage(filteredLeads);
    for (const stage of PIPELINE_STAGES) {
      groups[stage] = sortLeadsQueue(groups[stage] ?? [], queueSort);
    }
    return groups;
  }, [filteredLeads, queueSort]);

  const sendQueueByLeadId = useMemo(
    () =>
      Object.fromEntries(
        sendQueue.map((item) => [
          item.leadId,
          item.status === "waiting"
            ? { ...item, gapMinutes: remainingGapMinutes(item, now) }
            : item,
        ]),
      ),
    [sendQueue, now],
  );

  const boardBusy = Boolean(writingProgress) || sending;

  const handleWriteAll = useCallback(async () => {
    const targets = grouped["Contact Ready"] ?? [];
    if (!targets.length || writingProgress || sending) return;

    setWritingProgress({ current: 0, total: targets.length });
    try {
      const result = await writeEmailsForLeads(targets, setWritingProgress);
      if (result.failed === 0) {
        toast.success(
          result.ok === 1
            ? "Wrote email for 1 lead"
            : `Wrote emails for ${result.ok} leads`,
        );
      } else {
        toast.error(
          `Wrote ${result.ok} of ${targets.length}. ${result.failed} failed.`,
          { description: result.errors.slice(0, 3).join(" · ") },
        );
      }
      await load({ silent: true });
    } finally {
      setWritingProgress(null);
    }
  }, [grouped, writingProgress, sending]);

  const cancelSendAll = useCallback(() => {
    sendAbortRef.current?.abort();
  }, []);

  const handleSendAll = useCallback(async () => {
    const targets = grouped.Email ?? [];
    if (!targets.length || writingProgress || sending) return;

    const confirmed = window.confirm(
      targets.length === 1
        ? "Send the ready email for this lead now?"
        : `Send ready emails for all ${targets.length} leads in Email? Sends are spaced 1–5 minutes apart.`,
    );
    if (!confirmed) return;

    const controller = new AbortController();
    sendAbortRef.current?.abort();
    sendAbortRef.current = controller;
    setSending(true);
    setSendQueue(targets.map((lead) => ({ leadId: lead.id, name: lead.name, status: "queued" })));

    try {
      const result = await sendEmailsForLeads(targets, {
        signal: controller.signal,
        onQueueChange: setSendQueue,
      });
      if (result.cancelled > 0 && result.ok === 0 && result.failed === 0) {
        toast.message("Send queue cancelled");
      } else if (result.failed === 0 && result.cancelled === 0) {
        toast.success(
          result.ok === 1 ? "Sent 1 email" : `Sent ${result.ok} emails`,
        );
      } else {
        toast.error(
          `Sent ${result.ok} of ${targets.length}. ${result.failed} failed${
            result.cancelled ? `, ${result.cancelled} cancelled` : ""
          }.`,
          { description: result.errors.slice(0, 3).join(" · ") },
        );
      }
      await load({ silent: true });
      if (result.failed > 0) {
        setSendQueue((prev) => prev.filter((item) => item.status === "failed"));
      } else {
        window.setTimeout(() => {
          setSendQueue((prev) => (prev.some((item) => item.status === "sending" || item.status === "waiting") ? prev : []));
        }, 4000);
      }
    } finally {
      sendAbortRef.current = null;
      setSending(false);
    }
  }, [grouped, writingProgress, sending]);

  const isEmpty = !loading && leads.length === 0;
  const noResults = !loading && leads.length > 0 && filteredLeads.length === 0;

  return (
    <MobilePageLayout
      title="Leads"
      largeTitle
      className="ish-board-page"
      contentClassName="flex flex-col !overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 pb-2 lg:hidden">
        <LeadsViewToggle />
      </div>
      <div className="flex items-center gap-2 px-4 pb-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search leads" className="!px-0 !py-0" />
        </div>
        <LeadFilterBar
          quick={quickFilter}
          panel={panelFilters}
          sort={queueSort}
          addedByUserId={addedByUserId}
          addedByUsers={addedByUsers}
          onQuickChange={handleQuickFilterChange}
          onPanelChange={handlePanelFiltersChange}
          onSortChange={handleQueueSortChange}
          onAddedByUserIdChange={handleAddedByUserIdChange}
          size={40}
        />
      </div>
      {!loading && !isEmpty ? (
        <div className="flex flex-wrap gap-2 px-4 pb-2 lg:hidden">
          {PIPELINE_STAGES.map((stage) => (
            <span
              key={stage}
              className="rounded-full border border-brand-border/60 bg-white/60 px-2.5 py-1 text-[10.5px] font-semibold text-brand-ink-soft"
            >
              {stage}
              <span className="ml-1.5 tabular-nums text-brand-ink">{grouped[stage]?.length ?? 0}</span>
            </span>
          ))}
        </div>
      ) : null}
      <AppPageHeader
        compact
        icon={Columns3}
        title="Leads"
        titleAddon={<LeadsViewToggle className="h-8" />}
        actions={
          <>
            <div className="relative w-[220px] max-w-full">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                className="w-full rounded-full border border-brand-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-brand-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)] focus:bg-white"
              />
            </div>
            <LeadFilterBar
              quick={quickFilter}
              panel={panelFilters}
              sort={queueSort}
              addedByUserId={addedByUserId}
              addedByUsers={addedByUsers}
              onQuickChange={handleQuickFilterChange}
              onPanelChange={handlePanelFiltersChange}
              onSortChange={handleQueueSortChange}
              onAddedByUserIdChange={handleAddedByUserIdChange}
              size={36}
            />
            <button
              type="button"
              onClick={() => load({ silent: true })}
              disabled={refreshing || boardBusy}
              className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </button>
          </>
        }
      >
        {!loading && !isEmpty ? (
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage) => (
              <span
                key={stage}
                className="rounded-full border border-brand-border/60 bg-white/60 px-2.5 py-1 text-[10.5px] font-semibold text-brand-ink-soft"
              >
                {stage}
                <span className="ml-1.5 tabular-nums text-brand-ink">{grouped[stage].length}</span>
              </span>
            ))}
          </div>
        ) : null}
      </AppPageHeader>

      <div
        ref={boardScrollRef}
        className="ish-page-padding min-h-0 flex-1 overflow-x-auto overflow-y-auto py-3 lg:px-6 lg:py-5"
      >
        {loading ? (
          <BoardSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Search className="size-8 text-brand-ink-faint" />
            <div className="text-[14px] font-semibold text-brand-ink">No matches</div>
            <p className="text-[12px] text-brand-ink-soft">Try a different search or clear filters</p>
          </div>
        ) : (
          <div className="flex h-full min-h-[min(100%,520px)] gap-4 pb-2 scrollbar-none">
            {PIPELINE_STAGES.map((stage) => {
              const columnLeads = grouped[stage] ?? [];
              const writeBusy = Boolean(writingProgress);
              const sendBusy = sending;
              const action =
                stage === "Contact Ready"
                  ? {
                      label: "Email Write All",
                      busyLabel:
                        writingProgress && writingProgress.current > 0
                          ? `Writing ${writingProgress.current} of ${writingProgress.total}`
                          : "Writing…",
                      busy: writeBusy,
                      disabled: boardBusy && !writeBusy,
                      onClick: () => void handleWriteAll(),
                    }
                  : stage === "Email"
                    ? {
                        label: "Send All",
                        busyLabel: sendBusyLabel(sendQueue),
                        busy: sendBusy,
                        disabled: boardBusy && !sendBusy,
                        onClick: () => void handleSendAll(),
                        onCancel: cancelSendAll,
                      }
                    : undefined;

              return (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  leads={columnLeads}
                  action={action}
                  queueByLeadId={
                    stage === "Email" || stage === "Email Sent" ? sendQueueByLeadId : undefined
                  }
                  queueItems={stage === "Email" && sendQueue.length > 0
                    ? sendQueue.map((item) =>
                        item.status === "waiting"
                          ? { ...item, gapMinutes: remainingGapMinutes(item, now) }
                          : item,
                      )
                    : undefined}
                />
              );
            })}
          </div>
        )}
        {nextCursor && !loading ? (
          <div
            ref={loadMoreSentinelRef}
            className="flex h-10 items-center justify-center py-3"
            aria-hidden={!loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="size-4 animate-spin text-brand-ink-faint" aria-label="Loading more leads" />
            ) : null}
          </div>
        ) : null}
      </div>
    </MobilePageLayout>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage} className="flex w-[280px] shrink-0 flex-col gap-3">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-brand-border/50" />
          <div className="h-[120px] animate-pulse rounded-[16px] bg-brand-border/40" />
          <div className="h-[120px] animate-pulse rounded-[16px] bg-brand-border/35" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ish-board-empty flex flex-col items-center justify-center gap-3 rounded-[24px] py-24 text-center">
      <Columns3 className="size-10 text-brand-ink-faint" />
      <div className="text-[15px] font-bold text-brand-ink">No leads yet</div>
      <p className="max-w-sm text-[12.5px] text-brand-ink-soft">
        Scout prospects and save them to see leads appear across pipeline columns.
      </p>
    </div>
  );
}