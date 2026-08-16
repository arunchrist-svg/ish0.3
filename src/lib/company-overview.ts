export type PastGiftingBrand = {
  year?: string;
  occasion?: string;
  items?: string;
  perPerson?: string;
};

export type DetectedOccasion = {
  type: string;
  label?: string;
  timeframe?: string;
  location?: string;
  sourceUrl?: string;
  /** Upcoming openings pitch before the function. Recent is after-the-fact. */
  timing?: "upcoming" | "recent";
  signalType?: "hiring" | "coming_soon" | "mall_lease" | "press_expansion";
};

export type CompanyOverview = {
  sector?: string;
  decisionMaker?: string;
  employees?: string;
  nextGiftingCalendarCycle?: string;
  corporateMilestones?: string[];
  complianceRequirements?: string;
  pastGiftingBrands?: PastGiftingBrand[];
  detectedOccasions?: DetectedOccasion[];
  /** Preferred field name after white-label rename. */
  budgetBand?: string;
  /** @deprecated Prefer budgetBand. Kept for LLM JSON / cached overviews. */
  giftBudget?: string;
  fitScore?: number;
  intelligenceNotes?: string;
  confidence?: "high" | "medium" | "low";
  source?: string;
};

export type CompanyOverviewInput = {
  name: string;
  city?: string;
  industry?: string;
  domain?: string;
  website?: string;
  employees?: string;
  budgetBand?: string;
  /** @deprecated Prefer budgetBand */
  giftBudget?: string;
  fitScore?: number;
  intelligenceNotes?: string;
  accountId?: string;
  force?: boolean;
  decisionMakerHint?: string;
};

export type CompanyOverviewResult = {
  overview: CompanyOverview;
  cached: boolean;
  enrichedAt?: string;
  domain?: string;
  website?: string;
};

export const OVERVIEW_CACHE_DAYS = 7;

export function emptyOverview(): CompanyOverview {
  return {};
}

export function displayValue(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

export function resolveBudgetBand(o?: Pick<CompanyOverview, "budgetBand" | "giftBudget"> | null): string | undefined {
  return o?.budgetBand?.trim() || o?.giftBudget?.trim() || undefined;
}
