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
  Inbox,
  FileText,
  ListChecks,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobilePageLayout, PanelCard, text } from "@/design-system";
import { fetchEmailOverview, setOutreachSendingPaused, type EmailOverviewData } from "@/lib/api-client";
import { SyncRepliesButton } from "@/components/sales-accelerator/sync-replies-button";
import type { LeadEmailRow } from "@/app/api/email/overview/route";
import {
  type CadenceDays,
  sequenceStepDays,
  emailStepLabel,
  isEmailSentForStep,
  normalizeCadenceDays,
} from "@/lib/email/cadence";

type QueueTab = "needs_review" | "active" | "hot" | "replies" | "done";

const QUEUE_TABS: {
  id: QueueTab;
  label: string;
  icon: React.ElementType;
  accent?: string;
}[] = [
  { id: "needs_review", label: "Needs Review", icon: FileText, accent: "text-brand-ink" },
  { id: "active", label: "Active", icon: Send, accent: "text-brand-stratus-blue" },
  { id: "hot", label: "Hot", icon: Flame, accent: "text-orange-500" },
  { id: "replies", label: "Replies", icon: MessageSquare, accent: "text-brand-green" },
  { id: "done", label: "Done", icon: CheckCircle2, accent: "text-brand-ink-soft" },
];

const VALID_TABS = new Set<QueueTab>(QUEUE_TABS.map((t) => t.id));

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

function parseQueueTab(raw: string | null): QueueTab {
  if (raw && VALID_TABS.has(raw as QueueTab)) return raw as QueueTab;
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
      return data.active;
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
  cardClass,
  iconClass,
  valueClass,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  cardClass: string;
  iconClass: string;
  valueClass?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[14px] px-2.5 py-2 text-left shadow-[var(--shadow-brand-sm)] transition-all duration-200",
        cardClass,
        onClick && "cursor-pointer hover:shadow-[var(--shadow-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/30",
        active && "ring-2 ring-brand-black/80 ring-offset-1 ring-offset-[var(--ish-canvas)]",
      )}
    >
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", iconClass)}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-[18px] font-extrabold leading-none tabular-nums", valueClass ?? "text-brand-ink")}>
            {value}
          </span>
          {sub ? <span className="truncate text-[10px] font-medium opacity-65">{sub}</span> : null}
        </div>
      </div>
    </Comp>
  );
}

// ─── Sequence rail ────────────────────────────────────────────────────────────

function SequenceRail({ row, cadence }: { row: LeadEmailRow; cadence: CadenceDays }) {
  const normalized = normalizeCadenceDays(cadence);
  const [d0, d1, d2] = sequenceStepDays(normalized);
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
        }))
      : fallbackSteps.map((s) => ({
          ...s,
          status: isEmailSentForStep(row.lastEmailDay, s.day) ? ("sent" as const) : ("upcoming" as const),
          openedAt: null as string | null,
          bouncedAt: null as string | null,
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
    <div className="flex flex-wrap items-center gap-1">
      {sequenceSteps.map((step, i) => {
        const done = step.status === "sent";
        const opened = Boolean(step.openedAt);
        const bounced = Boolean(step.bouncedAt);
        const active = row.nextEmailDay === step.day && !done;
        const label = emailStepLabel(step.day, normalized);
        const title = bounced
          ? `${label}: Bounced`
          : opened
            ? `${label}: Opened ${timeAgo(step.openedAt!)}`
            : done
              ? `${label}: Sent · Not opened`
              : active
                ? `${label}: Next`
                : label;
        return (
          <div key={step.day} className="flex items-center gap-1">
            <div
              title={title}
              className={cn(
                "flex h-6 min-w-[44px] items-center justify-center gap-0.5 rounded-full px-1.5 text-[8px] font-bold uppercase tracking-wide",
                bounced
                  ? "bg-brand-stratus-salmon text-white"
                  : opened
                    ? "bg-orange-500 text-white"
                    : done
                      ? "bg-brand-black text-white"
                      : active
                        ? "bg-brand-yellow text-brand-ink ring-2 ring-brand-yellow/50"
                        : "bg-brand-canvas text-brand-ink-faint",
              )}
            >
              {bounced && <Ban className="size-2.5 shrink-0" strokeWidth={2.5} />}
              {opened && !bounced && <Eye className="size-2.5 shrink-0" strokeWidth={2.5} />}
              {step.short}
            </div>
            {i < sequenceSteps.length - 1 && (
              <div className={cn("h-px w-2", done || opened ? "bg-brand-black/30" : "bg-brand-border")} />
            )}
          </div>
        );
      })}
      {replySteps.length > 0 && (
        <>
          <div className="mx-0.5 h-px w-2 bg-brand-border" />
          {replySteps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex h-6 min-w-[40px] items-center justify-center rounded-full px-1.5 text-[8px] font-bold uppercase tracking-wide",
                  step.done
                    ? "bg-brand-green text-white"
                    : step.active
                      ? "bg-brand-yellow text-brand-ink ring-2 ring-brand-yellow/50"
                      : "bg-brand-canvas text-brand-ink-faint",
                )}
              >
                {step.label}
              </div>
              {i < replySteps.length - 1 && (
                <div className={cn("h-px w-2", step.done ? "bg-brand-green/40" : "bg-brand-border")} />
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
      className="mt-3 rounded-[14px] border border-brand-yellow/35 bg-gradient-to-br from-brand-yellow-soft/80 to-white p-3.5 shadow-[var(--shadow-brand-sm)]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-yellow text-brand-ink">
          <Zap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-brand-ink">{action.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-ink-soft">{action.description}</p>
          {row.inboundSnippet && (
            <p className="mt-2 line-clamp-2 rounded-[10px] bg-white/80 px-2.5 py-2 text-[11px] italic text-brand-ink-soft ring-1 ring-brand-border/50">
              &ldquo;{row.inboundSnippet}&rdquo;
            </p>
          )}
          <button
            type="button"
            onClick={() => onNavigate(row.leadId)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-black px-3.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-black/90"
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
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-green-soft px-2.5 py-1 text-[10px] font-bold text-brand-green ring-1 ring-brand-green/20">
        <MessageSquare className="size-3" /> Sequence paused
      </span>
    );
  }
  if (row.openedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200/80">
        <Eye className="size-3" /> Opened {timeAgo(row.openedAt)}
      </span>
    );
  }
  if (row.emailsSent > 0 && (row.queueStatus === "active" || row.queueStatus === "hot" || row.threadStage === "awaiting_reply")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-canvas px-2.5 py-1 text-[10px] font-bold text-brand-ink-soft ring-1 ring-brand-border">
        <Mail className="size-3" /> Not opened
      </span>
    );
  }
  if (row.threadStage === "reply_sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-green-soft px-2.5 py-1 text-[10px] font-bold text-brand-green ring-1 ring-brand-green/20">
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
      className="ish-email-card group w-full cursor-pointer rounded-[18px] border border-brand-border/60 bg-white p-4 text-left shadow-[var(--shadow-brand-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-stratus-blue/25 hover:shadow-[var(--shadow-brand)] active:scale-[0.995]"
    >
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl text-[12px] font-extrabold text-brand-ink shadow-[var(--shadow-brand-sm)]",
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
            <div className="mt-2.5 rounded-[12px] border border-brand-border/50 bg-brand-canvas/40 px-3 py-2.5">
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
    <PanelCard className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-yellow-soft">
        <Icon className="size-6 text-brand-ink-soft" />
      </div>
      <p className="text-[15px] font-bold text-brand-ink">{copy.title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-brand-ink-soft">{copy.body}</p>
    </PanelCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-[14px] bg-brand-border/60" />
        ))}
      </div>
      <div className="h-48 rounded-[16px] bg-brand-border/60" />
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

  const activeTab = useMemo(
    () => parseQueueTab(searchParams.get("tab")),
    [searchParams],
  );

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

  const load = useCallback(async () => {
    setLoadedTabs(new Set());
    await loadTab(activeTab);
  }, [activeTab, loadTab]);

  useEffect(() => {
    if (loadedTabs.has(activeTab) && data) return;
    void loadTab(activeTab);
  }, [activeTab, data, loadedTabs, loadTab]);

  const setTab = useCallback(
    (tab: QueueTab) => {
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
    if (!data) return [];
    return filterRows(tabRows(data, activeTab));
  }, [data, activeTab, filterRows]);

  const openRate =
    data && data.stats.totalSent > 0 ? Math.round((data.stats.opened / data.stats.total) * 100) : 0;

  const kpiConfig = useMemo(() => {
    if (!data) return [];
    return [
      {
        tab: "needs_review" as QueueTab,
        label: "Needs review",
        value: tabCount(data, "needs_review"),
        sub: "Email 1 drafts",
        icon: FileText,
        cardClass: "bg-brand-yellow-soft",
        iconClass: "bg-brand-yellow text-brand-ink",
      },
      {
        tab: "active" as QueueTab,
        label: "Active",
        value: tabCount(data, "active"),
        sub: `${data.stats.dueToday} due today`,
        icon: Send,
        cardClass: "bg-white",
        iconClass: "bg-brand-stratus-blue/20 text-brand-black",
      },
      {
        tab: "hot" as QueueTab,
        label: "Hot",
        value: tabCount(data, "hot"),
        sub: `${openRate}% open rate`,
        icon: Flame,
        cardClass: "bg-orange-50/80",
        iconClass: "bg-orange-100 text-orange-600",
        valueClass: "text-orange-700",
      },
      {
        tab: "replies" as QueueTab,
        label: "Replies",
        value: tabCount(data, "replies"),
        sub: "Sequence paused",
        icon: MessageSquare,
        cardClass: "bg-brand-green-soft",
        iconClass: "bg-brand-green text-white",
      },
      {
        tab: "done" as QueueTab,
        label: "Done",
        value: tabCount(data, "done"),
        sub: "Finished threads",
        icon: CheckCircle2,
        cardClass: "bg-brand-canvas",
        iconClass: "bg-white text-brand-ink-soft shadow-[var(--shadow-brand-sm)]",
      },
    ];
  }, [data, openRate]);


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
          disabled={loading}
          className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95 disabled:opacity-60"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      }
    >
      <header className="ish-board-hero relative hidden shrink-0 overflow-hidden border-b border-brand-border/60 px-6 py-5 lg:block">
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow shadow-[var(--shadow-brand-yellow-sm)]">
              <ListChecks className="size-5 text-brand-ink" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-extrabold tracking-tight text-brand-ink">Outreach Queue</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SyncRepliesButton compact onSynced={load} />
            {data && (
              <button
                type="button"
                onClick={() => void handleToggleSending()}
                disabled={togglingSend}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-all disabled:opacity-60",
                  data.outreachPaused
                    ? "border-brand-green/40 bg-brand-green/10 text-brand-green hover:bg-brand-green/15"
                    : "border-brand-stratus-salmon/40 bg-brand-pink-soft/50 text-brand-stratus-salmon hover:bg-brand-pink-soft",
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
              disabled={loading}
              className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95 disabled:opacity-60"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {data?.outreachPaused && (
          <div className="mb-4 rounded-[12px] border border-brand-stratus-salmon/35 bg-brand-pink-soft/45 px-3 py-2">
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
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                {kpiConfig.map((kpi) => (
                  <KpiTile
                    key={kpi.tab}
                    label={kpi.label}
                    value={kpi.value}
                    sub={kpi.sub}
                    icon={kpi.icon}
                    cardClass={kpi.cardClass}
                    iconClass={kpi.iconClass}
                    valueClass={kpi.valueClass}
                    active={activeTab === kpi.tab}
                    onClick={() => setTab(kpi.tab)}
                  />
                ))}
              </div>
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
            </div>

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
