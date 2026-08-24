/**
 * Pack-pluggable scout quality profile.
 * Ranking weights and geo/buyer policy vary by platform intent; waterfall stays generic.
 */
import type { PlatformIntent } from "@/lib/brand/platform-intent";
import { resolvePlatformIntent } from "@/lib/brand/platform-intent";

export type ScoutGeoPolicy = "focus_strict" | "focus_then_corridor" | "region_ok" | "national_ok";

export type ScoutSellerPollution = "hard_block" | "soft_demote" | "separate_modes";

export type ScoutQualityWeights = {
  /** Buyer titles findable near the company (leadability). */
  reachability: number;
  /** Official corporate website / domain quality. */
  officialWebsite: number;
  /** Focus Area / selected city locality strength. */
  locality: number;
  /** Fit to selected employeeBands (not "bigger is better"). */
  scaleFit: number;
  /** Past gifting / vendor intel when present. */
  pastGifting: number;
  /** Soft industry gifting-index boost. */
  industryFit: number;
};

export type ScoutQualityProfile = {
  intent: PlatformIntent;
  weights: ScoutQualityWeights;
  geoPolicy: ScoutGeoPolicy;
  sellerPollution: ScoutSellerPollution;
  broadenPeopleWhenEmpty: boolean;
  preferDmTitles: boolean;
  /**
   * Industries that get a soft boost for this offer (not a hard filter).
   * Empty = no industry soft boost.
   */
  industryBoostTerms: string[];
};

const SWEETS_WEIGHTS: ScoutQualityWeights = {
  reachability: 0.32,
  officialWebsite: 0.22,
  locality: 0.18,
  scaleFit: 0.14,
  pastGifting: 0.08,
  industryFit: 0.06,
};

const APPLIANCES_WEIGHTS: ScoutQualityWeights = {
  reachability: 0.3,
  officialWebsite: 0.2,
  locality: 0.16,
  scaleFit: 0.18,
  pastGifting: 0.06,
  industryFit: 0.1,
};

const GENERAL_WEIGHTS: ScoutQualityWeights = {
  reachability: 0.28,
  officialWebsite: 0.24,
  locality: 0.14,
  scaleFit: 0.16,
  pastGifting: 0.04,
  industryFit: 0.14,
};

const SWEETS_INDUSTRY_BOOST = [
  "it",
  "software",
  "technology",
  "manufacturing",
  "automotive",
  "auto",
  "pharma",
  "pharmaceutical",
  "bfsi",
  "banking",
  "finance",
  "insurance",
  "real estate",
  "retail",
  "fmcg",
];

const APPLIANCES_INDUSTRY_BOOST = [
  "hospitality",
  "hotel",
  "retail",
  "manufacturing",
  "corporate",
  "office",
  "facility",
];

function profileForIntent(intent: PlatformIntent): ScoutQualityProfile {
  switch (intent) {
    case "corporate_gifting":
      return {
        intent,
        weights: SWEETS_WEIGHTS,
        geoPolicy: "region_ok",
        sellerPollution: "separate_modes",
        broadenPeopleWhenEmpty: true,
        preferDmTitles: true,
        industryBoostTerms: SWEETS_INDUSTRY_BOOST,
      };
    case "appliances":
      return {
        intent,
        weights: APPLIANCES_WEIGHTS,
        geoPolicy: "region_ok",
        sellerPollution: "separate_modes",
        broadenPeopleWhenEmpty: true,
        preferDmTitles: true,
        industryBoostTerms: APPLIANCES_INDUSTRY_BOOST,
      };
    case "b2b_saas":
      return {
        intent,
        weights: GENERAL_WEIGHTS,
        geoPolicy: "national_ok",
        sellerPollution: "soft_demote",
        broadenPeopleWhenEmpty: true,
        preferDmTitles: true,
        industryBoostTerms: ["software", "saas", "technology", "fintech", "it"],
      };
    default:
      return {
        intent: "general_b2b",
        weights: GENERAL_WEIGHTS,
        geoPolicy: "national_ok",
        sellerPollution: "soft_demote",
        broadenPeopleWhenEmpty: true,
        preferDmTitles: true,
        industryBoostTerms: [],
      };
  }
}

/** Resolve quality profile from platform intent and/or vertical pack / brand slug. */
export function scoutQualityProfileFor(
  platformIntent?: PlatformIntent | string | null,
  verticalPackOrSlug?: string | null,
): ScoutQualityProfile {
  const intent = resolvePlatformIntent(platformIntent, verticalPackOrSlug);
  return profileForIntent(intent);
}
