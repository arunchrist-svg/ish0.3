"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Send,
  Search,
  Flame,
  FileText,
  ListChecks,
  Pause,
  Play,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobilePageLayout, PanelCard, AppPageHeader, text } from "@/design-system";
import {
  fetchEmailLogs,
  fetchEmailOverview,
  setOutreachSendingPaused,
  type EmailLogStatus,
  type EmailLogsData,
  type EmailOverviewData,
} from "@/lib/api-client";
import { SyncRepliesButton } from "@/components/sales-accelerator/sync-replies-button";
import { EmailLogsTable } from "@/components/email/email-logs-table";
import type { LeadEmailRow } from "@/app/api/email/overview/route";
import {
  type CadenceDays,
  sequenceStepDays,
  emailStepLabel,
  isEmailSentForStep,
  normalizeCadenceDays,
} from "@/lib/email/cadence";

type QueueTab = "needs_review" | "active" | "hot" | "replies" | "done";
type PageTab = QueueTab | "logs";

const QUEUE_TABS: {
  id: QueueTab;
  label: string;
  icon: React.ElementType;
  accent?: string;
}[] = [
  { id: "needs_review", label: "Needs Review", icon: FileText, accent: "text-brand-ink" },
  { id: "active", label: "Active", icon: Send, accent: "text-brand-stratus-blue" },
  { id: "hot", label: "Hot", icon: Flame, accent: "text-brand-stratus-salmon" },
  { id: "replies", label: "Replies", icon: MessageSquare, accent: "text-brand-stratus-blue" },
  { id: "done", label: "Done", icon: CheckCircle2, accent: "text-brand-ink-soft" },
];

const VALID_TABS = new Set<PageTab>([...QUEUE_TABS.map((t) => t.id), "logs"]);

const EMPTY_BY_TAB: Record<QueueTab, { title: string; body: string }> = {
  needs_review: {
    title: "Queue is clear",
    body: "No Email 1 drafts waiting. Scout a lead and write from Leads.",
  },
  active: {
    title: "No active sequences",
    body: "Send Email 1 to start automated follow-ups on your configured cadence.",
  },
  hot: {
    title: "No hot leads",
    body: "Prospects who open without replying show up here so you can prioritize.",
  },
  replies: {
    title: "Inbox quiet",
    body: "When someone replies, their thread lands here with a suggested next step.",
  },
  done: {
    title: "Nothing finished yet",
    body: "Completed sequences and closed threads appear in this tab.",
  },
};

const AVATAR_COLORS = [
  "bg-brand-avatar-1",
  "bg-brand-avatar-2",
  "bg-brand-avatar-3",
  "bg-brand-avatar-4",
  "bg-brand-avatar-5",
  "bg-brand-avatar-6",
];

function parsePageTab(raw: string | null): PageTab {
  if (raw && VALID_TABS.has(raw as PageTab)) return raw as PageTab;
  return "active";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isDueToday(iso: string): boolean {
  const due = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return due <= today;
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function tabRows(data: EmailOverviewData, tab: QueueTab): LeadEmailRow[] {
  switch (tab) {
    case "needs_review":
      return data.needsReview;
    case "active":
      return data.active.filter((r) => r.sequenceState === "active");
    case "hot":
      return data.hot;
    case "replies":
      return data.replies;
    case "done":
      return data.done;
    default:
      return [];
  }
}

function tabCount(data: EmailOverviewData, tab: QueueTab): number {
  const counts = data.stats.tabCounts;
  if (counts) return counts[tab] ?? 0;
  return tabRows(data, tab).length;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  valueClass,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconClass: string;
  valueClass?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={cn(
        "ish-email-kpi flex min-w-0 items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-left transition-all duration-200",
        onClick && "cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/30",
      )}
    >
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-brand-sm)]", iconClass)}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-brand-ink-faint">{label}</span>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className={cn("text-[20px] font-extrabold leading-none tabular-nums", valueClass ?? "text-brand-ink")}>
            {value}
          </span>
          {sub ? <span className="truncate text-[10px] font-medium text-brand-ink-soft">{sub}</span> : null}
        </div>
      </div>
    </Comp>
  );
}

// ─── Sequence rail ────────────────────────────────────────────────────────────

function daysUntilSend(scheduledFor?: string | null): number | null {
  if (!scheduledFor) return null;
  const diff = new Date(scheduledFor).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function sequenceStepDisplay(
  step: {
    short: string;
    status: string;
    day: number;
    scheduledFor?: string | null;
  },
  nextEmailDay: number | null,
  nextEmailDue: string | null,
): string {
  if (step.status === "paused") return `${step.short} (paused)`;
  if (step.status === "sent") return step.short;

  const due =
    step.scheduledFor ?? (step.day === nextEmailDay ? nextEmailDue : null);
  const days = daysUntilSend(due);
  if (days !== null && step.day > 0) return `${step.short} (${days}D)`;
  return step.short;
}

function SequenceRail({ row, cadence }: { row: LeadEmailRow; cadence: CadenceDays }) {
  const [, setTick] = useState(0);
  const normalized = normalizeCadenceDays(cadence);
  const [d0, d1, d2] = sequenceStepDays(normalized);

  useEffect(() => {
    const hasCountdown =
      Boolean(row.nextEmailDue) ||
      row.sequenceEmails?.some(
        (e) => e.sequenceDay > 0 && e.status !== "sent" && e.scheduledFor,
      );
    if (!hasCountdown) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [row.nextEmailDue, row.sequenceEmails]);

  const fallbackSteps = [
    { day: d0, short: "Email 1" },
    { day: d1, short: "Email 2" },
    { day: d2, short: "Email 3" },
  ];
  const sequenceSteps =
    row.sequenceEmails?.length > 0
      ? row.sequenceEmails.map((e) => ({
          day: e.sequenceDay,
          short: e.label,
          status: e.status,
          openedAt: e.openedAt,
          bouncedAt: e.bouncedAt,
          scheduledFor: e.scheduledFor,
        }))
      : fallbackSteps.map((s) => ({
          ...s,
          status: isEmailSentForStep(row.lastEmailDay, s.day) ? ("sent" as const) : ("upcoming" as const),
          openedAt: null as string | null,
          bouncedAt: null as string | null,
          scheduledFor: s.day === row.nextEmailDay ? row.nextEmailDue : null,
        }));

  const replySteps: { id: string; label: string; done: boolean; active: boolean }[] = [];
  if (row.hasInboundReply || row.threadStage !== "sequence") {
    const replied = row.hasInboundReply || row.leadStatus === "replied";
    const draft = row.hasReplyDraft || row.threadStage === "reply_draft";
    const sentReply = row.hasOutboundReply || row.threadStage === "reply_sent";
    replySteps.push(
      { id: "rep", label: "They replied", done: replied, active: row.threadStage === "they_replied" },
      { id: "draft", label: "Draft", done: draft || sentReply, active: row.threadStage === "reply_draft" },
      { id: "sent", label: "You replied", done: sentReply, active: false },
    );
  }

  return (
    <div
      className="ish-email-seq inline-flex max-w-full items-center gap-1 truncate text-[10px] font-medium text-brand-ink-faint"
      title={sequenceSteps
        .map((step) => {
          const done = step.status === "sent";
          const opened = Boolean(step.openedAt);
          const bounced = Boolean(step.bouncedAt);
          const label = emailStepLabel(step.day, normalized);
          if (bounced) return `${label}: Bounced`;
          if (opened) return `${label}: Opened`;
          if (done) return `${label}: Sent`;
          return label;
        })
        .concat(replySteps.filter((s) => s.active || s.done).map((s) => s.label))
        .join(" · ")}
    >
      {sequenceSteps.map((step, i) => {
        const done = step.status === "sent";
        const opened = Boolean(step.openedAt);
        const bounced = Boolean(step.bouncedAt);
        const active = row.nextEmailDay === step.day && !done;
        const display = sequenceStepDisplay(step, row.nextEmailDay, row.nextEmailDue);
        return (
          <span key={step.day} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="text-brand-border">·</span>}
            <span
              className={cn(
                "whitespace-nowrap",
                bounced
                  ? "font-semibold text-brand-stratus-salmon"
                  : opened
                    ? "font-semibold text-brand-ink"
                    : done
                      ? "text-brand-stratus-blue"
                      : active
                        ? "font-semibold text-brand-ink"
                        : "text-brand-ink-faint",
              )}
            >
              {bounced ? `${display} bounced` : opened ? `${display} opened` : display}
            </span>
          </span>
        );
      })}
      {replySteps
        .filter((s) => s.active || s.done)
        .map((step) => (
          <span key={step.id} className="inline-flex items-center gap-0.5">
            <span className="text-brand-border">·</span>
            <span
              className={cn(
                "whitespace-nowrap",
                step.active ? "font-semibold text-brand-stratus-blue" : "text-brand-stratus-blue",
              )}
            >
              {step.label}
            </span>
          </span>
        ))}
    </div>
  );
}

function inboxPreview(row: LeadEmailRow, tab: QueueTab): { subject: string; snippet: string } {
  if (tab === "replies") {
    const snippet = (row.inboundSnippet ?? row.nextAction?.description ?? "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      subject: row.nextAction?.title ?? "They replied",
      snippet,
    };
  }
  if (tab === "needs_review") {
    return {
      subject: row.draftSubject ?? (row.isFollowUpReview ? "Follow-up draft" : "Email 1 draft"),
      snippet: (row.draftPreview ?? "").replace(/\s+/g, " ").trim(),
    };
  }
  if (row.openedAt) {
    return {
      subject: `Opened ${timeAgo(row.openedAt)}`,
      snippet: row.contactEmail ?? row.companyName,
    };
  }
  if (row.nextEmailDue) {
    return {
      subject: isDueToday(row.nextEmailDue)
        ? "Follow-up due today"
        : `Next email ${formatDate(row.nextEmailDue)}`,
      snippet: row.contactEmail ?? "",
    };
  }
  if (row.emailsSent > 0) {
    return {
      subject: `${row.emailsSent} email${row.emailsSent === 1 ? "" : "s"} sent`,
      snippet: row.contactEmail ?? "",
    };
  }
  return {
    subject: "In sequence",
    snippet: row.contactEmail ?? "",
  };
}

function inboxMeta(row: LeadEmailRow, tab: QueueTab): string {
  if (tab === "needs_review") return "Review";
  const bouncedStep = row.sequenceEmails?.find((step) => step.bouncedAt);
  if (bouncedStep) return "Bounced";
  if (tab === "replies") {
    if (row.hasOutboundReply) return "You replied";
    if (row.hasReplyDraft) return "Draft";
    return row.nextAction?.cta ?? "They replied";
  }
  if (row.openedAt) return timeAgo(row.openedAt);
  if (row.nextEmailDue) return isDueToday(row.nextEmailDue) ? "Today" : formatDate(row.nextEmailDue);
  if (row.sequenceState === "paused") return "Paused";
  if (tab === "done") return "Done";
  if (row.emailsSent > 0) return "Waiting";
  return "";
}

// ─── Lead card (Gmail-style inbox row) ────────────────────────────────────────

function LeadCard({
  row,
  cadence,
  tab,
  onNavigate,
}: {
  row: LeadEmailRow;
  cadence: CadenceDays;
  tab: QueueTab;
  onNavigate: (id: string) => void;
}) {
  const { subject, snippet } = inboxPreview(row, tab);
  const meta = inboxMeta(row, tab);
  const unread = tab === "replies" && !row.hasOutboundReply;
  const metaAccent = tab === "replies" && !row.hasOutboundReply;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(row.leadId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate(row.leadId);
        }
      }}
      className="ish-email-card group w-full cursor-pointer px-3 py-2.5 text-left transition-colors duration-150 sm:px-4"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-brand-ink",
            avatarColor(row.contactName),
          )}
        >
          {initials(row.contactName)}
        </div>

        <div className="min-w-0 flex-1">
          {/* Desktop: sender | subject – snippet | meta */}
          <div className="hidden items-center gap-3 md:flex">
            <span
              className={cn(
                "w-[148px] shrink-0 truncate text-[13px] text-brand-ink",
                unread ? "font-bold" : "font-semibold",
              )}
            >
              {row.contactName}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] leading-snug">
              <span className={cn("text-brand-ink", unread ? "font-semibold" : "font-medium")}>
                {subject}
              </span>
              {snippet ? (
                <>
                  <span className="text-brand-ink-faint"> – </span>
                  <span className="text-brand-ink-soft">{snippet}</span>
                </>
              ) : null}
            </p>
            {meta ? (
              <span
                className={cn(
                  "shrink-0 text-[11px] tabular-nums",
                  metaAccent ? "font-semibold text-brand-stratus-blue" : "text-brand-ink-faint",
                )}
              >
                {meta}
              </span>
            ) : null}
          </div>

          {/* Mobile: stacked */}
          <div className="md:hidden">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "min-w-0 truncate text-[13px] text-brand-ink",
                  unread ? "font-bold" : "font-semibold",
                )}
              >
                {row.contactName}
              </span>
              {meta ? (
                <span
                  className={cn(
                    "shrink-0 text-[11px] tabular-nums",
                    metaAccent ? "font-semibold text-brand-stratus-blue" : "text-brand-ink-faint",
                  )}
                >
                  {meta}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[12px] leading-snug">
              <span className={cn("text-brand-ink", unread ? "font-semibold" : "font-medium")}>
                {subject}
              </span>
              {snippet ? (
                <>
                  <span className="text-brand-ink-faint"> – </span>
                  <span className="text-brand-ink-soft">{snippet}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-[11px] text-brand-ink-faint">{row.companyName}</span>
            <SequenceRail row={row} cadence={cadence} />
          </div>
        </div>

        <ChevronRight className="hidden size-3.5 shrink-0 text-brand-ink-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function TabEmptyState({ tab }: { tab: QueueTab }) {
  const copy = EMPTY_BY_TAB[tab];
  const tabMeta = QUEUE_TABS.find((t) => t.id === tab)!;
  const Icon = tabMeta.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-stratus-yellow/50">
        <Icon className="size-5 text-brand-ink" />
      </div>
      <p className="text-[14px] font-semibold text-brand-ink">{copy.title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-brand-ink-soft">{copy.body}</p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-[16px] bg-white/60 ring-1 ring-brand-stratus-blue/10" />
        ))}
      </div>
      <div className="overflow-hidden rounded-[12px] border border-brand-stratus-blue/10 bg-white/70">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-brand-stratus-blue/8 px-4 py-3 last:border-0">
            <div className="size-8 rounded-full bg-brand-stratus-blue/10" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-brand-stratus-blue/10" />
              <div className="h-2.5 w-1/3 rounded bg-brand-stratus-blue/8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export function EmailApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<EmailOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [togglingSend, setTogglingSend] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<QueueTab>>(() => new Set());
  const [logs, setLogs] = useState<EmailLogsData | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logStatus, setLogStatus] = useState<"all" | EmailLogStatus>("all");

  const activeTab = useMemo(
    () => parsePageTab(searchParams.get("tab")),
    [searchParams],
  );
  const isLogsTab = activeTab === "logs";

  const mergeOverview = useCallback((tab: QueueTab, overview: EmailOverviewData) => {
    setData((prev) => ({
      ...overview,
      needsReview: tab === "needs_review" ? overview.needsReview : (prev?.needsReview ?? []),
      active: tab === "active" ? overview.active : (prev?.active ?? []),
      hot: tab === "hot" ? overview.hot : (prev?.hot ?? []),
      replies: tab === "replies" ? overview.replies : (prev?.replies ?? []),
      done: tab === "done" ? overview.done : (prev?.done ?? []),
      draftReady: tab === "needs_review" ? overview.draftReady : (prev?.draftReady ?? []),
      stopped: tab === "done" ? overview.stopped : (prev?.stopped ?? []),
    }));
    setLoadedTabs((prev) => new Set(prev).add(tab));
  }, []);

  const loadTab = useCallback(
    async (tab: QueueTab, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const overview = await fetchEmailOverview(tab);
        mergeOverview(tab, overview);
      } catch {
        setData(null);
        setLoadedTabs(new Set());
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [mergeOverview],
  );

  const loadLogs = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLogsLoading(true);
      try {
        const result = await fetchEmailLogs({
          status: logStatus,
          q: logSearch,
          limit: 100,
        });
        setLogs(result);
      } catch {
        setLogs(null);
      } finally {
        if (!options?.silent) setLogsLoading(false);
      }
    },
    [logSearch, logStatus],
  );

  const load = useCallback(async () => {
    setLoadedTabs(new Set());
    if (activeTab === "logs") {
      await Promise.all([loadTab("active"), loadLogs()]);
      return;
    }
    await loadTab(activeTab);
  }, [activeTab, loadLogs, loadTab]);

  useEffect(() => {
    if (activeTab === "logs") {
      if (!data) void loadTab("active");
      return;
    }
    if (loadedTabs.has(activeTab) && data) return;
    void loadTab(activeTab);
  }, [activeTab, data, loadedTabs, loadTab]);

  useEffect(() => {
    if (!isLogsTab) return;
    void loadLogs();
  }, [isLogsTab, loadLogs]);

  const setTab = useCallback(
    (tab: PageTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`/email?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleNavigate = useCallback(
    (leadId: string) => {
      router.push(`/leads?lead=${leadId}&tab=email`);
    },
    [router],
  );

  const cadence = useMemo(
    () => normalizeCadenceDays(data?.cadenceDays),
    [data?.cadenceDays],
  );

  const filterRows = useCallback(
    (rows: LeadEmailRow[]) => {
      if (!search.trim()) return rows;
      const q = search.toLowerCase();
      return rows.filter(
        (r) =>
          r.contactName.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          (r.city?.toLowerCase().includes(q) ?? false),
      );
    },
    [search],
  );

  const visibleRows = useMemo(() => {
    if (!data || activeTab === "logs") return [];
    return filterRows(tabRows(data, activeTab));
  }, [data, activeTab, filterRows]);

  const openRate =
    data && data.stats.totalSent > 0 ? Math.round((data.stats.opened / data.stats.total) * 100) : 0;

  const kpiConfig = useMemo(() => {
    if (!data) return [];
    return [
      {
        tab: "needs_review" as PageTab,
        label: "Needs review",
        value: tabCount(data, "needs_review"),
        sub: "Email 1 drafts",
        icon: FileText,
        iconClass: "bg-brand-stratus-yellow text-brand-ink",
      },
      {
        tab: "active" as PageTab,
        label: "Active",
        value: tabCount(data, "active"),
        sub: `${data.stats.dueToday} due today`,
        icon: Send,
        iconClass: "bg-brand-stratus-blue text-white",
      },
      {
        tab: "hot" as PageTab,
        label: "Hot",
        value: tabCount(data, "hot"),
        sub: `${openRate}% open rate`,
        icon: Flame,
        iconClass: "bg-brand-stratus-salmon text-white",
        valueClass: "text-brand-ink",
      },
      {
        tab: "replies" as PageTab,
        label: "Replies",
        value: tabCount(data, "replies"),
        sub: "They replied",
        icon: MessageSquare,
        iconClass: "bg-brand-stratus-blue/20 text-brand-stratus-blue",
      },
      {
        tab: "done" as PageTab,
        label: "Done",
        value: tabCount(data, "done"),
        sub: "Finished threads",
        icon: CheckCircle2,
        iconClass: "bg-white text-brand-ink-soft ring-1 ring-brand-stratus-blue/20",
      },
      {
        tab: "logs" as PageTab,
        label: "Logs",
        value: logs?.counts.all ?? data.stats.totalSent,
        sub: "Sent emails",
        icon: ScrollText,
        iconClass: "bg-brand-stratus-blue/15 text-brand-stratus-blue",
      },
    ];
  }, [data, logs?.counts.all, openRate]);


  async function handleToggleSending() {
    if (!data) return;
    setTogglingSend(true);
    try {
      const nextPaused = !data.outreachPaused;
      await setOutreachSendingPaused(nextPaused);
      await load();
    } catch {
      /* keep current state */
    } finally {
      setTogglingSend(false);
    }
  }

  return (
    <MobilePageLayout
      title="Outreach Queue"
      largeTitle
      className="ish-email-page"
      contentClassName="flex flex-col !overflow-hidden"
      rightSlot={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || (isLogsTab && logsLoading)}
          className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95 disabled:opacity-60"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-3.5", (loading || (isLogsTab && logsLoading)) && "animate-spin")} />
        </button>
      }
    >
      <AppPageHeader
        icon={ListChecks}
        title="Outreach Queue"
        actions={
          <>
            <SyncRepliesButton compact onSynced={load} />
            {data && (
              <button
                type="button"
                onClick={() => void handleToggleSending()}
                disabled={togglingSend}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-all disabled:opacity-60",
                  data.outreachPaused
                    ? "border-brand-stratus-blue/35 bg-white/80 text-brand-stratus-blue hover:bg-white"
                    : "border-brand-stratus-salmon/40 bg-white/80 text-brand-stratus-salmon hover:bg-brand-pink-soft/40",
                )}
              >
                {data.outreachPaused ? (
                  <>
                    <Play className="size-3.5" />
                    {togglingSend ? "Starting…" : "Start sending"}
                  </>
                ) : (
                  <>
                    <Pause className="size-3.5" />
                    {togglingSend ? "Pausing…" : "Pause sending"}
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || (isLogsTab && logsLoading)}
              className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95 disabled:opacity-60"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", (loading || (isLogsTab && logsLoading)) && "animate-spin")} />
            </button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {data?.outreachPaused && (
          <div className="mb-4 rounded-[16px] border border-brand-stratus-salmon/30 bg-white/70 px-4 py-2.5 shadow-[var(--shadow-brand-sm)] backdrop-blur-sm">
            <p className="text-[12px] font-semibold text-brand-ink">Outreach sending is paused</p>
            <p className="text-[11px] leading-snug text-brand-ink-soft">
              No Email 1 sends or automated follow-ups will go out until you click Start sending.
            </p>
          </div>
        )}

        {loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <>
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                {kpiConfig.map((kpi) => (
                  <KpiTile
                    key={kpi.tab}
                    label={kpi.label}
                    value={kpi.value}
                    sub={kpi.sub}
                    icon={kpi.icon}
                    iconClass={kpi.iconClass}
                    valueClass={kpi.valueClass}
                    active={activeTab === kpi.tab}
                    onClick={() => setTab(kpi.tab)}
                  />
                ))}
              </div>
              {!isLogsTab && (
                <div className="relative w-full shrink-0 lg:w-[220px]">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search contact or company…"
                    className="ish-email-search w-full rounded-full border border-brand-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-brand-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)] focus:bg-white"
                  />
                </div>
              )}
            </div>

            {isLogsTab ? (
              <EmailLogsTable
                data={logs}
                loading={logsLoading}
                search={logSearch}
                status={logStatus}
                onSearchChange={setLogSearch}
                onStatusChange={setLogStatus}
                onRowClick={handleNavigate}
              />
            ) : (
            <div className="ish-email-inbox overflow-hidden rounded-[12px] border border-brand-stratus-blue/14 bg-white/90 pb-0 shadow-[var(--shadow-brand-sm)]">
              {visibleRows.length === 0 ? (
                search.trim() ? (
                  <PanelCard className="flex flex-col items-center justify-center border-0 py-14 text-center shadow-none">
                    <Mail className="mb-2 size-8 text-brand-ink-faint" />
                    <p className={cn(text.body, "font-semibold text-brand-ink")}>No matches in this tab</p>
                    <p className="mt-1 text-[12px] text-brand-ink-soft">Try a different name or clear search.</p>
                  </PanelCard>
                ) : (
                  <TabEmptyState tab={activeTab} />
                )
              ) : (
                visibleRows.map((row) => (
                  <LeadCard
                    key={row.leadId}
                    row={row}
                    cadence={cadence}
                    tab={activeTab}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </div>
            )}
          </>
        ) : (
          <PanelCard className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[14px] font-semibold text-brand-ink">Could not load outreach queue</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white"
            >
              Try again
            </button>
          </PanelCard>
        )}
      </div>
    </MobilePageLayout>
  );
}
