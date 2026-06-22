"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Lightbulb, MapPin, RefreshCw } from "lucide-react";
import type { CompanyOverview, CompanyOverviewInput } from "@/lib/company-overview";
import { displayValue } from "@/lib/company-overview";
import { useCompanyOverview } from "@/hooks/use-company-overview";
import { PanelCard, SectionHeader, ScoreGauge } from "@/design-system";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logo?: string;
  city?: string;
  giftScore?: number;
  industry?: string;
  overviewInput: CompanyOverviewInput | null;
  initialOverview?: CompanyOverview;
  enabled?: boolean;
  className?: string;
  decisionMakerLeadId?: string;
};

function OverviewRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-3.5 py-2.5", className)}>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
        {label}
      </div>
      <div className="break-words text-[13px] font-bold leading-snug text-ish-ink">{value}</div>
    </div>
  );
}



function DecisionMakerRow({ value, leadId }: { value: string; leadId?: string }) {
  return (
    <div className="flex items-start gap-2 px-3.5 py-2.5 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
            Decision Maker
          </div>
          {leadId ? (
            <Link
              href={`/?lead=${leadId}`}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-ish-border/80 bg-white text-blue-600 transition-colors hover:bg-ish-app"
              title="Open lead"
              aria-label="Open lead profile"
            >
              <ExternalLink className="size-3" />
            </Link>
          ) : null}
        </div>
        <div className="break-words text-[13px] font-bold leading-snug text-ish-ink">{value}</div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ish-ink-faint">
      {children}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3">
      <div className="h-[108px] rounded-xl bg-ish-border/40" />
      <div className="h-14 rounded-xl bg-ish-border/30" />
      <div className="h-20 rounded-xl bg-ish-border/30" />
      <div className="h-14 rounded-xl bg-ish-border/30" />
    </div>
  );
}

export function CompanyOverviewPanel({
  name,
  logo = "🏢",
  city,
  giftScore = 60,
  industry,
  overviewInput,
  initialOverview,
  enabled = true,
  className,
  decisionMakerLeadId,
}: Props) {
  const { overview, loading, error, enrichedAt, cached, hasLoaded, refresh } = useCompanyOverview(
    overviewInput ? { ...overviewInput, name } : null,
    { enabled, initialOverview },
  );

  const o = overview ?? initialOverview ?? {};
  const pastGifting = o.pastGiftingBrands ?? [];

  return (
    <PanelCard
      tone="white"
      className={cn("flex h-full flex-col gap-4 overflow-y-auto rounded-none p-4", className)}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-ish-border/60 pb-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-[32px] leading-none">{logo}</div>
          <div className="break-words text-[17px] font-bold leading-tight text-ish-ink">{name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ish-ink-soft">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3 shrink-0" />
              <span className="break-words">{industry ?? o.sector ?? "Corporate"}</span>
            </span>
            {city ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-ish-border">·</span>
                <MapPin className="size-3 shrink-0" />
                <span>{city}</span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ScoreGauge score={giftScore} size="md" background />
          <span className="text-[9px] font-semibold uppercase tracking-wide text-ish-ink-faint">
            Gift Score
          </span>
        </div>
      </div>

      <SectionHeader
        title="Company Overview"
        size="card"
        className="mb-0"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-ish-border/80 bg-ish-app px-2 py-1 text-[10px] font-semibold text-ish-ink-soft transition-colors hover:bg-white disabled:opacity-50"
            title="Refresh overview"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            Refresh
          </button>
        }
      />

      {loading ? (
        <OverviewSkeleton />
      ) : !hasLoaded && !overview ? (
        <div className="rounded-xl border border-dashed border-ish-border/80 bg-ish-app/50 px-4 py-8 text-center">
          <p className="text-[12px] font-medium text-ish-ink-soft">
            Click Refresh to load company overview
          </p>
          <p className="mt-1 text-[11px] text-ish-ink-faint">
            Enrichment runs on demand via web search and AI
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Primary — stacked rows for narrow sidebar */}
          <div>
            <SectionLabel>Primary</SectionLabel>
            <PanelCard tone="yellow" className="overflow-hidden p-0">
              <div className="grid grid-cols-2 divide-x divide-ish-border/25">
                <OverviewRow label="Sector" value={displayValue(o.sector ?? industry)} />
                <OverviewRow label="Employees" value={displayValue(o.employees)} />
              </div>
              <div className="border-t border-ish-border/25">
                <DecisionMakerRow
                  value={displayValue(o.decisionMaker)}
                  leadId={decisionMakerLeadId}
                />
              </div>
            </PanelCard>
          </div>

          {/* Secondary */}
          <div>
            <SectionLabel>Secondary</SectionLabel>
            <div className="flex flex-col gap-2">
              <PanelCard tone="green" className="p-3.5">
                <OverviewRow
                  label="Next Gifting Calendar Cycle"
                  value={displayValue(o.nextGiftingCalendarCycle)}
                  className="px-0 py-0"
                />
              </PanelCard>

              <PanelCard tone="pink" className="p-3.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  Recent Corporate Milestones
                </div>
                {o.corporateMilestones?.length ? (
                  <ul className="list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-ish-ink-soft">
                    {o.corporateMilestones.map((m, i) => (
                      <li key={i} className="break-words">
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12px] text-ish-ink-soft">—</div>
                )}
              </PanelCard>

              <PanelCard tone="yellow" className="p-3.5">
                <OverviewRow
                  label="Contract / Vendor Compliance"
                  value={displayValue(o.complianceRequirements)}
                  className="px-0 py-0"
                />
              </PanelCard>
            </div>
          </div>

          {/* Past Gifting */}
          <div>
            <SectionHeader title="Past Gifting Brands" size="card" className="mb-2" />
            <div className="flex flex-col gap-2">
              {pastGifting.length ? (
                pastGifting.map((g, i) => (
                  <PanelCard key={i} tone="pink" className="flex items-start gap-2.5 p-3">
                    {g.year ? (
                      <span className="mt-0.5 shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-ish-ink-soft">
                        {g.year}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[12.5px] font-semibold text-ish-ink">
                        {g.occasion ?? "Gifting"}
                      </div>
                      <div className="break-words text-[11px] text-ish-ink-soft">{g.items ?? "—"}</div>
                    </div>
                    {g.perPerson ? (
                      <span className="shrink-0 text-[11.5px] font-bold text-ish-ink">{g.perPerson}</span>
                    ) : null}
                  </PanelCard>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-ish-border/80 px-3 py-2.5 text-[12px] text-ish-ink-faint">
                  —
                </div>
              )}
            </div>
          </div>

          {o.giftBudget ? (
            <PanelCard tone="green" className="p-3.5">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                Est. Gift Budget
              </div>
              <div className="text-[16px] font-bold text-ish-ink">{o.giftBudget}</div>
            </PanelCard>
          ) : null}

          {o.intelligenceNotes ? (
            <PanelCard tone="yellow" className="p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                <Lightbulb className="size-3.5 shrink-0" />
                Intelligence
              </div>
              <p className="break-words text-[12px] italic leading-relaxed text-ish-ink-soft">
                {o.intelligenceNotes}
              </p>
            </PanelCard>
          ) : null}
        </div>
      )}

      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}

      {enrichedAt ? (
        <p className="mt-auto border-t border-ish-border/50 pt-3 text-[10px] text-ish-ink-faint">
          {cached ? "Cached overview" : "Enriched"} · {new Date(enrichedAt).toLocaleString("en-IN")}
        </p>
      ) : null}
    </PanelCard>
  );
}
