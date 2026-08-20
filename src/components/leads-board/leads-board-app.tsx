"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeads } from "@/lib/api-client";
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

function matchesQuery(item: LeadQueueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.company, item.title, item.city, item.status, item.action, item.emailStatus]
    .some((field) => field?.toLowerCase().includes(q));
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [writingProgress, setWritingProgress] = useState<BoardBulkProgress | null>(null);
  const [sending, setSending] = useState(false);
  const [sendQueue, setSendQueue] = useState<SendQueueItem[]>([]);
  const sendAbortRef = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queueHydrated = useRef(false);

  useEffect(() => {
    setSendQueue(loadStoredSendQueue());
    queueHydrated.current = true;
  }, []);

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
      const data = await fetchLeads();
      setLeads(data);
    } catch {
      toast.error("Could not load leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredLeads = useMemo(
    () => leads.filter((item) => matchesQuery(item, search)),
    [leads, search],
  );

  const grouped = useMemo(
    () => groupLeadsByPipelineStage(filteredLeads),
    [filteredLeads],
  );

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
      <SearchBar value={search} onChange={setSearch} placeholder="Search leads" sticky className="lg:hidden" />
      <AppPageHeader
        compact
        icon={Columns3}
        title="Leads"
        subtitle="Board view"
        actions={
          <>
            <LeadsViewToggle />
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

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
        {loading ? (
          <BoardSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Search className="size-8 text-brand-ink-faint" />
            <div className="text-[14px] font-semibold text-brand-ink">No matches</div>
            <p className="text-[12px] text-brand-ink-soft">Try a different search term</p>
          </div>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto pb-2 scrollbar-none">
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
                />
              );
            })}
          </div>
        )}
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