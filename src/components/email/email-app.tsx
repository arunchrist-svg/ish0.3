"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Ban,
  Eye,
  MessageSquare,
  Clock,
  Zap,
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
    { day: d0, short: "E1" },
    { day: d1, short: "E2" },
    { day: d2, short: "E3" },
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
      { id: "rep", label: "Reply", done: replied, active: row.threadStage === "they_replied" },
      { id: "draft", label: "Draft", done: draft || sentReply, active: row.threadStage === "reply_draft" },
      { id: "sent", label: "Sent", done: sentReply, active: false },
    );
  }

  return (
    <div className="ish-email-seq inline-flex flex-wrap items-center gap-1 rounded-full border px-1.5 py-1">
      {sequenceSteps.map((step, i) => {
        const done = step.status === "sent";
        const opened = Boolean(step.openedAt);
        const bounced = Boolean(step.bouncedAt);
        const isScheduled = step.status === "scheduled" || step.status === "paused";
        const active = row.nextEmailDay === step.day && !done;
        const label = emailStepLabel(step.day, normalized);
        const display = sequenceStepDisplay(step, row.nextEmailDay, row.nextEmailDue);
        const dueForTooltip =
          step.scheduledFor ?? (step.day === row.nextEmailDay ? row.nextEmailDue : null);
        const daysLeft = step.day > 0 && step.status !== "sent" ? daysUntilSend(dueForTooltip) : null;
        const title = bounced
          ? `${label}: Bounced`
          : opened
            ? `${label}: Opened ${timeAgo(step.openedAt!)}`
            : done
              ? `${label}: Sent · Not opened`
              : isScheduled && daysLeft !== null
                ? `${label}: Sends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                : daysLeft !== null && step.day > 0 && !done
                  ? `${label}: Sends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                  : active
                  ? `${label}: Next`
                  : label;
        return (
          <div key={step.day} className="flex items-center gap-1">
            <div
              title={title}
              className={cn(
                "flex h-6 items-center justify-center gap-0.5 rounded-full px-2 text-[8px] font-bold uppercase tracking-wide whitespace-nowrap",
                bounced
                  ? "bg-brand-stratus-salmon text-white"
                  : opened
                    ? "bg-brand-stratus-yellow text-brand-ink"
                    : done
                      ? "bg-brand-stratus-blue text-white"
                      : isScheduled
                        ? "border border-dashed border-brand-stratus-blue/35 bg-white text-brand-stratus-blue"
                        : active
                          ? "bg-brand-stratus-yellow text-brand-ink ring-2 ring-brand-stratus-yellow/45"
                          : "bg-white/80 text-brand-ink-faint",
              )}
            >
              {bounced && <Ban className="size-2.5 shrink-0" strokeWidth={2.5} />}
              {opened && !bounced && <Eye className="size-2.5 shrink-0" strokeWidth={2.5} />}
              {display}
            </div>
            {i < sequenceSteps.length - 1 && (
              <div className={cn("h-px w-2.5", done || opened ? "bg-brand-stratus-blue/40" : "bg-brand-border")} />
            )}
          </div>
        );
      })}
      {replySteps.length > 0 && (
        <>
          <div className="mx-0.5 h-px w-2.5 bg-brand-border" />
          {replySteps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex h-6 min-w-[40px] items-center justify-center rounded-full px-1.5 text-[8px] font-bold uppercase tracking-wide",
                  step.done
                    ? "bg-brand-stratus-blue text-white"
                    : step.active
                      ? "bg-brand-stratus-yellow text-brand-ink ring-2 ring-brand-stratus-yellow/45"
                      : "bg-white/80 text-brand-ink-faint",
                )}
              >
                {step.label}
              </div>
              {i < replySteps.length - 1 && (
                <div className={cn("h-px w-2.5", step.done ? "bg-brand-stratus-blue/40" : "bg-brand-border")} />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Next action card ─────────────────────────────────────────────────────────

function NextActionCard({
  row,
  onNavigate,
}: {
  row: LeadEmailRow;
  onNavigate: (id: string) => void;
}) {
  const action = row.nextAction;
  if (!action) return null;

  return (
    <div
      className="ish-email-reply mt-3 rounded-[16px] border p-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-stratus-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]">
          <Zap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-brand-ink">{action.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brand-ink-soft">{action.description}</p>
          {row.inboundSnippet && (
            <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-brand-ink">
              {row.inboundSnippet}
            </p>
          )}
          <button
            type="button"
            onClick={() => onNavigate(row.leadId)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-stratus-blue px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-opacity hover:opacity-90"
          >
            {action.cta}
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ row }: { row: LeadEmailRow }) {
  if (row.queueStatus === "needs_review") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-yellow-soft px-2.5 py-1 text-[10px] font-bold text-brand-ink ring-1 ring-brand-yellow/40">
        <FileText className="size-3" /> Review Email 1
      </span>
    );
  }
  const bouncedStep = row.sequenceEmails?.find((step) => step.bouncedAt);
  if (bouncedStep) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft px-2.5 py-1 text-[10px] font-bold text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/30">
        <Ban className="size-3" /> {bouncedStep.label} bounced
      </span>
    );
  }
  if (row.queueStatus === "replies") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-stratus-blue/15 px-2.5 py-1 text-[10px] font-bold text-brand-stratus-blue ring-1 ring-brand-stratus-blue/25">
        <MessageSquare className="size-3" /> Sequence paused
      </span>
    );
  }
  if (row.openedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-stratus-yellow/25 px-2.5 py-1 text-[10px] font-bold text-brand-ink ring-1 ring-brand-stratus-yellow/40">
        <Eye className="size-3" /> Opened {timeAgo(row.openedAt)}
      </span>
    );
  }
  if (row.emailsSent > 0 && (row.queueStatus === "active" || row.queueStatus === "hot" || row.threadStage === "awaiting_reply")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold text-brand-ink-soft ring-1 ring-brand-stratus-blue/20">
        <Mail className="size-3" /> Not opened
      </span>
    );
  }
  if (row.threadStage === "reply_sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-stratus-blue/15 px-2.5 py-1 text-[10px] font-bold text-brand-stratus-blue ring-1 ring-brand-stratus-blue/25">
        <MessageSquare className="size-3" /> Reply sent
      </span>
    );
  }
  if (row.sequenceState === "paused") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft/50 px-2.5 py-1 text-[10px] font-bold text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/25">
        <Pause className="size-3" /> Paused
      </span>
    );
  }
  if (row.threadStage === "awaiting_reply") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-canvas px-2.5 py-1 text-[10px] font-bold text-brand-ink-soft ring-1 ring-brand-border">
        <Clock className="size-3" /> Awaiting reply
      </span>
    );
  }
  if (row.queueStatus === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-canvas px-2.5 py-1 text-[10px] font-bold text-brand-ink-faint">
        <CheckCircle2 className="size-3" /> Complete
      </span>
    );
  }
  if (row.nextEmailDue) {
    const isToday = isDueToday(row.nextEmailDue);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
          isToday
            ? "bg-brand-pink-soft text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/25"
            : "bg-brand-canvas text-brand-ink-soft ring-1 ring-brand-border",
        )}
      >
        <Clock className="size-3" />
        {isToday ? "Due today" : `Due ${formatDate(row.nextEmailDue)}`}
      </span>
    );
  }
  return null;
}

// ─── Lead card ────────────────────────────────────────────────────────────────

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
  const location = [row.city, row.industry].filter(Boolean).join(" · ");

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
      className="ish-email-card group relative w-full cursor-pointer overflow-hidden rounded-[20px] border border-brand-stratus-blue/18 p-4 pl-5 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.995]"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-3 left-0 w-[3px] rounded-full",
          tab === "needs_review"
            ? "bg-brand-stratus-yellow"
            : tab === "hot"
              ? "bg-brand-stratus-salmon"
              : tab === "done"
                ? "bg-brand-stratus-blue/35"
                : "bg-brand-stratus-blue",
        )}
      />
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl text-[12px] font-extrabold text-brand-ink ring-2 ring-white/80 shadow-[var(--shadow-brand-sm)]",
            avatarColor(row.contactName),
          )}
        >
          {initials(row.contactName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14px] font-bold text-brand-ink">{row.contactName}</span>
            <span className="text-brand-ink-faint">·</span>
            <span className="truncate text-[12px] font-medium text-brand-ink-soft">{row.companyName}</span>
          </div>
          {location && <p className="mt-0.5 truncate text-[11px] text-brand-ink-faint">{location}</p>}

          {tab === "needs_review" && (row.draftSubject || row.draftPreview) && (
            <div className="mt-2.5 rounded-[12px] border border-brand-stratus-blue/15 bg-white/60 px-3 py-2.5">
              {row.draftSubject && (
                <p className="truncate text-[11px] font-semibold text-brand-ink">{row.draftSubject}</p>
              )}
              {row.draftPreview && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-brand-ink-soft">{row.draftPreview}</p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SequenceRail row={row} cadence={cadence} />
            <StatusPill row={row} />
          </div>

          {tab === "replies" && <NextActionCard row={row} onNavigate={onNavigate} />}
        </div>

        <ChevronRight className="mt-1 size-4 shrink-0 text-brand-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-ink" />
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
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-brand-stratus-blue/16 bg-white/65 py-16 text-center shadow-[var(--shadow-brand-sm)] backdrop-blur-sm">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-stratus-yellow/80 shadow-[var(--shadow-brand-yellow-sm)]">
        <Icon className="size-6 text-brand-ink" />
      </div>
      <p className="text-[15px] font-bold text-brand-ink">{copy.title}</p>
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
      <div className="h-48 rounded-[20px] bg-white/60 ring-1 ring-brand-stratus-blue/10" />
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
        sub: "Sequence paused",
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
            <div className="space-y-2.5 pb-6">
              {visibleRows.length === 0 ? (
                search.trim() ? (
                  <PanelCard className="flex flex-col items-center justify-center py-14 text-center">
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
