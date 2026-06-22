"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb, MapPin, RefreshCw } from "lucide-react";
import type { CompanyOverview, CompanyOverviewInput } from "@/lib/company-overview";
import { displayValue } from "@/lib/company-overview";
import { useCompanyOverview } from "@/hooks/use-company-overview";
import { PanelCard, SectionHeader } from "@/design-system";
import { CompanyLogo } from "@/components/company/company-logo";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logo?: string;
  domain?: string;
  website?: string;
  city?: string;
  giftScore?: number;
  industry?: string;
  overviewInput: CompanyOverviewInput | null;
  initialOverview?: CompanyOverview;
  enabled?: boolean;
  className?: string;
  decisionMakerLeadId?: string;
  layout?: "sidebar" | "wide";
  footer?: ReactNode;
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
    <div className="flex min-w-0 items-start gap-2 px-3.5 py-2.5">
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

function BentoCell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("min-h-0 min-w-0", className)}>{children}</div>;
}

function OverviewSkeleton({ wide, compact }: { wide?: boolean; compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid animate-pulse gap-2.5",
        wide ? "grid-cols-6 auto-rows-[minmax(72px,auto)]" : "grid-cols-2",
      )}
    >
      <div
        className={cn(
          "rounded-xl bg-ish-border/40",
          wide
            ? compact
              ? "col-span-2 h-20"
              : "col-span-3 row-span-2 h-full min-h-[140px]"
            : "col-span-2 h-[108px]",
        )}
      />
      <div className={cn("h-20 rounded-xl bg-ish-border/30", wide ? "col-span-2" : "col-span-1")} />
      <div className={cn("h-20 rounded-xl bg-ish-border/30", wide ? "col-span-2" : "col-span-1")} />
    </div>
  );
}

export function CompanyOverviewPanel({
  name,
  logo,
  domain,
  website,
  city,
  industry,
  overviewInput,
  initialOverview,
  enabled = true,
  className,
  decisionMakerLeadId,
  layout = "sidebar",
  footer,
}: Props) {
  const { overview, loading, error, enrichedAt, cached, hasLoaded, refresh } = useCompanyOverview(
    overviewInput ? { ...overviewInput, name } : null,
    { enabled, initialOverview },
  );

  const o = overview ?? initialOverview ?? {};
  const pastGifting = o.pastGiftingBrands ?? [];
  const milestones = (o.corporateMilestones ?? []).filter((m) => m.trim());
  const wide = layout === "wide";
  const compactPrimary = Boolean(footer);
  const showIntelligence = Boolean(o.intelligenceNotes?.trim()) && !footer;
  const hasGiftBudget = Boolean(o.giftBudget?.trim());
  const complianceSpan = wide
    ? hasGiftBudget
      ? "col-span-1"
      : compactPrimary
        ? "col-span-2"
        : "col-span-3"
    : "col-span-2";
  const nextGiftingSpan = wide
    ? hasGiftBudget
      ? "col-span-2"
      : compactPrimary
        ? "col-span-2"
        : "col-span-3"
    : "col-span-1";

  const bentoGrid = cn(
    "grid gap-2.5",
    wide ? "grid-cols-6 auto-rows-[minmax(72px,auto)]" : "grid-cols-2",
  );

  return (
    <PanelCard
      tone="white"
      className={cn("flex h-full flex-col gap-4 overflow-y-auto rounded-none p-4", className)}
    >
      <div className="flex items-start gap-3 border-b border-ish-border/60 pb-3">
        <CompanyLogo
          name={name}
          domain={domain ?? overviewInput?.domain}
          website={website ?? overviewInput?.website}
          logo={logo}
          size="xl"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="break-words text-[17px] font-bold leading-tight text-ish-ink">{name}</div>
          {city ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-ish-ink-soft">
              <MapPin className="size-3 shrink-0" />
              <span>{city}</span>
            </div>
          ) : null}
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
        <OverviewSkeleton wide={wide} compact={compactPrimary} />
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
        <div className={bentoGrid}>
          <BentoCell
            className={
              wide
                ? compactPrimary
                  ? "col-span-2"
                  : "col-span-3 row-span-2"
                : "col-span-2"
            }
          >
            <PanelCard tone="yellow" className="h-full overflow-hidden p-0">
              {compactPrimary ? (
                <DecisionMakerRow
                  value={displayValue(o.decisionMaker)}
                  leadId={decisionMakerLeadId}
                />
              ) : (
                <>
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
                </>
              )}
            </PanelCard>
          </BentoCell>

          <BentoCell className={nextGiftingSpan}>
            <PanelCard tone="green" className="h-full p-3.5">
              <OverviewRow
                label="Next Gifting Cycle"
                value={displayValue(o.nextGiftingCalendarCycle)}
                className="px-0 py-0"
              />
            </PanelCard>
          </BentoCell>

          {hasGiftBudget ? (
            <BentoCell className={wide ? "col-span-1" : "col-span-1"}>
              <PanelCard tone="green" className="flex h-full flex-col justify-center p-3.5">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  Est. Gift Budget
                </div>
                <div className="text-[15px] font-bold leading-tight text-ish-ink">{o.giftBudget}</div>
              </PanelCard>
            </BentoCell>
          ) : null}

          <BentoCell className={complianceSpan}>
            <PanelCard tone="yellow" className="h-full p-3.5">
              <OverviewRow
                label="Contract / Vendor Compliance"
                value={displayValue(o.complianceRequirements)}
                className="px-0 py-0"
              />
            </PanelCard>
          </BentoCell>

          {milestones.length > 0 ? (
            <BentoCell className={wide ? "col-span-6" : "col-span-2"}>
              <PanelCard tone="pink" className="h-full p-3.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  Recent Corporate Milestones
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {milestones.map((m, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12px] leading-relaxed text-ish-ink-soft before:mt-1.5 before:size-1 before:shrink-0 before:rounded-full before:bg-ish-pink"
                    >
                      <span className="min-w-0 break-words">{m}</span>
                    </li>
                  ))}
                </ul>
              </PanelCard>
            </BentoCell>
          ) : null}

          {pastGifting.length > 0 ? (
            <BentoCell className={wide ? "col-span-6" : "col-span-2"}>
              <PanelCard tone="white" className="p-3.5">
                <SectionHeader title="Past Gifting Brands" size="card" className="mb-2.5" />
                <div className={cn("grid gap-2", wide ? "grid-cols-3" : "grid-cols-1")}>
                  {pastGifting.map((g, i) => (
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
                  ))}
                </div>
              </PanelCard>
            </BentoCell>
          ) : null}

          {showIntelligence ? (
            <BentoCell className={wide ? "col-span-6" : "col-span-2"}>
              <PanelCard tone="yellow" className="p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  <Lightbulb className="size-3.5 shrink-0" />
                  Intelligence
                </div>
                <p className="break-words text-[12px] italic leading-relaxed text-ish-ink-soft">
                  {o.intelligenceNotes}
                </p>
              </PanelCard>
            </BentoCell>
          ) : null}

          {footer ? (
            <BentoCell className={wide ? "col-span-6" : "col-span-2"}>
              <div className={cn("grid gap-2.5", wide ? "grid-cols-3" : "grid-cols-1")}>{footer}</div>
            </BentoCell>
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
