export type PastGiftingBrand = {
  year?: string;
  occasion?: string;
  items?: string;
  perPerson?: string;
};

export type CompanyOverview = {
  sector?: string;
  decisionMaker?: string;
  employees?: string;
  nextGiftingCalendarCycle?: string;
  corporateMilestones?: string[];
  complianceRequirements?: string;
  pastGiftingBrands?: PastGiftingBrand[];
  giftBudget?: string;
  giftScore?: number;
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
  giftBudget?: string;
  giftScore?: number;
  intelligenceNotes?: string;
  accountId?: string;
  force?: boolean;
  decisionMakerHint?: string;
};

export type CompanyOverviewResult = {
  overview: CompanyOverview;
  cached: boolean;
  enrichedAt?: string;
};

export const OVERVIEW_CACHE_DAYS = 7;

export function emptyOverview(): CompanyOverview {
  return {};
}

export function displayValue(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}
