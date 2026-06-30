"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Radar,
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Building2,
  Gift,
  Calendar,
  Sparkles,
  Newspaper,
  MessageSquare,
  Filter,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileHeader, MobilePageLayout, PanelCard, SearchBar, text } from "@/design-system";
import { toast } from "sonner";
import {
  confirmGiftIntelMerge,
  fetchGiftIntelConfig,
  runGiftIntelSweep,
  type GiftIntelConfigView,
  type GiftIntelResultRow,
  type GiftIntelSweepResult,
} from "@/lib/api-client";
import type { SourceTier } from "@/lib/gift-intel/types";
import { SCOUT_CITY_GROUPS, type ScoutCity } from "@/lib/scouting-data";

const TIER_OPTIONS: {
  tier: SourceTier;
  label: string;
  short: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    tier: 1,
    label: "T1 Social",
    short: "Social",
    description: "LinkedIn, Instagram, X",
    icon: MessageSquare,
  },
  {
    tier: 2,
    label: "T2 News",
    short: "News",
    description: "ET, Express, Moneycontrol",
    icon: Newspaper,
  },
  {
    tier: 3,
    label: "T3 Workplace",
    short: "Workplace",
    description: "Glassdoor, AmbitionBox",
    icon: Building2,
  },
  {
    tier: 4,
    label: "T4 Reddit",
    short: "Reddit",
    description: "r/india, r/developersIndia",
    icon: MessageSquare,
  },
  {
    tier: 5,
    label: "T5 Roundups",
    short: "Roundups",
    description: "Gifting trend articles",
    icon: Sparkles,
  },
];

function tierMeta(tier?: number) {
  return TIER_OPTIONS.find((t) => t.tier === tier);
}

function statusMeta(row: GiftIntelResultRow) {
  if (row.mergeStatus === "auto_merged") {
    return { label: "Auto-merged", className: "border-emerald-200/80 bg-emerald-50/90 text-emerald-800" };
  }
  if (row.mergeStatus === "pending_confirm") {
    return { label: "Needs confirm", className: "border-amber-200/80 bg-amber-50/90 text-amber-800" };
  }
  return { label: "No match", className: "border-ish-border/60 bg-white/60 text-ish-ink-soft" };
}

export function BrandIntelligenceDashboard() {
  const [giftIntelConfig, setGiftIntelConfig] = useState<GiftIntelConfigView | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<ScoutCity[]>([]);
  const [enabledTiers, setEnabledTiers] = useState<SourceTier[]>([1, 2]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [extractedIntelligence, setExtractedIntelligence] = useState<GiftIntelResultRow[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<GiftIntelResultRow[]>([]);
  const [stats, setStats] = useState<GiftIntelSweepResult["stats"] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    fetchGiftIntelConfig()
      .then((cfg) => {
        if (cancelled) return;
        setGiftIntelConfig(cfg);
        setSelectedCompetitors((prev) => (prev.length ? prev : cfg.competitorBrands.slice(0, 1)));
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load Brand Intelligence settings");
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return extractedIntelligence;
    return extractedIntelligence.filter((row) => {
      const company = row.extraction_data?.giving_company?.toLowerCase() ?? "";
      const product = row.extraction_data?.specific_product_details?.toLowerCase() ?? "";
      const occasion = row.extraction_data?.occasion_or_context?.toLowerCase() ?? "";
      const city = row.extraction_data?.giving_company_city?.toLowerCase() ?? "";
      const brand = row.extraction_data?.brand_identified?.toLowerCase() ?? "";
      return company.includes(q) || product.includes(q) || occasion.includes(q) || city.includes(q) || brand.includes(q);
    });
  }, [extractedIntelligence, filter]);

  function toggleTier(tier: SourceTier) {
    setEnabledTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier].sort(),
    );
  }

  function toggleCompetitor(brand: string) {
    setSelectedCompetitors((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  }

  function toggleCity(city: ScoutCity) {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  }

  function selectAllCompetitors() {
    setSelectedCompetitors(giftIntelConfig?.competitorBrands ?? []);
  }

  function clearCompetitors() {
    setSelectedCompetitors([]);
  }

  function clearCities() {
    setSelectedCities([]);
  }

  async function handleSweep() {
    if (!selectedCompetitors.length) {
      toast.error("Select at least one competitor brand");
      return;
    }

    setIsExtracting(true);
    setErrorLogs([]);
    try {
      const result = await runGiftIntelSweep({
        competitorBrands: selectedCompetitors,
        cities: selectedCities.length ? selectedCities : undefined,
        enabledSourceTiers: enabledTiers.length ? enabledTiers : [1, 2],
      });
      setExtractedIntelligence(result.results);
      setPendingConfirmations(result.pendingConfirmations);
      setStats(result.stats);
      if (result.errors.length) setErrorLogs(result.errors);
      toast.success(
        `Sweep complete: ${result.results.length} hits, ${result.autoMerged} auto-merged`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Intelligence sweep failed";
      setErrorLogs([msg]);
      toast.error(msg);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleConfirm(row: GiftIntelResultRow, accountId: string) {
    try {
      await confirmGiftIntelMerge({ accountId, extraction: row });
      setExtractedIntelligence((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, mergeStatus: "auto_merged", matchedAccountId: accountId }
            : r,
        ),
      );
      setPendingConfirmations((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Account updated with gifting intel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update account");
    }
  }

  return (
    <MobilePageLayout
      title="Gift Tracker"
      subtitle="Corporate gifting intelligence"
      largeTitle
      className="ish-board-page"
      contentClassName="flex flex-col !overflow-hidden"
    >
      <SearchBar value={filter} onChange={setFilter} placeholder="Search" sticky className="lg:hidden" />
      <header className="ish-board-hero relative hidden shrink-0 overflow-hidden border-b border-ish-border/60 px-6 py-5 lg:block">
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]">
              <Radar className="size-5 text-ish-ink" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className={cn(text.metaLabel, "mb-0.5 uppercase tracking-[0.14em]")}>Brand Intelligence</p>
              <h1 className="text-[20px] font-extrabold tracking-tight text-ish-ink">Corporate Gift Tracker</h1>
              <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-ish-ink-soft">
                Discover which companies distributed your target brand as employee gifts across social,
                news, and workplace sources.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex flex-wrap gap-2">
              {stats.combinationsRun != null && stats.combinationsRun > 1 && (
                <StatPill label="Combinations" value={stats.combinationsRun} />
              )}
              <StatPill label="Queries" value={stats.queriesRun} />
              <StatPill label="Posts" value={stats.hitsAfterPreFilter} />
              <StatPill label="Verified" value={stats.hitsExtracted} accent />
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
          <PanelCard
            tone="white"
            className="relative overflow-hidden border border-ish-border/50 bg-white/80 p-0 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm"
          >
            <div className="settings-hero-stripe h-[3px] w-full rounded-none" aria-hidden />
            <div className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Gift className="size-4 text-ish-stratus-blue" />
                <h2 className={text.cardTitle}>Sweep parameters</h2>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
                <div className="flex flex-col gap-1.5">
                  <span className={text.label}>Product category</span>
                  <div className="flex h-[42px] items-center rounded-2xl border border-ish-border/60 bg-ish-yellow-soft/60 px-3.5 text-[13px] font-semibold text-ish-ink">
                    {configLoading ? "Loading…" : giftIntelConfig?.productCategory ?? "Sweets"}
                  </div>
                  <span className="text-[10.5px] text-ish-ink-faint">Set in Settings → Enrichment</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={text.label}>Competitor brands</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={selectAllCompetitors} className="text-[10.5px] font-semibold text-ish-stratus-blue hover:underline">All</button>
                      <button type="button" onClick={clearCompetitors} className="text-[10.5px] font-semibold text-ish-ink-soft hover:underline">Clear</button>
                      <Link href="/settings?tab=enrichment" className="text-[10.5px] font-semibold text-ish-stratus-blue hover:underline">Settings</Link>
                    </div>
                  </div>
                  {configLoading ? (
                    <div className="text-[12px] text-ish-ink-soft">Loading competitors…</div>
                  ) : !giftIntelConfig?.competitorBrands.length ? (
                    <div className="rounded-2xl border border-dashed border-ish-border/70 bg-white/50 px-3 py-4 text-[12px] text-ish-ink-soft">
                      No competitors configured.{" "}
                      <Link href="/settings?tab=enrichment" className="font-semibold text-ish-stratus-blue hover:underline">
                        Add brands in Settings → Enrichment
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {giftIntelConfig.competitorBrands.map((brand) => {
                        const active = selectedCompetitors.includes(brand);
                        return (
                          <button
                            key={brand}
                            type="button"
                            onClick={() => toggleCompetitor(brand)}
                            className={cn(
                              "rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-all",
                              active
                                ? "border-[rgba(var(--ish-stratus-blue-rgb),0.4)] bg-[rgba(var(--ish-stratus-blue-rgb),0.12)] text-ish-ink shadow-[var(--shadow-ish-sm)]"
                                : "border-ish-border/60 bg-white/70 text-ish-ink-soft hover:border-ish-border hover:text-ish-ink",
                            )}
                          >
                            {brand}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-[10.5px] text-ish-ink-faint">Select one or more competitors per sweep</span>
                </div>
              </div>


              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="size-4 text-ish-stratus-blue" />
                  <span className={text.label}>Gifting company city</span>
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10.5px] text-ish-ink-faint">
                    Optional. Leave empty for all cities, or select one or more.
                  </p>
                  <button type="button" onClick={clearCities} className="text-[10.5px] font-semibold text-ish-ink-soft hover:underline">Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SCOUT_CITY_GROUPS.flatMap((g) => g.cities).map((city) => {
                    const active = selectedCities.includes(city);
                    return (
                      <button
                        key={city}
                        type="button"
                        onClick={() => toggleCity(city)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                          active
                            ? "border-[rgba(var(--ish-stratus-blue-rgb),0.4)] bg-[rgba(var(--ish-stratus-blue-rgb),0.12)] text-ish-ink"
                            : "border-ish-border/60 bg-white/70 text-ish-ink-soft hover:text-ish-ink",
                        )}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <p className={cn(text.label, "mb-2.5")}>Source tiers</p>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map(({ tier, label, description, icon: Icon }) => {
                    const active = enabledTiers.includes(tier);
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => toggleTier(tier)}
                        className={cn(
                          "group flex min-w-[120px] sm:min-w-[148px] flex-col rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-200",
                          active
                            ? "border-[rgba(var(--ish-stratus-blue-rgb),0.35)] bg-[rgba(var(--ish-stratus-blue-rgb),0.08)] shadow-[var(--shadow-ish-sm)]"
                            : "border-ish-border/60 bg-white/50 hover:border-ish-border hover:bg-white/80",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-xl transition-colors",
                              active ? "bg-ish-yellow text-ish-ink" : "bg-ish-border/40 text-ish-ink-soft",
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span className={cn("text-[12px] font-bold", active ? "text-ish-ink" : "text-ish-ink-soft")}>
                            {label}
                          </span>
                        </span>
                        <span className="mt-1 pl-9 text-[10.5px] leading-snug text-ish-ink-faint">{description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ish-border/40 pt-5">
                <button
                  type="button"
                  onClick={handleSweep}
                  disabled={isExtracting}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-bold text-ish-ink shadow-[var(--shadow-ish-yellow-sm)] transition-all",
                    "bg-ish-yellow-gradient hover:brightness-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {isExtracting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Run Intelligence Sweep
                </button>
                <span className={text.caption}>
                  {enabledTiers.length} tier{enabledTiers.length === 1 ? "" : "s"} selected
                </span>
              </div>
            </div>
          </PanelCard>

          {errorLogs.length > 0 && (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[12.5px] text-amber-900">
              {errorLogs.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}

          <PanelCard
            tone="white"
            className="overflow-hidden border border-ish-border/50 bg-white/75 p-0 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ish-border/50 px-5 py-4">
              <div>
                <h2 className={text.cardTitle}>Extracted intelligence</h2>
                <p className={text.caption}>Verified corporate gifting events from public sources</p>
              </div>
              <div className="relative w-full max-w-[280px]">
                <Filter className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter company, product, occasion"
                  className="w-full rounded-full border border-ish-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-ish-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--ish-stratus-blue-rgb),0.45)] focus:bg-white"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState isExtracting={isExtracting} hasSweep={extractedIntelligence.length > 0 && !!filter} />
            ) : (
              <div className="overflow-x-auto -mx-1 px-1 lg:mx-0 lg:px-0">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-ish-border/40 bg-ish-border/15 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ish-ink-faint">
                      <th className="px-5 py-3">Giving company</th>
                      <th className="px-5 py-3">City</th>
                      <th className="px-5 py-3">Brand</th>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Occasion</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Source</th>
                      <th className="px-5 py-3">Confidence</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const tier = tierMeta(row.source_tier);
                      const status = statusMeta(row);
                      const confidence = Math.round((row.confidence_score ?? 0) * 100);
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-ish-border/30 transition-colors last:border-0 hover:bg-[rgba(var(--ish-stratus-blue-rgb),0.04)]"
                        >
                          <td className="px-5 py-4">
                            <div className="text-[13px] font-bold text-ish-ink">
                              {row.extraction_data?.giving_company ?? "—"}
                            </div>
                            {row.matchedAccountName && (
                              <div className="mt-0.5 text-[10.5px] text-ish-ink-faint">
                                Matched: {row.matchedAccountName}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-[12.5px] text-ish-ink-soft">
                            {row.extraction_data?.giving_company_city ?? "—"}
                          </td>
                          <td className="px-5 py-4 text-[12.5px] text-ish-ink-soft">
                            {row.extraction_data?.brand_identified ?? "—"}
                          </td>
                          <td className="px-5 py-4 text-[12.5px] text-ish-ink-soft">
                            {row.extraction_data?.specific_product_details ??
                              row.extraction_data?.brand_identified ??
                              "—"}
                          </td>
                          <td className="px-5 py-4 text-[12.5px] text-ish-ink-soft">
                            {row.extraction_data?.occasion_or_context ?? "—"}
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-ish-ink-soft">
                              <Calendar className="size-3 text-ish-ink-faint" />
                              {row.extraction_data?.timeframe ?? "—"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1 rounded-full border border-ish-border/60 bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-ish-ink-soft">
                              {tier?.short ?? "—"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <ConfidenceBar value={confidence} />
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold",
                                status.className,
                              )}
                            >
                              {row.mergeStatus === "auto_merged" ? (
                                <CheckCircle2 className="size-3" />
                              ) : row.mergeStatus === "pending_confirm" ? (
                                <AlertCircle className="size-3" />
                              ) : null}
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex max-w-[200px] flex-col gap-2">
                              {row.source_url && (
                                <a
                                  href={row.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-ish-stratus-blue hover:underline"
                                >
                                  View source <ExternalLink className="size-3" />
                                </a>
                              )}
                              {row.matchedAccountId && (
                                <Link href="/directory" className="text-[11px] text-ish-ink-soft hover:underline">
                                  Open account
                                </Link>
                              )}
                              {row.mergeStatus === "pending_confirm" && row.matchedAccountId && (
                                <button
                                  type="button"
                                  onClick={() => handleConfirm(row, row.matchedAccountId!)}
                                  className="text-left text-[11px] font-bold text-ish-ink hover:underline"
                                >
                                  Confirm & update
                                </button>
                              )}
                              {row.evidence_rationale && (
                                <p className="text-[10.5px] leading-relaxed text-ish-ink-faint line-clamp-3">
                                  {row.evidence_rationale}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pendingConfirmations.length > 0 && (
              <div className="border-t border-ish-border/40 bg-amber-50/50 px-5 py-3 text-[11.5px] text-amber-900">
                {pendingConfirmations.length} result(s) need manual confirmation before updating accounts.
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </MobilePageLayout>
  );
}


function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1.5 text-[11px] font-semibold tabular-nums",
        accent
          ? "border-[rgba(var(--ish-stratus-blue-rgb),0.35)] bg-[rgba(var(--ish-stratus-blue-rgb),0.1)] text-ish-ink"
          : "border-ish-border/60 bg-white/70 text-ish-ink-soft",
      )}
    >
      {label}
      <span className="ml-1.5 font-extrabold text-ish-ink">{value}</span>
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex min-w-[88px] flex-col gap-1">
      <span className="text-[11px] font-bold tabular-nums text-ish-ink">{value}%</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-ish-border/50">
        <div
          className="h-full rounded-full bg-ish-yellow-gradient transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({ isExtracting, hasSweep }: { isExtracting: boolean; hasSweep: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-[20px] bg-ish-yellow-soft">
        {isExtracting ? (
          <Loader2 className="size-6 animate-spin text-ish-ink-soft" />
        ) : (
          <Radar className="size-6 text-ish-ink-soft" />
        )}
      </div>
      <div className="text-[15px] font-bold text-ish-ink">
        {isExtracting
          ? "Running intelligence sweep…"
          : hasSweep
            ? "No matches for this filter"
            : "Ready to discover corporate buyers"}
      </div>
      <p className="max-w-md text-[12.5px] leading-relaxed text-ish-ink-soft">
        {isExtracting
          ? "Parsing social posts, news articles, and workplace signals for employer gifting evidence."
          : hasSweep
            ? "Try a different filter term or broaden your source tiers."
            : "Enter a target brand and category, then run a sweep to map which companies gifted that brand to employees."}
      </p>
    </div>
  );
}
