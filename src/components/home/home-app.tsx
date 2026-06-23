"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Telescope,
  Rocket,
  GitFork,
  Mail,
  Users,
  TrendingUp,
  CheckCircle2,
  Zap,
  Activity,
  Clock,
  ArrowRight,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelCard, text } from "@/design-system";

// ─── Types ────────────────────────────────────────────────────────────────────

type FunnelData = {
  leadStatuses: { status: string; count: number }[];
  closedDeals: { count: number; totalAmount: number };
  emailAccuracy: {
    totalRuns: number;
    withEmail: number;
    verified: number;
    emailFoundRate: number;
    verifyRate: number;
  };
};

type LeadItem = {
  id: string;
  name: string;
  company: string;
  status: string;
};

type TavilyUsage = {
  configured: boolean;
  totalRemaining: number;
  totalLimit: number;
  totalUsed: number;
  percentUsed: number;
  sessionUsed: number;
};

type LlmConfig = {
  provider: string;
  gemini: { configured: boolean; active: boolean; flashModel: string };
  anthropic: { configured: boolean; active: boolean };
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  scouted: "Scouted",
  researched: "Researched",
  approved: "Approved",
  outreached: "Outreached",
  replied: "Replied",
  meeting: "Meeting",
  closed: "Closed",
  po_closed: "PO Closed",
};

const STATUS_CHIP: Record<string, string> = {
  scouted:    "bg-amber-400 text-white",
  researched: "bg-blue-500 text-white",
  approved:   "bg-ish-green text-white",
  outreached: "bg-violet-500 text-white",
  replied:    "bg-teal-500 text-white",
  meeting:    "bg-emerald-600 text-white",
  closed:     "bg-ish-black text-white",
  po_closed:  "bg-ish-black text-white",
};

const AVATAR_COLORS = [
  "bg-ish-avatar-1",
  "bg-ish-avatar-2",
  "bg-ish-avatar-3",
  "bg-ish-avatar-4",
  "bg-ish-avatar-5",
  "bg-ish-avatar-6",
];

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
        STATUS_CHIP[status] ?? "bg-ish-border text-ish-ink-soft",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

type KpiConfig = {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  cardClass: string;
  iconClass: string;
  valueClass?: string;
};

function KpiTile({ label, value, sub, icon: Icon, cardClass, iconClass, valueClass }: KpiConfig) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[20px] p-5", cardClass)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest opacity-70">{label}</span>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", iconClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div>
        <div className={cn("text-[32px] font-extrabold leading-none", valueClass ?? "text-ish-ink")}>{value}</div>
        {sub && <div className="mt-1.5 text-[12px] font-medium opacity-60">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────

type QuickActionProps = {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  iconBg: string;
  iconColor: string;
  hoverBorder: string;
};

function QuickActionCard({ label, description, icon: Icon, href, iconBg, iconColor, hoverBorder }: QuickActionProps) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-[16px] border border-ish-border bg-white p-4",
        "text-left transition-all duration-200 hover:shadow-ish-sm active:scale-[0.99]",
        hoverBorder,
      )}
    >
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[12px]", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(text.body, "font-bold")}>{label}</div>
        <div className={cn(text.caption, "mt-0.5 truncate")}>{description}</div>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-ish-ink-faint transition-transform duration-200 group-hover:translate-x-1" />
    </button>
  );
}

// ─── Usage Bar ────────────────────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  total,
  percent,
  barClass,
}: {
  label: string;
  used: number;
  total: number;
  percent: number;
  barClass: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={cn(text.body, "font-semibold")}>{label}</span>
        <span className={cn(text.caption, "tabular-nums font-medium")}>
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ish-border">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className={cn(text.caption, "text-ish-green font-medium")}>
          {(total - used).toLocaleString()} remaining
        </span>
        <span className={cn(text.caption, "font-semibold")}>{Math.round(clamped)}%</span>
      </div>
    </div>
  );
}

// ─── Activity Item ────────────────────────────────────────────────────────────

function ActivityItem({ lead, index }: { lead: LeadItem; index: number }) {
  const avatarBg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3",
        index !== 0 && "border-t border-ish-border",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-ish-ink",
          avatarBg,
        )}
      >
        {lead.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(text.body, "truncate font-bold")}>{lead.name}</div>
        <div className={cn(text.caption, "truncate")}>{lead.company}</div>
      </div>
      <StatusChip status={lead.status} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HomeApp() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [contacts, setContacts] = useState<number>(0);
  const [tavilyUsage, setTavilyUsage] = useState<TavilyUsage | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAll(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [funnelRes, leadsRes, contactsRes, tavilyRes, llmRes] = await Promise.allSettled([
        fetch("/api/funnel").then((r) => r.json()),
        fetch("/api/leads").then((r) => r.json()),
        fetch("/api/contacts").then((r) => r.json()),
        fetch("/api/usage/tavily").then((r) => r.json()),
        fetch("/api/usage/llm").then((r) => r.json()),
      ]);

      if (funnelRes.status === "fulfilled") setFunnel(funnelRes.value as FunnelData);
      if (leadsRes.status === "fulfilled") {
        const all: LeadItem[] = (leadsRes.value as { leads: LeadItem[] }).leads ?? [];
        setLeads(all.slice(0, 10));
      }
      if (contactsRes.status === "fulfilled") {
        const arr = Array.isArray(contactsRes.value) ? contactsRes.value : [];
        setContacts(arr.length);
      }
      if (tavilyRes.status === "fulfilled") setTavilyUsage(tavilyRes.value as TavilyUsage);
      if (llmRes.status === "fulfilled") setLlmConfig(llmRes.value as LlmConfig);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const totalLeads   = funnel?.leadStatuses.reduce((s, r) => s + Number(r.count), 0) ?? 0;
  const closedCount  = funnel?.closedDeals.count ?? 0;
  const closedAmount = funnel?.closedDeals.totalAmount ?? 0;
  const emailFoundRate = funnel?.emailAccuracy.emailFoundRate ?? 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto bg-ish-canvas p-8">
        <div className="mb-8 h-9 w-56 animate-pulse rounded-xl bg-ish-border" />
        <div className="mb-5 grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-[20px] bg-ish-border" />
          ))}
        </div>
        <div className="grid grid-cols-[1fr_320px] gap-4">
          <div className="h-96 animate-pulse rounded-[20px] bg-ish-border" />
          <div className="flex flex-col gap-4">
            <div className="h-52 animate-pulse rounded-[20px] bg-ish-border" />
            <div className="h-40 animate-pulse rounded-[20px] bg-ish-border" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-ish-canvas">
      <div className="mx-auto w-full max-w-5xl px-8 py-8">

        {/* Header */}
        <div className="mb-7 flex items-end justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="size-2 rounded-full bg-ish-green animate-pulse" />
              <span className={cn(text.caption, "font-semibold text-ish-green")}>Live</span>
            </div>
            <h1 className="text-[28px] font-extrabold text-ish-ink leading-tight">{greeting}</h1>
            <p className={cn(text.bodySoft, "mt-0.5")}>{today}</p>
          </div>
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-ish-border bg-white px-3.5 py-2",
              text.caption,
              "font-semibold transition-all hover:border-ish-ink/20 hover:bg-ish-yellow-soft hover:shadow-ish-sm active:scale-95",
            )}
          >
            <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* KPI tiles */}
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile
            label="Total Leads"
            value={totalLeads}
            sub="in pipeline"
            icon={TrendingUp}
            cardClass="bg-ish-yellow-soft"
            iconClass="bg-ish-yellow text-ish-ink"
          />
          <KpiTile
            label="Closed Deals"
            value={closedCount}
            sub={closedAmount > 0 ? `₹${(closedAmount / 100000).toFixed(1)}L` : "track wins"}
            icon={CheckCircle2}
            cardClass="bg-ish-green-soft"
            iconClass="bg-ish-green text-white"
          />
          <KpiTile
            label="Contacts"
            value={contacts}
            sub="in directory"
            icon={Users}
            cardClass="bg-ish-pink-soft"
            iconClass="bg-ish-pink text-ish-ink"
          />
          <KpiTile
            label="Email Hit Rate"
            value={`${emailFoundRate}%`}
            sub="emails found"
            icon={Mail}
            cardClass="bg-ish-black text-white"
            iconClass="bg-white/15 text-white"
            valueClass="text-white"
          />
        </div>

        {/* Main: activity + sidebar */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">

          {/* Activity Feed */}
          <PanelCard className="flex flex-col">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-violet-100">
                  <Activity className="size-3.5 text-violet-600" />
                </div>
                <span className={cn(text.sectionTitle)}>Recent Leads</span>
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                "bg-ish-yellow text-ish-ink",
              )}>
                {leads.length}
              </span>
            </div>

            {leads.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-14 gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-ish-yellow-soft">
                  <Clock className="size-6 text-amber-500" />
                </div>
                <p className={cn(text.bodySoft, "text-center max-w-[220px]")}>
                  No leads yet. Start scouting to populate your pipeline.
                </p>
              </div>
            ) : (
              <div className="mt-2">
                {leads.map((lead, i) => (
                  <ActivityItem key={lead.id} lead={lead} index={i} />
                ))}
              </div>
            )}
          </PanelCard>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">

            {/* Quick Actions */}
            <PanelCard>
              <div className="mb-3.5 flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-ish-yellow">
                  <Zap className="size-3.5 text-ish-ink" />
                </div>
                <span className={cn(text.sectionTitle)}>Quick Actions</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <QuickActionCard
                  label="Start Scout"
                  description="Find new companies & contacts"
                  icon={Telescope}
                  href="/scouting"
                  iconBg="bg-ish-yellow"
                  iconColor="text-ish-ink"
                  hoverBorder="hover:border-amber-300"
                />
                <QuickActionCard
                  label="Lead Accelerator"
                  description="Review and action your leads"
                  icon={Rocket}
                  href="/leads"
                  iconBg="bg-ish-pink"
                  iconColor="text-ish-ink"
                  hoverBorder="hover:border-pink-300"
                />
                <QuickActionCard
                  label="Yield Funnel"
                  description="Track pipeline progression"
                  icon={GitFork}
                  href="/funnel"
                  iconBg="bg-ish-green"
                  iconColor="text-white"
                  hoverBorder="hover:border-emerald-300"
                />
              </div>
            </PanelCard>

            {/* Usage */}
            <PanelCard>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-blue-100">
                  <Cpu className="size-3.5 text-blue-600" />
                </div>
                <span className={cn(text.sectionTitle)}>Usage</span>

                {llmConfig && (
                  <span className="ml-auto rounded-full bg-ish-black px-2.5 py-0.5 text-[11px] font-bold text-white">
                    {llmConfig.provider === "openrouter" ? "OpenRouter" : llmConfig.provider === "gemini" ? "Gemini" : "Anthropic"}
                  </span>
                )}
              </div>

              {tavilyUsage?.configured ? (
                <UsageBar
                  label="Web Search"
                  used={tavilyUsage.totalUsed}
                  total={tavilyUsage.totalLimit}
                  percent={tavilyUsage.percentUsed}
                  barClass={
                    tavilyUsage.percentUsed > 85
                      ? "bg-red-500"
                      : tavilyUsage.percentUsed > 60
                      ? "bg-ish-yellow"
                      : "bg-ish-green"
                  }
                />
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-ish-canvas px-3.5 py-3">
                  <span className={text.bodySoft}>Web Search</span>
                  <span className={cn(text.caption, "italic")}>not configured</span>
                </div>
              )}
            </PanelCard>

          </div>
        </div>
      </div>
    </div>
  );
}
