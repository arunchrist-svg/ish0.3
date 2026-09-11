"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Loader2, Pencil, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeadAddedByUsers, fetchLeadsPage, fetchLeadStageCounts, fetchQueuedLeadsPage, fetchWriteAllProgress, runWriterSequence, writeAllLeadsForStage, cancelQueuedOutreach, sendQueuedOutreachNow, runSequencerNow } from "@/lib/api-client";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  BOARD_QUEUED_STAGE,
  boardPipelineStages,
  groupLeadsByPipelineStage,
  PIPELINE_STAGES,
  STATUSES_BY_STAGE_INDEX,
} from "@/lib/pipeline-status";
import { toast } from "sonner";
import { BoardColumn } from "./board-column";
import {
  sendEmailsForLeads,
  sendEmailsForStage,
  type BoardBulkProgress,
  type SendQueueItem,
} from "./board-bulk-actions";
import {
  getOutreachTemplatesForPack,
} from "@/lib/email/outreach-templates";
import { getBoardTemplateOverride, setBoardTemplateOverride } from "@/lib/board-template-override";
import { OutreachComposeModal } from "@/components/email/outreach-compose-modal";
import { MobilePageLayout, SearchBar, AppPageHeader } from "@/design-system";
import { LeadsViewToggle } from "@/components/leads/leads-view-toggle";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { WritingLoader } from "@/components/sales-accelerator/writing-loader";
import { WriteAllModal, type WriteAllPhase } from "@/components/leads-board/write-all-modal";
import { SendAllModal, type SendAllPhase } from "@/components/leads-board/send-all-modal";
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
  const [writeTemplate, setWriteTemplate] = useState<string | null>(() => getBoardTemplateOverride());
  const [writeAllOpen, setWriteAllOpen] = useState(false);
  const [writeAllMode, setWriteAllMode] = useState<"write" | "rewrite">("write");
  const [writeAllPhase, setWriteAllPhase] = useState<WriteAllPhase>("pick");
  const [writeAllResult, setWriteAllResult] = useState<{
    ok: number;
    failed: number;
    cancelled: number;
    queued?: boolean;
  } | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [sendAllPhase, setSendAllPhase] = useState<SendAllPhase>("confirm");
  const [sendAllResult, setSendAllResult] = useState<{
    ok: number;
    failed: number;
    cancelled: number;
    planSpanDays?: number;
    sequencerProcessed?: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [sequencerRunning, setSequencerRunning] = useState(false);
  const [sendQueue, setSendQueue] = useState<SendQueueItem[]>([]);
  const [cancellingLeadId, setCancellingLeadId] = useState<string | null>(null);
  const [cancellingAllQueued, setCancellingAllQueued] = useState(false);
  const sendAbortRef = useRef<AbortController | null>(null);
  const cancelledLeadIdsRef = useRef<Set<string>>(new Set());
  const writeAbortRef = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queueHydrated = useRef(false);
  const [composeLeadId, setComposeLeadId] = useState<string | null>(null);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [emailReadyCount, setEmailReadyCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [queuedLeadsServer, setQueuedLeadsServer] = useState<LeadQueueItem[]>([]);

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
    return () => {
      sendAbortRef.current?.abort();
      writeAbortRef.current?.abort();
    };
  }, []);

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [page, countData, queuedPage] = await Promise.all([
        fetchLeadsPage({ limit: 50 }),
        fetchLeadStageCounts(),
        fetchQueuedLeadsPage({ limit: 5000 }),
      ]);
      setLeads(page.leads);
      setNextCursor(page.nextCursor);
      setStageCounts(countData.byStage);
      setEmailReadyCount(countData.emailReady);
      setQueuedCount(countData.queued);
      setQueuedLeadsServer(queuedPage.leads);
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

  const boardStages = useMemo(() => boardPipelineStages(), []);

  const filteredLeads = useMemo(
    () =>
      applyLeadListView(leads, {
        search,
        filters: { quick: quickFilter, panel: panelFilters, addedByUserId },
        sort: queueSort,
      }),
    [leads, search, quickFilter, panelFilters, addedByUserId, queueSort],
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

  const activeSendQueue = useMemo(
    () =>
      sendQueue
        .filter((item) =>
          item.status === "queued" ||
          item.status === "waiting" ||
          item.status === "sending" ||
          (sending && (item.status === "sent" || item.status === "failed")),
        )
        .map((item) =>
          item.status === "waiting"
            ? { ...item, gapMinutes: remainingGapMinutes(item, now) }
            : item,
        ),
    [sendQueue, sending, now],
  );

  const leadsById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead])),
    [leads],
  );

  const queuedLeads = useMemo((): LeadQueueItem[] => {
    const byId = new Map<string, LeadQueueItem>();

    for (const lead of queuedLeadsServer) {
      byId.set(lead.id, lead);
    }

    for (const lead of filteredLeads) {
      if (lead.pendingSendScheduledFor) byId.set(lead.id, lead);
    }

    for (const item of activeSendQueue) {
      const existing = leadsById.get(item.leadId) ?? byId.get(item.leadId);
      if (existing) {
        byId.set(item.leadId, existing);
        continue;
      }
      byId.set(item.leadId, {
        id: item.leadId,
        name: item.name,
        title: "—",
        company: "—",
        city: "—",
        score: 0,
        status: "approved",
        action: "Sending",
        emailStatus: "unverified",
      });
    }

    return Array.from(byId.values()).sort((a, b) => {
      const ta = a.pendingSendScheduledFor ? new Date(a.pendingSendScheduledFor).getTime() : 0;
      const tb = b.pendingSendScheduledFor ? new Date(b.pendingSendScheduledFor).getTime() : 0;
      return ta - tb;
    });
  }, [activeSendQueue, filteredLeads, leadsById, queuedLeadsServer]);

  const grouped = useMemo(() => {
    const groups = groupLeadsByPipelineStage(filteredLeads);
    for (const stage of PIPELINE_STAGES) {
      groups[stage] = sortLeadsQueue(groups[stage] ?? [], queueSort);
    }
    const queuedIds = new Set(queuedLeads.map((lead) => lead.id));
    // Pending sends live only in Queued, not under Email / Email Sent / other stages.
    for (const stage of PIPELINE_STAGES) {
      groups[stage] = (groups[stage] ?? []).filter((lead) => !queuedIds.has(lead.id));
    }
    groups[BOARD_QUEUED_STAGE] = queuedLeads;
    return groups;
  }, [filteredLeads, queueSort, queuedLeads]);

  const boardBusy = Boolean(writingProgress) || sending || sequencerRunning;
  const sendQueueActive = activeSendQueue.some(
    (item) => item.status === "queued" || item.status === "waiting" || item.status === "sending",
  );

  const writeTemplates = useMemo(
    () =>
      getOutreachTemplatesForPack("gifting-sweets").filter(
        (t) => t.id !== "follow_up" && t.id !== "final_reminder",
      ),
    [],
  );

  const openWriteAllModal = useCallback(
    (mode: "write" | "rewrite") => {
      if (sending) return;
      if (writeAllPhase === "writing") {
        setWriteAllOpen(true);
        return;
      }
      const nextTemplate = writeTemplate ?? writeTemplates[0]?.id ?? null;
      if (nextTemplate && nextTemplate !== writeTemplate) {
        setWriteTemplate(nextTemplate);
        setBoardTemplateOverride(nextTemplate);
      }
      setWriteAllMode(mode);
      setWriteAllPhase("pick");
      setWriteAllResult(null);
      setWriteAllOpen(true);
    },
    [sending, writeAllPhase, writeTemplate, writeTemplates],
  );

  const closeWriteAllModal = useCallback(() => {
    if (writeAllPhase === "writing") return;
    setWriteAllOpen(false);
    setWriteAllPhase("pick");
    setWriteAllResult(null);
  }, [writeAllPhase]);

  const runBulkWriteFromModal = useCallback(async () => {
    if (writingProgress || sending) return;
    const stageLabel = writeAllMode === "rewrite" ? "Email" : "Contact Ready";
    const stageIndex = writeAllMode === "rewrite" ? 1 : 0;
    const label = writeAllMode === "rewrite" ? "Rewrite" : "Write";
    const statuses = STATUSES_BY_STAGE_INDEX[stageIndex] ?? [];
    const total = stageCounts[stageLabel] ?? grouped[stageLabel]?.length ?? 0;
    if (!total || !statuses.length) {
      toast.message(`No leads in ${stageLabel} to ${label.toLowerCase()}`);
      return;
    }

    writeAbortRef.current?.abort();
    const controller = new AbortController();
    writeAbortRef.current = controller;
    const startedAt = new Date().toISOString();
    setWriteAllPhase("writing");
    setWritingProgress({ current: 0, total });
    try {
      const queued = await writeAllLeadsForStage({
        statuses,
        outreachTemplate: writeTemplate ?? undefined,
      });

      if (queued.enqueued === 0) {
        toast.message(`No leads queued to ${label.toLowerCase()}`);
        setWriteAllPhase("pick");
        return;
      }

      const batchTotal = queued.enqueued;
      setWritingProgress({ current: 0, total: batchTotal });

      let completed = 0;
      let lastCompleted = -1;
      let stallPolls = 0;
      const pollIntervalMs = 1500;
      const stallLimit = 60;

      while (!controller.signal.aborted) {
        const progress = await fetchWriteAllProgress({
          statuses,
          startedAt,
          total: batchTotal,
        });
        completed = progress.completed;
        setWritingProgress({ current: completed, total: batchTotal });
        void load({ silent: true });

        if (completed >= batchTotal) {
          setWriteAllResult({ ok: completed, failed: 0, cancelled: 0 });
          setWriteAllPhase("done");
          toast.success(
            `${label === "Rewrite" ? "Rewrote" : "Wrote"} ${completed.toLocaleString()} ${
              completed === 1 ? "email" : "emails"
            }`,
          );
          return;
        }

        if (completed === lastCompleted) stallPolls += 1;
        else {
          stallPolls = 0;
          lastCompleted = completed;
        }
        if (stallPolls >= stallLimit) {
          const failed = batchTotal - completed;
          setWriteAllResult({ ok: completed, failed, cancelled: 0 });
          setWriteAllPhase("done");
          toast.message(
            `${label} finished with ${completed.toLocaleString()} done${
              failed > 0 ? `, ${failed.toLocaleString()} still running or failed` : ""
            }`,
          );
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, pollIntervalMs);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setWriteAllResult({ ok: 0, failed: 0, cancelled: 1 });
        setWriteAllPhase("done");
        return;
      }
      const message = e instanceof Error ? e.message : `${label} All failed`;
      toast.error(message);
      setWriteAllPhase("pick");
    } finally {
      writeAbortRef.current = null;
      setWritingProgress(null);
    }
  }, [writingProgress, sending, writeAllMode, grouped, stageCounts, writeTemplate]);

  const handleWriteLead = useCallback(async (lead: LeadQueueItem) => {
    if (boardBusy) return;
    const controller = new AbortController();
    writeAbortRef.current?.abort();
    writeAbortRef.current = controller;
    setWritingProgress({ current: 1, total: 1, leadName: lead.name });
    try {
      await runWriterSequence(lead.id, { outreachTemplate: writeTemplate ?? undefined });
      if (controller.signal.aborted) {
        toast.message("Write cancelled");
        return;
      }
      toast.success(`Email drafted for ${lead.name}`);
      await load({ silent: true });
    } catch {
      if (!controller.signal.aborted) {
        toast.error(`Could not write email for ${lead.name}`);
      }
    } finally {
      writeAbortRef.current = null;
      setWritingProgress(null);
    }
  }, [boardBusy, writeTemplate]);

  const handleSendLead = useCallback(async (lead: LeadQueueItem) => {
    if (boardBusy) return;
    const confirmed = window.confirm(
      `Queue the ready email for ${lead.name} in your Settings send window (respects daily cap)?`,
    );
    if (!confirmed) return;

    const controller = new AbortController();
    sendAbortRef.current?.abort();
    sendAbortRef.current = controller;
    setSending(true);
    setSendQueue([{ leadId: lead.id, name: lead.name, status: "queued" }]);
    cancelledLeadIdsRef.current = new Set();
    try {
      const result = await sendEmailsForLeads([lead], {
        signal: controller.signal,
        onQueueChange: setSendQueue,
        isLeadCancelled: (id) => cancelledLeadIdsRef.current.has(id),
      });
      if (result.cancelled > 0 && result.ok === 0) {
        toast.message("Send cancelled");
      } else if (result.failed === 0 && result.cancelled === 0) {
        toast.success(`Queued email for ${lead.name}`);
      } else {
        toast.error(`Failed to send email to ${lead.name}`);
      }
      await load({ silent: true });
      window.setTimeout(() => {
        setSendQueue((prev) =>
          prev.some((item) => item.status === "sending" || item.status === "waiting") ? prev : [],
        );
      }, 4000);
    } finally {
      sendAbortRef.current = null;
      setSending(false);
    }
  }, [boardBusy]);

  const handleSendQueuedLead = useCallback(
    async (lead: LeadQueueItem) => {
      if (boardBusy) return;
      if (!lead.pendingSendScheduleId && !lead.pendingSendScheduledFor) {
        toast.message("No queued Email 1 for this lead");
        return;
      }
      const confirmed = window.confirm(`Send the queued email to ${lead.name} now?`);
      if (!confirmed) return;

      setCancellingLeadId(lead.id);
      try {
        await sendQueuedOutreachNow({
          scheduleId: lead.pendingSendScheduleId,
          leadId: lead.id,
        });
        toast.success(`Sent email to ${lead.name}`);
        await load({ silent: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send queued email");
      } finally {
        setCancellingLeadId(null);
      }
    },
    [boardBusy],
  );

  const cancelSendAll = useCallback(() => {
    sendAbortRef.current?.abort();
    setSendQueue((prev) =>
      prev.map((item) =>
        item.status === "queued" || item.status === "waiting" || item.status === "sending"
          ? { ...item, status: "cancelled" as const, gapMinutes: undefined, waitUntil: undefined }
          : item,
      ),
    );
  }, []);

  const handleCancelQueuedLead = useCallback(
    async (lead: LeadQueueItem) => {
      const inFlight = sendQueue.find(
        (item) =>
          item.leadId === lead.id &&
          (item.status === "queued" || item.status === "waiting" || item.status === "sending"),
      );
      if (inFlight?.status === "sending") {
        toast.message("This email is already sending and cannot be cancelled");
        return;
      }

      const confirmed = window.confirm(`Cancel the queued email for ${lead.name}?`);
      if (!confirmed) return;

      setCancellingLeadId(lead.id);
      try {
        if (inFlight) {
          cancelledLeadIdsRef.current.add(lead.id);
          setSendQueue((prev) =>
            prev.map((item) =>
              item.leadId === lead.id
                ? { ...item, status: "cancelled" as const, gapMinutes: undefined, waitUntil: undefined }
                : item,
            ),
          );
        }

        if (lead.pendingSendScheduledFor) {
          const result = await cancelQueuedOutreach([lead.id]);
          if (result.cancelled === 0 && !inFlight) {
            toast.message("Nothing left to cancel for this lead");
          } else {
            toast.success(`Cancelled queued email for ${lead.name}`);
          }
        } else if (inFlight) {
          toast.success(`Cancelled queued email for ${lead.name}`);
        } else {
          toast.message("Nothing left to cancel for this lead");
        }
        await load({ silent: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not cancel queued email");
      } finally {
        setCancellingLeadId(null);
      }
    },
    [sendQueue],
  );

  const handleCancelAllQueued = useCallback(async () => {
    const persistedIds = queuedLeads
      .filter((lead) => lead.pendingSendScheduledFor)
      .map((lead) => lead.id);
    const hasInFlight = sending || sendQueueActive;

    if (!persistedIds.length && !hasInFlight) return;

    const confirmed = window.confirm(
      queuedLeads.length <= 1
        ? "Cancel this queued email?"
        : "Cancel all queued emails?",
    );
    if (!confirmed) return;

    setCancellingAllQueued(true);
    try {
      if (hasInFlight) {
        for (const item of activeSendQueue) {
          cancelledLeadIdsRef.current.add(item.leadId);
        }
        cancelSendAll();
      }

      if (persistedIds.length) {
        const result = await cancelQueuedOutreach(persistedIds);
        toast.success(
          result.leadIds.length === 1
            ? "Cancelled 1 queued email"
            : `Cancelled ${result.leadIds.length || result.cancelled} queued emails`,
        );
      } else {
        toast.message("Send queue cancelled");
      }
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel queued emails");
    } finally {
      setCancellingAllQueued(false);
    }
  }, [queuedLeads, sending, sendQueueActive, activeSendQueue, cancelSendAll]);

  const openSendAllModal = useCallback(() => {
    if (writingProgress || sending) return;
    if (sendAllPhase === "sending") {
      setSendAllOpen(true);
      return;
    }
    const total = emailReadyCount || grouped.Email?.length || 0;
    if (!total) {
      toast.message("No ready emails in Email to send");
      return;
    }
    setSendAllPhase("confirm");
    setSendAllResult(null);
    setSendAllOpen(true);
  }, [writingProgress, sending, sendAllPhase, emailReadyCount, grouped]);

  const closeSendAllModal = useCallback(() => {
    if (sendAllPhase === "sending") return;
    setSendAllOpen(false);
    setSendAllPhase("confirm");
    setSendAllResult(null);
  }, [sendAllPhase]);

  const runSendAllFromModal = useCallback(async () => {
    const total = emailReadyCount;
    const emailStatuses = STATUSES_BY_STAGE_INDEX[1] ?? [];
    if (!total || !emailStatuses.length || writingProgress || sending) return;

    const controller = new AbortController();
    sendAbortRef.current?.abort();
    sendAbortRef.current = controller;
    setSendAllPhase("sending");
    setSending(true);
    setSendQueue([]);
    cancelledLeadIdsRef.current = new Set();

    try {
      const result = await sendEmailsForStage(
        { statuses: emailStatuses, totalHint: total },
        {
          signal: controller.signal,
          onQueueChange: setSendQueue,
          onProgress: () => {
            void load({ silent: true });
          },
          processDue: true,
        },
      );
      setSendAllResult({
        ok: result.ok,
        failed: result.failed,
        cancelled: result.cancelled,
        planSpanDays: result.planSpanDays,
        sequencerProcessed: result.sequencer?.processed,
      });
      setSendAllPhase("done");
      if (result.cancelled > 0 && result.ok === 0 && result.failed === 0) {
        toast.message("Send cancelled");
      } else if (result.failed === 0 && result.cancelled === 0) {
        const spanNote =
          result.planSpanDays && result.planSpanDays > 1
            ? ` across ${result.planSpanDays} days`
            : "";
        const sentNow =
          result.sequencer && result.sequencer.processed > 0
            ? ` · ${result.sequencer.processed} sent now`
            : "";
        toast.success(
          result.ok === 1
            ? "Queued 1 email for your send window"
            : `Queued ${result.ok.toLocaleString()} emails${spanNote}${sentNow}`,
          { duration: 8000 },
        );
      } else {
        toast.error(
          `Queued ${result.ok.toLocaleString()} of ${total.toLocaleString()}. ${result.failed} failed${
            result.cancelled ? `, ${result.cancelled} cancelled` : ""
          }.`,
          { description: result.errors.slice(0, 3).join(" · ") },
        );
      }
      await load({ silent: true });
      window.setTimeout(() => {
        setSendQueue((prev) =>
          prev.some((item) => item.status === "sending" || item.status === "waiting") ? prev : [],
        );
      }, 4000);
    } catch {
      setSendAllPhase("confirm");
    } finally {
      sendAbortRef.current = null;
      setSending(false);
    }
  }, [emailReadyCount, writingProgress, sending, load]);

  const handleRunSequencer = useCallback(async () => {
    if (boardBusy || sequencerRunning) return;
    setSequencerRunning(true);
    try {
      const result = await runSequencerNow();
      const parts = [`${result.processed} sent`];
      if (result.failed) parts.push(`${result.failed} failed`);
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      if (result.pendingReview) parts.push(`${result.pendingReview} need review`);
      toast.success("Due sends processed", {
        description: parts.join(" · "),
        duration: 8000,
      });
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run sequencer");
    } finally {
      setSequencerRunning(false);
    }
  }, [boardBusy, sequencerRunning, load]);

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
      />

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
            {boardStages.map((stage) => {
              const columnLeads = grouped[stage] ?? [];
              const writeBusy = Boolean(writingProgress);
              const sendBusy = sending;
              const isQueuedStage = stage === BOARD_QUEUED_STAGE;

              const emailRewriteButton =
                stage === "Email" ? (
                  <button
                    type="button"
                    disabled={boardBusy && !writeBusy}
                    onClick={() => openWriteAllModal("rewrite")}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border border-brand-border/70 bg-white/80 text-brand-ink-soft transition-all",
                      "hover:border-brand-ink/25 hover:text-brand-ink",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      (writeAllOpen && writeAllMode === "rewrite") || writeBusy
                        ? "border-brand-stratus-blue/30 text-brand-stratus-blue"
                        : null,
                    )}
                    aria-label="Rewrite emails"
                    title="Rewrite emails"
                  >
                    {writeBusy && writeAllMode === "rewrite" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Pencil className="size-3" />
                    )}
                  </button>
                ) : null;

              const writeBusyLabel =
                writingProgress && writingProgress.current === 0 && writingProgress.total > 0
                  ? "Queuing…"
                  : writingProgress && writingProgress.total > 0
                    ? `${writeAllMode === "rewrite" ? "Rewriting" : "Writing"} ${writingProgress.current} of ${writingProgress.total}`
                    : writeAllMode === "rewrite"
                      ? "Rewriting…"
                      : "Writing…";

              const actions =
                stage === "Contact Ready"
                  ? [
                      {
                        label: "Write All",
                        busyLabel: writeBusyLabel,
                        busy: writeBusy && writeAllMode === "write",
                        disabled: boardBusy && !writeBusy,
                        onClick: () => openWriteAllModal("write"),
                      },
                    ]
                  : stage === "Email"
                    ? [
                        {
                          label: "Send All",
                          busyLabel: sendBusyLabel(sendQueue),
                          busy: sendBusy,
                          disabled: boardBusy && !sendBusy,
                          onClick: () => openSendAllModal(),
                        },
                      ]
                    : isQueuedStage && queuedCount > 0
                      ? [
                          {
                            label: "Send due now",
                            busyLabel: "Sending…",
                            busy: sequencerRunning,
                            disabled: (boardBusy && !sequencerRunning) || cancellingAllQueued,
                            onClick: () => void handleRunSequencer(),
                          },
                          {
                            label: "Cancel All",
                            busyLabel: "Cancelling…",
                            busy: cancellingAllQueued,
                            tone: "danger" as const,
                            disabled:
                              cancellingAllQueued ||
                              Boolean(cancellingLeadId) ||
                              (boardBusy && !cancellingAllQueued),
                            onClick: () => void handleCancelAllQueued(),
                          },
                        ]
                      : undefined;

              const columnCount = isQueuedStage
                ? queuedCount
                : stage === "Email"
                  ? emailReadyCount
                  : stageCounts[stage];

              return (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  leads={columnLeads}
                  totalCount={columnCount}
                  actions={actions}
                  headerAccessory={emailRewriteButton}
                  queueByLeadId={
                    isQueuedStage || stage === "Email Sent" ? sendQueueByLeadId : undefined
                  }
                  onLeadOpen={
                    stage === "Email" || isQueuedStage || stage === "Email Sent"
                      ? (lead) => setComposeLeadId(lead.id)
                      : undefined
                  }
                  onLeadWrite={
                    stage === "Contact Ready" || stage === "Email" ? handleWriteLead : undefined
                  }
                  onLeadSend={
                    stage === "Email"
                      ? handleSendLead
                      : isQueuedStage
                        ? handleSendQueuedLead
                        : undefined
                  }
                  onLeadCancel={isQueuedStage ? handleCancelQueuedLead : undefined}
                  cancellingLeadId={isQueuedStage ? cancellingLeadId : null}
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
      {writingProgress && !writeAllOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Writing email"
        >
          <div className="w-full max-w-sm rounded-[24px] border border-brand-border/60 bg-white p-2 shadow-[var(--shadow-brand-lg)]">
            <WritingLoader
              contactName={writingProgress.leadName}
              sequenceLabel={
                writingProgress.leadName
                  ? `Writing smart emails for ${writingProgress.leadName}`
                  : "Writing smart emails"
              }
            />
          </div>
        </div>
      ) : null}
      <SendAllModal
        open={sendAllOpen}
        leadCount={emailReadyCount || grouped.Email?.length || 0}
        queuedCount={queuedCount}
        phase={sendAllPhase}
        sendQueue={sendQueue}
        sendingLabel={
          sendAllPhase === "sending" && emailReadyCount > 0
            ? `Scheduling ${emailReadyCount.toLocaleString()} emails…`
            : undefined
        }
        result={sendAllResult}
        onSend={() => void runSendAllFromModal()}
        onCancelSend={() => {
          cancelSendAll();
          sendAbortRef.current?.abort();
        }}
        onClose={closeSendAllModal}
      />
      <WriteAllModal
        open={writeAllOpen}
        mode={writeAllMode}
        templates={writeTemplates}
        selectedTemplateId={writeTemplate ?? writeTemplates[0]?.id ?? null}
        onSelectTemplate={(id) => {
          setWriteTemplate(id);
          setBoardTemplateOverride(id);
        }}
        leadCount={
          writeAllMode === "rewrite"
            ? (stageCounts.Email ?? grouped.Email?.length ?? 0)
            : (stageCounts["Contact Ready"] ?? grouped["Contact Ready"]?.length ?? 0)
        }
        phase={writeAllPhase}
        progress={writingProgress}
        result={writeAllResult}
        onWrite={() => void runBulkWriteFromModal()}
        onClose={closeWriteAllModal}
      />
      {composeLeadId ? (
        <OutreachComposeModal
          leadId={composeLeadId}
          tab="needs_review"
          onClose={() => setComposeLeadId(null)}
          onChanged={() => void load({ silent: true })}
        />
      ) : null}
    </MobilePageLayout>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {boardPipelineStages().map((stage) => (
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