"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
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
import { PanelCard, text } from "@/design-system";
import { SettingsHero } from "@/components/settings/settings-hero";
import { fetchEmailOverview, setOutreachSendingPaused, type EmailOverviewData } from "@/lib/api-client";
import { SyncRepliesButton } from "@/components/sales-accelerator/sync-replies-button";
import type { LeadEmailRow } from "@/app/api/email/overview/route";
import {
  type CadenceDays,
  sequenceStepDays,
  emailStepLabel,
  cadenceSummary,
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
  { id: "needs_review", label: "Needs Review", icon: FileText, accent: "text-ish-ink" },
  { id: "active", label: "Active", icon: Send, accent: "text-ish-stratus-blue" },
  { id: "hot", label: "Hot", icon: Flame, accent: "text-orange-500" },
  { id: "replies", label: "Replies", icon: MessageSquare, accent: "text-ish-green" },
  { id: "done", label: "Done", icon: CheckCircle2, accent: "text-ish-ink-soft" },
];

const VALID_TABS = new Set<QueueTab>(QUEUE_TABS.map((t) => t.id));

const EMPTY_BY_TAB: Record<QueueTab, { title: string; body: string }> = {
  needs_review: {
    title: "Queue is clear",
    body: "No Email 1 drafts waiting. Scout a lead and write from Lead Accelerator.",
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
  "bg-ish-avatar-1",
  "bg-ish-avatar-2",
  "bg-ish-avatar-3",
  "bg-ish-avatar-4",
  "bg-ish-avatar-5",
  "bg-ish-avatar-6",
];

function parseQueueTab(raw: string | null): QueueTab {
  if (raw && VALID_TABS.has(raw as QueueTab)) return raw as QueueTab;
  return "needs_review";
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
        "flex flex-col gap-3 rounded-[20px] p-5 text-left shadow-[var(--shadow-ish-sm)] transition-all duration-200",
        cardClass,
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-ish)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ish-stratus-blue/30",
        active && "ring-2 ring-ish-black/80 ring-offset-2 ring-offset-[var(--ish-canvas)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", iconClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div>
        <div className={cn("text-[30px] font-extrabold leading-none tabular-nums", valueClass ?? "text-ish-ink")}>
          {value}
        </div>
        {sub && <div className="mt-1.5 text-[11px] font-medium opacity-65">{sub}</div>}
      </div>
    </Comp>
  );
}

// ─── Sequence rail ────────────────────────────────────────────────────────────

function SequenceRail({ row, cadence }: { row: LeadEmailRow; cadence: CadenceDays }) {
  const normalized = normalizeCadenceDays(cadence);
  const [d0, d1, d2] = sequenceStepDays(normalized);
  const sequenceSteps = [
    { day: d0, short: "E1" },
    { day: d1, short: "E2" },
    { day: d2, short: "E3" },
  ];

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
        const done = isEmailSentForStep(row.lastEmailDay, step.day);
        const active = row.nextEmailDay === step.day && !done;
        const label = emailStepLabel(step.day, normalized);
        return (
          <div key={step.day} className="flex items-center gap-1">
            <div
              title={label}
              className={cn(
                "flex h-6 min-w-[44px] items-center justify-center rounded-full px-1.5 text-[8px] font-bold uppercase tracking-wide",
                done
                  ? "bg-ish-black text-white"
                  : active
                    ? "bg-ish-yellow text-ish-ink ring-2 ring-ish-yellow/50"
                    : "bg-ish-canvas text-ish-ink-faint",
              )}
            >
              {step.short}
            </div>
            {i < sequenceSteps.length - 1 && (
              <div className={cn("h-px w-2", done ? "bg-ish-black/30" : "bg-ish-border")} />
            )}
          </div>
        );
      })}
      {replySteps.length > 0 && (
        <>
          <div className="mx-0.5 h-px w-2 bg-ish-border" />
          {replySteps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex h-6 min-w-[40px] items-center justify-center rounded-full px-1.5 text-[8px] font-bold uppercase tracking-wide",
                  step.done
                    ? "bg-ish-green text-white"
                    : step.active
                      ? "bg-ish-yellow text-ish-ink ring-2 ring-ish-yellow/50"
                      : "bg-ish-canvas text-ish-ink-faint",
                )}
              >
                {step.label}
              </div>
              {i < replySteps.length - 1 && (
                <div className={cn("h-px w-2", step.done ? "bg-ish-green/40" : "bg-ish-border")} />
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
      className="mt-3 rounded-[14px] border border-ish-yellow/35 bg-gradient-to-br from-ish-yellow-soft/80 to-white p-3.5 shadow-[var(--shadow-ish-sm)]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ish-yellow text-ish-ink">
          <Zap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-ish-ink">{action.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ish-ink-soft">{action.description}</p>
          {row.inboundSnippet && (
            <p className="mt-2 line-clamp-2 rounded-[10px] bg-white/80 px-2.5 py-2 text-[11px] italic text-ish-ink-soft ring-1 ring-ish-border/50">
              &ldquo;{row.inboundSnippet}&rdquo;
            </p>
          )}
          <button
            type="button"
            onClick={() => onNavigate(row.leadId)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-ish-black px-3.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-ish-black/90"
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
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-yellow-soft px-2.5 py-1 text-[10px] font-bold text-ish-ink ring-1 ring-ish-yellow/40">
        <FileText className="size-3" /> Review Email 1
      </span>
    );
  }
  if (row.openedAt && row.queueStatus === "hot") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200/80">
        <Eye className="size-3" /> Opened {timeAgo(row.openedAt)}
      </span>
    );
  }
  if (row.queueStatus === "replies") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-green-soft px-2.5 py-1 text-[10px] font-bold text-ish-green ring-1 ring-ish-green/20">
        <MessageSquare className="size-3" /> Sequence paused
      </span>
    );
  }
  if (row.threadStage === "reply_sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-green-soft px-2.5 py-1 text-[10px] font-bold text-ish-green ring-1 ring-ish-green/20">
        <MessageSquare className="size-3" /> Reply sent
      </span>
    );
  }
  if (row.sequenceState === "paused") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-pink-soft/50 px-2.5 py-1 text-[10px] font-bold text-ish-stratus-salmon ring-1 ring-ish-stratus-salmon/25">
        <Pause className="size-3" /> Paused
      </span>
    );
  }
  if (row.threadStage === "awaiting_reply") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-canvas px-2.5 py-1 text-[10px] font-bold text-ish-ink-soft ring-1 ring-ish-border">
        <Clock className="size-3" /> Awaiting reply
      </span>
    );
  }
  if (row.queueStatus === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-canvas px-2.5 py-1 text-[10px] font-bold text-ish-ink-faint">
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
            ? "bg-ish-pink-soft text-ish-stratus-salmon ring-1 ring-ish-stratus-salmon/25"
            : "bg-ish-canvas text-ish-ink-soft ring-1 ring-ish-border",
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
    <button
      type="button"
      onClick={() => onNavigate(row.leadId)}
      className="group w-full rounded-[18px] border border-ish-border/60 bg-white p-4 text-left shadow-[var(--shadow-ish-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-ish-stratus-blue/25 hover:shadow-[var(--shadow-ish)] active:scale-[0.995]"
    >
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl text-[12px] font-extrabold text-ish-ink shadow-[var(--shadow-ish-sm)]",
            avatarColor(row.contactName),
          )}
        >
          {initials(row.contactName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14px] font-bold text-ish-ink">{row.contactName}</span>
            <span className="text-ish-ink-faint">·</span>
            <span className="truncate text-[12px] font-medium text-ish-ink-soft">{row.companyName}</span>
          </div>
          {location && <p className="mt-0.5 truncate text-[11px] text-ish-ink-faint">{location}</p>}

          {tab === "needs_review" && (row.draftSubject || row.draftPreview) && (
            <div className="mt-2.5 rounded-[12px] border border-ish-border/50 bg-ish-canvas/40 px-3 py-2.5">
              {row.draftSubject && (
                <p className="truncate text-[11px] font-semibold text-ish-ink">{row.draftSubject}</p>
              )}
              {row.draftPreview && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ish-ink-soft">{row.draftPreview}</p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SequenceRail row={row} cadence={cadence} />
            <StatusPill row={row} />
          </div>

          {tab === "replies" && <NextActionCard row={row} onNavigate={onNavigate} />}
        </div>

        <ChevronRight className="mt-1 size-4 shrink-0 text-ish-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ish-ink" />
      </div>
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function TabEmptyState({ tab }: { tab: QueueTab }) {
  const copy = EMPTY_BY_TAB[tab];
  const tabMeta = QUEUE_TABS.find((t) => t.id === tab)!;
  const Icon = tabMeta.icon;

  return (
    <PanelCard className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-ish-yellow-soft">
        <Icon className="size-6 text-ish-ink-soft" />
      </div>
      <p className="text-[15px] font-bold text-ish-ink">{copy.title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-ish-ink-soft">{copy.body}</p>
    </PanelCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-36 rounded-[22px] bg-ish-border/60" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-[20px] bg-ish-border/60" />
        ))}
      </div>
      <div className="h-12 rounded-full bg-ish-border/60" />
      <div className="h-64 rounded-[20px] bg-ish-border/60" />
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

  const activeTab = useMemo(
    () => parseQueueTab(searchParams.get("tab")),
    [searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchEmailOverview();
      setData(overview);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const overview = await fetchEmailOverview();
        if (!cancelled) setData(overview);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        cardClass: "bg-ish-yellow-soft",
        iconClass: "bg-ish-yellow text-ish-ink",
      },
      {
        tab: "active" as QueueTab,
        label: "Active",
        value: tabCount(data, "active"),
        sub: `${data.stats.dueToday} due today`,
        icon: Send,
        cardClass: "bg-white",
        iconClass: "bg-ish-stratus-blue/20 text-ish-black",
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
        cardClass: "bg-ish-green-soft",
        iconClass: "bg-ish-green text-white",
      },
      {
        tab: "done" as QueueTab,
        label: "Done",
        value: tabCount(data, "done"),
        sub: "Finished threads",
        icon: CheckCircle2,
        cardClass: "bg-ish-canvas",
        iconClass: "bg-white text-ish-ink-soft shadow-[var(--shadow-ish-sm)]",
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
    <div className="settings-ambient min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10 animate-ish-page-in">
        <SettingsHero
          icon={ListChecks}
          title="Outreach Queue"
          subtitle={
            data
              ? `${cadenceSummary(cadence)}. Review drafts, track sequences, and respond from one place.`
              : "Review drafts, track sequences, and respond from one place."
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SyncRepliesButton onSynced={load} />
              {data && (
                <button
                  type="button"
                  onClick={() => void handleToggleSending()}
                  disabled={togglingSend}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[14px] border px-4 py-2.5 text-[12px] font-semibold shadow-[var(--shadow-ish-sm)] transition-all disabled:opacity-60",
                    data.outreachPaused
                      ? "border-ish-green/40 bg-ish-green/10 text-ish-green hover:bg-ish-green/15"
                      : "border-ish-stratus-salmon/40 bg-ish-pink-soft/50 text-ish-stratus-salmon hover:bg-ish-pink-soft",
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
                title="Refresh queue"
                className="inline-flex items-center gap-2 rounded-[14px] bg-ish-black px-4 py-2.5 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-black/90 disabled:opacity-60"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                Refresh
              </button>
            </div>
          }
        />

        {data?.outreachPaused && (
          <div className="mb-6 rounded-[16px] border border-ish-stratus-salmon/35 bg-ish-pink-soft/45 px-4 py-3.5">
            <p className="text-[13px] font-semibold text-ish-ink">Outreach sending is paused</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ish-ink-soft">
              No Email 1 sends or automated follow-ups will go out. Scheduled emails stay queued until you click Start sending.
            </p>
          </div>
        )}

        {loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
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

            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {QUEUE_TABS.map(({ id, label, icon: Icon, accent }) => {
                  const count = tabCount(data, id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all",
                        activeTab === id
                          ? "bg-ish-black text-white shadow-[var(--shadow-ish-sm)]"
                          : "border border-ish-border bg-white text-ish-ink-soft hover:border-ish-ink/20 hover:text-ish-ink",
                      )}
                    >
                      <Icon className={cn("size-3", activeTab === id ? "text-white" : accent)} />
                      {label}
                      <span
                        className={cn(
                          "ml-0.5 min-w-[18px] rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                          activeTab === id ? "bg-white/20 text-white" : "bg-ish-canvas text-ish-ink-soft",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative min-w-[200px] flex-1 sm:w-[260px] sm:flex-none">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contact or company…"
                  className="w-full rounded-full border border-ish-border bg-white py-2 pl-9 pr-3 text-[12px] text-ish-ink outline-none shadow-[var(--shadow-ish-sm)] placeholder:text-ish-ink-faint focus:border-ish-stratus-blue/40 focus:ring-2 focus:ring-ish-stratus-blue/10"
                />
              </div>
            </div>

            <div className="space-y-3 pb-8">
              {visibleRows.length === 0 ? (
                search.trim() ? (
                  <PanelCard className="flex flex-col items-center justify-center py-14 text-center">
                    <Mail className="mb-2 size-8 text-ish-ink-faint" />
                    <p className={cn(text.body, "font-semibold text-ish-ink")}>No matches in this tab</p>
                    <p className="mt-1 text-[12px] text-ish-ink-soft">Try a different name or clear search.</p>
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
            <p className="text-[14px] font-semibold text-ish-ink">Could not load outreach queue</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-full bg-ish-black px-4 py-2 text-[12px] font-semibold text-white"
            >
              Try again
            </button>
          </PanelCard>
        )}
      </div>
    </div>
  );
}
