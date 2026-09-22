"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Mail,
  MessageSquare,
  Send,
  Eye,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelCard, text, IshSelect } from "@/design-system";
import type { HomeOutreachSnapshot } from "@/lib/email/home-outreach-snapshot";
import {
  HOME_OUTREACH_PERIOD_OPTIONS,
  type HomeOutreachPeriodId,
} from "@/lib/email/home-outreach-period";

type Props = {
  loading?: boolean;
  /** Increment to refetch (e.g. Home refresh button). */
  reloadSignal?: number;
};

function MetricTile({
  label,
  value,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-brand-border bg-brand-canvas/80 p-3",
        "transition-colors hover:border-brand-ink/15 hover:bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-soft">{label}</span>
        <div className={cn("flex size-7 items-center justify-center rounded-full", accent)}>
          <Icon className="size-3.5" />
        </div>
      </div>
      <div className="text-[26px] font-extrabold leading-none tabular-nums text-brand-ink">{value}</div>
    </Link>
  );
}

function StepRow({ step, maxSent }: { step: HomeOutreachSnapshot["steps"][number]; maxSent: number }) {
  const widthPct = maxSent > 0 ? Math.max(8, Math.round((step.sent / maxSent) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-brand-ink">{step.label}</span>
        <span className="text-[11px] tabular-nums text-brand-ink-soft">
          {step.sent} sent · {step.opened} opened
          {step.sent > 0 ? ` · ${step.openRatePct}%` : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-brand-border">
        <div
          className="h-full rounded-full bg-brand-stratus-blue transition-all duration-500"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function defaultCustomRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function HomeOutreachInsights({ reloadSignal = 0 }: Props) {
  const [period, setPeriod] = useState<HomeOutreachPeriodId>("today");
  const [customFrom, setCustomFrom] = useState(() => defaultCustomRange().from);
  const [customTo, setCustomTo] = useState(() => defaultCustomRange().to);
  const [data, setData] = useState<HomeOutreachSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (period === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    try {
      const res = await fetch(`/api/home/outreach?${params.toString()}`);
      if (res.ok) {
        setData((await res.json()) as HomeOutreachSnapshot);
      }
    } catch {
      /* keep prior data */
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const activity = data?.activity ?? data?.today;
  const periodMeta = data?.period;
  const showDue = period === "today";

  if (loading && !data) {
    return (
      <PanelCard className="mb-5">
        <div className="h-40 animate-pulse rounded-xl bg-brand-border" />
      </PanelCard>
    );
  }

  if (!data || !activity) return null;

  const maxStepSent = Math.max(...data.steps.map((s) => s.sent), 1);
  const rangeLabel = periodMeta?.rangeLabel ?? "";

  return (
    <PanelCard className="mb-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-brand-stratus-blue/15">
              <Mail className="size-3.5 text-brand-stratus-blue" />
            </div>
            <span className={cn(text.sectionTitle)}>Outreach timeline</span>
          </div>
          <p className={cn(text.caption, "mt-1")}>
            {rangeLabel} · E1–E3 and If Opened in this window
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <IshSelect
              aria-label="Time period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as HomeOutreachPeriodId)}
              className="min-w-[140px]"
            >
              {HOME_OUTREACH_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </IshSelect>
            <Link
              href="/email"
              className="inline-flex h-10 items-center gap-1 rounded-xl border border-brand-border px-3 text-[12px] font-semibold text-brand-stratus-blue hover:bg-brand-canvas"
            >
              Outbox
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {period === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-xl border border-brand-border bg-white px-2 text-[12px] text-brand-ink"
                aria-label="From date"
              />
              <span className="text-[11px] text-brand-ink-soft">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-xl border border-brand-border bg-white px-2 text-[12px] text-brand-ink"
                aria-label="To date"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="h-9 rounded-xl bg-brand-stratus-blue px-3 text-[12px] font-semibold text-white"
              >
                Apply
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "mb-5 grid gap-2",
          showDue ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        <MetricTile
          label="Sent"
          value={activity.sent}
          icon={Send}
          href="/email?tab=logs"
          accent="bg-brand-stratus-blue/15 text-brand-stratus-blue"
        />
        {showDue ? (
          <MetricTile
            label="Due today"
            value={activity.due}
            icon={CalendarClock}
            href="/email?tab=active"
            accent="bg-brand-yellow text-brand-ink"
          />
        ) : null}
        <MetricTile
          label="Opens"
          value={activity.opened}
          icon={Eye}
          href="/email?tab=hot"
          accent="bg-brand-pink-soft text-brand-stratus-salmon"
        />
        <MetricTile
          label="Human replies"
          value={activity.replies}
          icon={MessageSquare}
          href="/email?tab=replies"
          accent="bg-teal-500/15 text-teal-700"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Replied (waiting)",
            value: data.totals.replied,
            href: "/email?tab=replies",
            sub: "Current pipeline",
          },
          {
            label: "Hot leads",
            value: data.totals.hot,
            href: "/email?tab=hot",
            sub: "Opened, no reply",
          },
          {
            label: "Active sequences",
            value: data.totals.activeSequences,
            href: "/email?tab=active",
            sub: "Follow-ups running",
          },
          {
            label: "Open rate",
            value: `${data.totals.openRatePct}%`,
            href: "/email?tab=logs",
            sub:
              period === "all"
                ? `${data.totals.opened} / ${data.totals.sent} sent`
                : `${data.totals.opened} / ${data.totals.sent} in range`,
          },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-xl border border-brand-border/80 bg-white px-3 py-2.5 hover:border-brand-ink/15"
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-brand-ink-soft">{item.label}</div>
            <div className="mt-0.5 text-[22px] font-extrabold tabular-nums text-brand-ink">{item.value}</div>
            <div className="text-[10px] text-brand-ink-faint">{item.sub}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-border/70 bg-brand-canvas/50 p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-bold text-brand-ink">
            Sequence sends{period === "all" ? " (all time)" : ""}
          </span>
          {data.totals.needsReview > 0 ? (
            <Link
              href="/email?tab=needs_review"
              className="inline-flex items-center gap-1 rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-bold text-brand-ink"
            >
              {data.totals.needsReview} need review
            </Link>
          ) : (
            <span className="text-[10px] text-brand-ink-faint">E1 · E2 · E3 · If Opened</span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {data.steps.map((step) => (
            <StepRow key={step.label} step={step} maxSent={maxStepSent} />
          ))}
        </div>
        {data.totals.hot > 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-pink-soft/60 px-3 py-2 text-[11px] font-medium text-brand-ink">
            <Flame className="size-3.5 shrink-0 text-brand-stratus-salmon" />
            {data.totals.hot} prospect{data.totals.hot === 1 ? "" : "s"} opened mail and have not replied yet.
          </div>
        ) : null}
      </div>

    </PanelCard>
  );
}
