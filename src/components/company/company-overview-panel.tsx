"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Globe, Lightbulb, MapPin, RefreshCw } from "lucide-react";
import { formatScoutSizeLine } from "@/lib/enrichment/employee-size";
import type { CompanyOverview, CompanyOverviewInput } from "@/lib/company-overview";
import { displayValue } from "@/lib/company-overview";
import { useCompanyOverview } from "@/hooks/use-company-overview";
import { displayCompanyWebsite } from "@/lib/enrichment/company-domain-quality";
import { PanelCard, SectionHeader } from "@/design-system";
import { CompanyLogo } from "@/components/company/company-logo";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logo?: string;
  domain?: string;
  website?: string;
  city?: string;
  fitScore?: number;
  industry?: string;
  overviewInput: CompanyOverviewInput | null;
  initialOverview?: CompanyOverview;
  enabled?: boolean;
  className?: string;
  decisionMakerLeadId?: string;
  layout?: "sidebar" | "wide";
  footer?: ReactNode;
  onWebsiteResolved?: (resolved: { domain?: string; website?: string }) => void;
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
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
        {label}
      </div>
      <div className="break-words text-[13px] font-bold leading-snug text-brand-ink">{value}</div>
    </div>
  );
}

function DecisionMakerRow({ value, leadId }: { value: string; leadId?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
            Decision Maker
          </div>
          {leadId ? (
            <Link
              href={`/?lead=${leadId}`}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-brand-border/80 bg-white text-blue-600 transition-colors hover:bg-brand-app"
              title="Open lead"
              aria-label="Open lead profile"
            >
              <ExternalLink className="size-3" />
            </Link>
          ) : null}
        </div>
        <div className="break-words text-[13px] font-bold leading-snug text-brand-ink">{value}</div>
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
          "rounded-xl bg-brand-border/40",
          wide
            ? compact
              ? "col-span-2 h-20"
              : "col-span-3 row-span-2 h-full min-h-[140px]"
            : "col-span-2 h-[108px]",
        )}
      />
      <div className={cn("h-20 rounded-xl bg-brand-border/30", wide ? "col-span-2" : "col-span-1")} />
      <div className={cn("h-20 rounded-xl bg-brand-border/30", wide ? "col-span-2" : "col-span-1")} />
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
  onWebsiteResolved,
}: Props) {
  const { overview, loading, error, enrichedAt, cached, hasLoaded, resolvedDomain, resolvedWebsite, didFetch, refresh } =
    useCompanyOverview(overviewInput ? { ...overviewInput, name } : null, {
      enabled,
      initialOverview,
      onWebsiteResolved,
    });

  const o = overview ?? initialOverview ?? {};
  const displayDomain = didFetch ? resolvedDomain : (domain ?? overviewInput?.domain);
  const displayWebsite = didFetch ? resolvedWebsite : (website ?? overviewInput?.website);
  const site = displayCompanyWebsite(displayDomain, displayWebsite);
  const showWebsiteUnknown = didFetch && !site;
  const sizeLine = formatScoutSizeLine(overviewInput?.employees ?? o.employees);
  const sizeKnown = sizeLine !== "Unknown scale";
  const pastGifting = o.pastGiftingBrands ?? [];
  const milestones = (o.corporateMilestones ?? []).filter((m) => m.trim());
  const detectedOccasions = (o.detectedOccasions ?? []).filter((d) => d.type || d.label);
  const wide = layout === "wide";
  const compactPrimary = Boolean(footer);
  const showIntelligence = Boolean(o.intelligenceNotes?.trim()) && !footer;
  const hasGiftBudget = Boolean(o.budgetBand?.trim() || o.giftBudget?.trim());
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
      <div className="flex items-start gap-3 border-b border-brand-border/60 pb-3">
        <CompanyLogo
          name={name}
          domain={displayDomain}
          website={displayWebsite}
          logo={logo}
          size="xl"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="break-words text-[17px] font-bold leading-tight text-brand-ink">{name}</div>
          {city ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-brand-ink-soft">
              <MapPin className="size-3 shrink-0" />
              <span>{city}</span>
            </div>
          ) : null}
          {site ? (
            <a
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              <Globe className="size-3 shrink-0" />
              <span className="truncate">{site.label}</span>
            </a>
          ) : showWebsiteUnknown ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-brand-ink-faint">
              <Globe className="size-3 shrink-0" />
              <span>Website unknown</span>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {industry ? (
              <span className="inline-block rounded-full bg-brand-canvas px-2.5 py-0.5 text-[10.5px] font-medium text-brand-ink-soft">
                {industry}
              </span>
            ) : null}
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold",
                sizeKnown
                  ? "bg-brand-yellow text-brand-ink shadow-[var(--shadow-brand-yellow-sm)]"
                  : "bg-brand-canvas text-brand-ink-soft",
              )}
            >
              {sizeLine}
            </span>
          </div>
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
            className="inline-flex items-center gap-1 rounded-lg border border-brand-border/80 bg-brand-app px-2 py-1 text-[10px] font-semibold text-brand-ink-soft transition-colors hover:bg-white disabled:opacity-50"
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
        <div className="rounded-xl border border-dashed border-brand-border/80 bg-brand-app/50 px-4 py-8 text-center">
          <p className="text-[12px] font-medium text-brand-ink-soft">
            Click Refresh to load company overview
          </p>
          <p className="mt-1 text-[11px] text-brand-ink-faint">
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
                  <div className="grid grid-cols-2 divide-x divide-brand-border/25">
                    <OverviewRow label="Sector" value={displayValue(o.sector ?? industry)} />
                    <OverviewRow
                      label="Employees"
                      value={displayValue(
                        o.employees ||
                          (overviewInput?.employees
                            ? formatScoutSizeLine(overviewInput.employees)
                            : undefined),
                      )}
                    />
                  </div>
                  <div className="border-t border-brand-border/25">
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
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Est. Budget Band
                </div>
                <div className="text-[15px] font-bold leading-tight text-brand-ink">{o.budgetBand || o.giftBudget}</div>
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
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Recent Corporate Milestones
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {milestones.map((m, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[12px] leading-relaxed text-brand-ink-soft before:mt-1.5 before:size-1 before:shrink-0 before:rounded-full before:bg-brand-pink"
                    >
                      <span className="min-w-0 break-words">{m}</span>
                    </li>
                  ))}
                </ul>
              </PanelCard>
            </BentoCell>
          ) : null}

          {detectedOccasions.length > 0 ? (
            <BentoCell className={wide ? "col-span-6" : "col-span-2"}>
              <PanelCard tone="yellow" className="h-full p-3.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Detected occasions
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {detectedOccasions.map((d, i) => (
                    <li key={`${d.type}-${i}`} className="text-[12px] leading-relaxed text-brand-ink-soft">
                      <span className="font-semibold text-brand-ink">{d.label || d.type}</span>
                      {d.timing === "upcoming" ? " · upcoming" : ""}
                      {d.location ? ` · ${d.location}` : ""}
                      {d.timeframe ? ` · ${d.timeframe}` : ""}
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
                        <span className="mt-0.5 shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-brand-ink-soft">
                          {g.year}
                        </span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-[12.5px] font-semibold text-brand-ink">
                          {g.occasion ?? "Gifting"}
                        </div>
                        <div className="break-words text-[11px] text-brand-ink-soft">{g.items ?? "—"}</div>
                      </div>
                      {g.perPerson ? (
                        <span className="shrink-0 text-[11.5px] font-bold text-brand-ink">{g.perPerson}</span>
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
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  <Lightbulb className="size-3.5 shrink-0" />
                  Intelligence
                </div>
                <p className="break-words text-[12px] italic leading-relaxed text-brand-ink-soft">
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
        <p className="mt-auto border-t border-brand-border/50 pt-3 text-[10px] text-brand-ink-faint">
          {cached ? "Cached overview" : "Enriched"} · {new Date(enrichedAt).toLocaleString("en-IN")}
        </p>
      ) : null}
    </PanelCard>
  );
}
