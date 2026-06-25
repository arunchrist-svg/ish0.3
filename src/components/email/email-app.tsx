"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelCard, text } from "@/design-system";
import { SettingsHero } from "@/components/settings/settings-hero";
import type { LeadEmailRow } from "@/app/api/email/overview/route";

type OverviewData = {
  stats: { totalSent: number; opened: number; replied: number; dueToday: number; total: number };
  hot: LeadEmailRow[];
  active: LeadEmailRow[];
  draftReady: LeadEmailRow[];
  stopped: LeadEmailRow[];
};

type FilterTab = "all" | "hot" | "active" | "drafts" | "stopped";

const AVATAR_COLORS = [
  "bg-ish-avatar-1",
  "bg-ish-avatar-2",
  "bg-ish-avatar-3",
  "bg-ish-avatar-4",
  "bg-ish-avatar-5",
  "bg-ish-avatar-6",
];

const SEQUENCE_DAYS = [0, 3, 7] as const;
const EMAIL_DAY_LABEL: Record<number, string> = { 0: "Email 1", 3: "Email 2", 7: "Email 3" };

const FILTER_CONFIG: { id: FilterTab; label: string; icon?: React.ElementType; accent?: string }[] = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot", icon: Flame, accent: "text-orange-500" },
  { id: "active", label: "Active", icon: Send, accent: "text-ish-stratus-blue" },
  { id: "drafts", label: "Drafts", icon: FileText, accent: "text-ish-ink" },
  { id: "stopped", label: "Done", icon: CheckCircle2, accent: "text-ish-green" },
];

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

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── KPI Tile ───────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  cardClass,
  iconClass,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  cardClass: string;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[20px] p-5 shadow-[var(--shadow-ish-sm)]", cardClass)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", iconClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div>
        <div className={cn("text-[30px] font-extrabold leading-none tabular-nums", valueClass ?? "text-ish-ink")}>{value}</div>
        {sub && <div className="mt-1.5 text-[11px] font-medium opacity-65">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Sequence progress ──────────────────────────────────────────────────────

function SequenceProgress({ row }: { row: LeadEmailRow }) {
  return (
    <div className="flex items-center gap-1">
      {SEQUENCE_DAYS.map((day, i) => {
        const sent = row.emailsSent > 0 && day <= row.lastEmailDay;
        const isNext = row.nextEmailDay === day;
        return (
          <div key={day} className="flex items-center gap-1">
            <div
              className={cn(
                "flex h-6 min-w-[52px] items-center justify-center rounded-full px-2 text-[9px] font-bold uppercase tracking-wide transition-colors",
                sent
                  ? "bg-ish-black text-white"
                  : isNext
                    ? "bg-ish-yellow text-ish-ink ring-2 ring-ish-yellow/50"
                    : "bg-ish-canvas text-ish-ink-faint",
              )}
            >
              {EMAIL_DAY_LABEL[day]?.replace("Email ", "E") ?? `D${day}`}
            </div>
            {i < SEQUENCE_DAYS.length - 1 && (
              <div className={cn("h-px w-3", sent ? "bg-ish-black/30" : "bg-ish-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ row }: { row: LeadEmailRow }) {
  if (row.openedAt && row.status === "hot") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200/80">
        <Eye className="size-3" /> Opened {timeAgo(row.openedAt)}
      </span>
    );
  }
  if (row.status === "draft_ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-yellow-soft px-2.5 py-1 text-[10px] font-bold text-ish-ink ring-1 ring-ish-yellow/40">
        <Zap className="size-3" /> Reply draft ready
      </span>
    );
  }
  if (row.status === "replied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-green-soft px-2.5 py-1 text-[10px] font-bold text-ish-green ring-1 ring-ish-green/20">
        <MessageSquare className="size-3" /> Replied
      </span>
    );
  }
  if (row.status === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ish-canvas px-2.5 py-1 text-[10px] font-bold text-ish-ink-faint">
        <CheckCircle2 className="size-3" /> Sequence complete
      </span>
    );
  }
  if (row.nextEmailDue) {
    const dueDate = new Date(row.nextEmailDue);
    const isToday = dueDate <= new Date(Date.now() + 24 * 60 * 60 * 1000);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
          isToday
            ? "bg-ish-pink-soft text-ish-stratus-salmon ring-1 ring-ish-stratus-salmon/25"
            : "bg-ish-canvas text-ish-ink-soft",
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

function LeadCard({ row, onNavigate }: { row: LeadEmailRow; onNavigate: (id: string) => void }) {
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
          {location && (
            <p className="mt-0.5 truncate text-[11px] text-ish-ink-faint">{location}</p>
          )}

          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SequenceProgress row={row} />
            <StatusPill row={row} />
          </div>
        </div>

        <ChevronRight className="mt-1 size-4 shrink-0 text-ish-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ish-ink" />
      </div>
    </button>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({
  title,
  icon: Icon,
  iconBg,
  rows,
  emptyLabel,
  onNavigate,
}: {
  title: string;
  icon: React.ElementType;
  iconBg: string;
  rows: LeadEmailRow[];
  emptyLabel: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <PanelCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-ish-border/60 bg-ish-canvas/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex size-8 items-center justify-center rounded-xl", iconBg)}>
            <Icon className="size-4 text-ish-ink" />
          </div>
          <h2 className={cn(text.sectionTitle, "text-[14px]")}>{title}</h2>
        </div>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-ish-ink shadow-[var(--shadow-ish-sm)]">
          {rows.length}
        </span>
      </div>

      <div className="space-y-2.5 p-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-ish-border bg-gradient-to-b from-ish-yellow-soft/20 to-white px-6 py-10 text-center">
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-ish-canvas">
              <Inbox className="size-4 text-ish-ink-faint" />
            </div>
            <p className={cn(text.body, "font-semibold text-ish-ink-soft")}>{emptyLabel}</p>
          </div>
        ) : (
          rows.map((row) => <LeadCard key={row.leadId} row={row} onNavigate={onNavigate} />)
        )}
      </div>
    </PanelCard>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-36 rounded-[22px] bg-ish-border/60" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-[20px] bg-ish-border/60" />
        ))}
      </div>
      <div className="h-64 rounded-[20px] bg-ish-border/60" />
      <div className="h-48 rounded-[20px] bg-ish-border/60" />
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export function EmailApp() {
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [runningSequencer, setRunningSequencer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/overview");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleNavigate = (leadId: string) => {
    router.push(`/leads?lead=${leadId}`);
  };

  const handleRunSequencer = async () => {
    setRunningSequencer(true);
    try {
      await fetch("/api/sequencer/run", { method: "POST" });
      await load();
    } finally {
      setRunningSequencer(false);
    }
  };

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

  const sections = useMemo(() => {
    if (!data) return [] as { key: string; title: string; icon: React.ElementType; iconBg: string; rows: LeadEmailRow[]; emptyLabel: string }[];

    const { hot, active, draftReady, stopped } = data;
    const all = [
      { key: "hot", title: "Hot — opened, no reply", icon: Flame, iconBg: "bg-orange-100", rows: filterRows(hot), emptyLabel: "No hot leads yet — opens will appear here" },
      { key: "active", title: "Active sequences", icon: Send, iconBg: "bg-ish-stratus-blue/20", rows: filterRows(active), emptyLabel: "No active sequences running" },
      { key: "drafts", title: "Reply drafts ready", icon: FileText, iconBg: "bg-ish-yellow-soft", rows: filterRows(draftReady), emptyLabel: "No reply drafts waiting for review" },
      { key: "stopped", title: "Complete & stopped", icon: CheckCircle2, iconBg: "bg-ish-green-soft", rows: filterRows(stopped), emptyLabel: "Finished sequences will show here" },
    ];

    if (filter === "all") return all.filter((s) => s.rows.length > 0 || !search.trim());
    return all.filter((s) => s.key === filter);
  }, [data, filter, filterRows, search]);

  const openRate = data && data.stats.total > 0 ? Math.round((data.stats.opened / data.stats.total) * 100) : 0;
  const replyRate = data && data.stats.total > 0 ? Math.round((data.stats.replied / data.stats.total) * 100) : 0;

  return (
    <div className="settings-ambient min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10 animate-ish-page-in">

        <SettingsHero
          icon={Mail}
          title="Email Outreach"
          subtitle="Track sequences, opens, reply drafts, and due follow-ups across your pipeline"
          action={
            <button
              type="button"
              onClick={() => void handleRunSequencer()}
              disabled={runningSequencer}
              className="inline-flex items-center gap-2 rounded-[14px] bg-ish-black px-4 py-2.5 text-[12px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-black/90 disabled:opacity-60"
            >
              <Send className="size-3.5" />
              {runningSequencer ? "Sending…" : "Run Sequencer"}
            </button>
          }
        />

        {loading ? (
          <LoadingSkeleton />
        ) : data ? (
          <>
            {/* KPIs */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <KpiTile
                label="Emails sent"
                value={data.stats.totalSent}
                sub={`${data.stats.total} leads in sequences`}
                icon={Mail}
                cardClass="bg-white"
                iconClass="bg-ish-stratus-blue/20 text-ish-black"
              />
              <KpiTile
                label="Opened"
                value={data.stats.opened}
                sub={`${openRate}% open rate`}
                icon={Eye}
                cardClass="bg-ish-green-soft"
                iconClass="bg-ish-green text-white"
              />
              <KpiTile
                label="Replied"
                value={data.stats.replied}
                sub={`${replyRate}% reply rate`}
                icon={MessageSquare}
                cardClass="bg-ish-yellow-soft"
                iconClass="bg-ish-yellow text-ish-ink"
              />
              <KpiTile
                label="Due today"
                value={data.stats.dueToday}
                sub={data.stats.dueToday > 0 ? "Needs attention" : "All clear"}
                icon={Clock}
                cardClass="bg-ish-pink-soft"
                iconClass="bg-ish-pink text-ish-ink"
              />
            </div>

            {/* Filters + search */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_CONFIG.map(({ id, label, icon: Icon, accent }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all",
                      filter === id
                        ? "bg-ish-black text-white shadow-[var(--shadow-ish-sm)]"
                        : "border border-ish-border bg-white text-ish-ink-soft hover:border-ish-ink/20 hover:text-ish-ink",
                    )}
                  >
                    {Icon && <Icon className={cn("size-3", filter === id ? "text-white" : accent)} />}
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:w-[240px] sm:flex-none">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search contact or company…"
                    className="w-full rounded-full border border-ish-border bg-white py-2 pl-9 pr-3 text-[12px] text-ish-ink outline-none shadow-[var(--shadow-ish-sm)] placeholder:text-ish-ink-faint focus:border-ish-stratus-blue/40 focus:ring-2 focus:ring-ish-stratus-blue/10"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  title="Refresh"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ish-border bg-white text-ish-ink-soft shadow-[var(--shadow-ish-sm)] transition-colors hover:text-ish-ink"
                >
                  <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-5 pb-8">
              {sections.length === 0 ? (
                <PanelCard className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-ish-yellow-soft">
                    <Mail className="size-6 text-ish-ink-soft" />
                  </div>
                  <p className="text-[15px] font-bold text-ish-ink">No outreach activity yet</p>
                  <p className="mt-1 max-w-sm text-[12px] text-ish-ink-soft">
                    Send your first email from Lead Accelerator — sequences and opens will appear here.
                  </p>
                </PanelCard>
              ) : (
                sections.map((section) => (
                  <SectionBlock
                    key={section.key}
                    title={section.title}
                    icon={section.icon}
                    iconBg={section.iconBg}
                    rows={section.rows}
                    emptyLabel={section.emptyLabel}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <PanelCard className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[14px] font-semibold text-ish-ink">Could not load email data</p>
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
