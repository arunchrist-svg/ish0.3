import {
  companyMatchesScoutSelection,
  mentionsSelectedLocality,
  selectionLooksLikeNeighborhoods,
} from "@/lib/enrichment/city-search";
import { isAcceptableCompanyDomain } from "@/lib/enrichment/company-domain-quality";
import { employeeMatchesBands } from "@/lib/enrichment/employee-size";
import type { ScoutGeoPolicy, ScoutQualityProfile, ScoutQualityWeights } from "@/lib/enrichment/quality-profile";
import { looksLikeLookalikeSeller } from "@/lib/enrichment/seller-pollution";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

export type AccountScoreBreakdown = {
  reachability: number;
  officialWebsite: number;
  locality: number;
  scaleFit: number;
  pastGifting: number;
  industryFit: number;
  total: number;
};

export type AccountScoreInput = {
  profile: ScoutQualityProfile;
  selectedCities: string[];
  employeeBands?: string[];
  selectedIndustries?: string[];
  locationScope?: "focus" | "interest";
  searchKind?: "industry" | "business";
  geoPolicy?: ScoutGeoPolicy;
  weightDeltas?: Partial<ScoutQualityWeights> | null;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function companyHaystack(company: ScoutCompanyResult): string {
  return `${company.city ?? ""} ${company.intelNotes ?? ""} ${company.industry ?? ""}`.toLowerCase();
}

function reachabilitySignal(company: ScoutCompanyResult): number {
  const band = company.leadabilityBand;
  if (band === "high") return 1;
  if (band === "medium") return 0.65;
  if (band === "low") return 0.25;
  const score = company.leadabilityScore ?? 0;
  if (score >= 80) return 1;
  if (score >= 45) return 0.65;
  if (score > 0) return 0.25;
  return 0;
}

function officialWebsiteSignal(company: ScoutCompanyResult): number {
  const domain = company.domain?.trim();
  if (domain && isAcceptableCompanyDomain(domain, company.name)) return 1;
  const website = company.website?.trim();
  if (website && isAcceptableCompanyDomain(website, company.name)) return 0.9;
  return 0;
}

function localitySignal(
  company: ScoutCompanyResult,
  selectedCities: string[],
  locationScope?: "focus" | "interest",
  searchKind?: "industry" | "business",
  geoPolicy?: ScoutGeoPolicy,
): number {
  if (!selectedCities.length) return 0.5;
  if (company.scoutGeoVerified) return 1;

  const hay = companyHaystack(company);
  const unmatchedFloor = geoPolicy === "focus_strict" ? 0 : geoPolicy === "national_ok" ? 0.45 : 0.2;

  if (selectionLooksLikeNeighborhoods(selectedCities)) {
    if (mentionsSelectedLocality(hay, selectedCities)) return 1;
    if (
      companyMatchesScoutSelection(company, selectedCities, {
        searchKind,
        geoVerified: company.scoutGeoVerified,
      })
    ) {
      return 0.7;
    }
    return geoPolicy === "focus_strict" ? 0.05 : locationScope === "focus" ? 0.25 : 0.4;
  }

  if (companyMatchesScoutSelection(company, selectedCities, { searchKind })) return 1;
  if (company.city?.trim()) return geoPolicy === "national_ok" ? 0.55 : 0.35;
  return unmatchedFloor;
}

function scaleFitSignal(company: ScoutCompanyResult, employeeBands?: string[]): number {
  if (!employeeBands?.length) return 0.5;
  const match = employeeMatchesBands(company.employees, employeeBands);
  if (match === true) return 1;
  if (match === "unknown") return 0.45;
  return 0;
}

function pastGiftingSignal(company: ScoutCompanyResult): number {
  const past = company.pastGifting;
  if (Array.isArray(past) && past.length > 0) return 1;
  const overview = company.companyOverview;
  if (overview?.pastGiftingBrands?.length) return 1;
  if (overview?.detectedOccasions?.length) return 0.6;
  if (company.budgetBand?.trim()) return 0.4;
  return 0;
}

function industryFitSignal(
  company: ScoutCompanyResult,
  profile: ScoutQualityProfile,
  selectedIndustries?: string[],
): number {
  const hay = companyHaystack(company);
  if (selectedIndustries?.length) {
    const hit = selectedIndustries.some((ind) => {
      const token = ind.trim().toLowerCase();
      return token.length >= 3 && hay.includes(token);
    });
    if (hit) return 1;
  }
  if (!profile.industryBoostTerms.length) return 0.4;
  const boost = profile.industryBoostTerms.some((term) => hay.includes(term));
  return boost ? 0.85 : 0.35;
}

function applyWeightDeltas(
  weights: ScoutQualityWeights,
  deltas?: Partial<ScoutQualityWeights> | null,
): ScoutQualityWeights {
  if (!deltas) return weights;
  const next = { ...weights };
  (Object.keys(weights) as (keyof ScoutQualityWeights)[]).forEach((key) => {
    const d = deltas[key];
    if (typeof d === "number" && Number.isFinite(d)) {
      const clamped = Math.max(-0.1, Math.min(0.1, d));
      next[key] = Math.max(0.02, weights[key] * (1 + clamped));
    }
  });
  const sum = Object.values(next).reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights;
  (Object.keys(next) as (keyof ScoutQualityWeights)[]).forEach((key) => {
    next[key] = next[key] / sum;
  });
  return next;
}

const SIGNAL_LABELS: Record<keyof Omit<AccountScoreBreakdown, "total">, string> = {
  reachability: "Reachable",
  officialWebsite: "official site",
  locality: "local",
  scaleFit: "scale fit",
  pastGifting: "past gifting",
  industryFit: "industry",
};

export function accountScoreReason(breakdown: AccountScoreBreakdown, extras: string[] = []): string {
  const ranked = (Object.keys(SIGNAL_LABELS) as (keyof typeof SIGNAL_LABELS)[])
    .map((key) => ({ key, value: breakdown[key] }))
    .filter((row) => row.value >= 0.6)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((row) => SIGNAL_LABELS[row.key]);
  const parts = [...ranked, ...extras].slice(0, 3);
  if (!parts.length) return "Best available match";
  return parts.join(" · ");
}

export function computeAccountScore(
  company: ScoutCompanyResult,
  input: AccountScoreInput,
): AccountScoreBreakdown {
  const { profile, selectedCities, employeeBands, selectedIndustries, locationScope, searchKind } =
    input;
  const w = applyWeightDeltas(profile.weights, input.weightDeltas);

  const reachability = reachabilitySignal(company);
  const officialWebsite = officialWebsiteSignal(company);
  const locality = localitySignal(
    company,
    selectedCities,
    locationScope,
    searchKind,
    input.geoPolicy ?? profile.geoPolicy,
  );
  const scaleFit = scaleFitSignal(company, employeeBands);
  const pastGifting = pastGiftingSignal(company);
  const industryFit = industryFitSignal(company, profile, selectedIndustries);

  let total =
    100 *
    clamp01(
      w.reachability * reachability +
        w.officialWebsite * officialWebsite +
        w.locality * locality +
        w.scaleFit * scaleFit +
        w.pastGifting * pastGifting +
        w.industryFit * industryFit,
    );

  if (
    profile.sellerPollution === "soft_demote" &&
    looksLikeLookalikeSeller(company, profile.intent)
  ) {
    total *= 0.55;
  }

  return {
    reachability,
    officialWebsite,
    locality,
    scaleFit,
    pastGifting,
    industryFit,
    total: Math.round(total * 10) / 10,
  };
}

/** Sort companies by AccountScore; provider fitScore is a weak tie-break only. */
export function sortCompaniesByAccountScore(
  companies: ScoutCompanyResult[],
  input: AccountScoreInput,
): ScoutCompanyResult[] {
  const scored = companies.map((company) => {
    const breakdown = computeAccountScore(company, input);
    const extras =
      input.profile.sellerPollution === "soft_demote" &&
      looksLikeLookalikeSeller(company, input.profile.intent)
        ? ["seller demoted"]
        : [];
    return {
      company,
      score: breakdown.total,
      reason: accountScoreReason(breakdown, extras),
    };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLead = a.company.leadabilityScore ?? 0;
    const bLead = b.company.leadabilityScore ?? 0;
    if (bLead !== aLead) return bLead - aLead;
    return (b.company.fitScore ?? 0) - (a.company.fitScore ?? 0);
  });
  return scored.map(({ company, score, reason }) => ({
    ...company,
    fitScore: Math.max(company.fitScore ?? 0, Math.round(score)),
    fitScoreReason: reason,
  }));
}

export function isGoldAccount(company: ScoutCompanyResult): boolean {
  if (company.leadabilityBand === "high" || company.leadabilityBand === "medium") return true;
  return (company.fitScore ?? 0) >= 55;
}

/** Drop a low-score tail once five consecutive non-gold accounts appear. */
export function applyGoldDensityEarlyStop(
  ranked: ScoutCompanyResult[],
  opts: { limit: number; windowSize?: number; enabled?: boolean },
): { companies: ScoutCompanyResult[]; earlyStop: boolean } {
  const limit = Math.max(1, opts.limit);
  if (!opts.enabled) return { companies: ranked.slice(0, limit), earlyStop: false };
  const windowSize = opts.windowSize ?? 5;
  if (ranked.length <= windowSize) return { companies: ranked.slice(0, limit), earlyStop: false };

  for (let i = 0; i <= Math.min(ranked.length, limit) - windowSize; i++) {
    const window = ranked.slice(i, i + windowSize);
    if (window.every((company) => !isGoldAccount(company))) {
      const cut = Math.max(3, i);
      return { companies: ranked.slice(0, Math.min(cut, limit)), earlyStop: true };
    }
  }
  return { companies: ranked.slice(0, limit), earlyStop: false };
}
