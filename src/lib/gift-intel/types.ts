export type SourceTier = 1 | 2 | 3 | 4 | 5;

export type GiftIntelSourceId =
  | "linkedin_posts"
  | "instagram_reels"
  | "x_posts"
  | "india_business_news"
  | "india_startup_news"
  | "india_lifestyle_news"
  | "glassdoor"
  | "ambitionbox"
  | "reddit_india"
  | "gifting_roundups";

export type RawGiftIntelPost = {
  url: string;
  text: string;
  title?: string;
  publishedDate?: string;
  imageUrl?: string;
  sourceId: GiftIntelSourceId;
  sourceTier: SourceTier;
  ocrText?: string;
};

export type ExtractedGiftIntel = {
  id: string;
  is_target_gifting_event: boolean;
  confidence_score: number;
  extraction_data?: {
    giving_company: string;
    brand_identified: string;
    specific_product_details?: string;
    product_category: string;
    occasion_or_context?: string;
    timeframe?: string;
    giving_company_city?: string;
  };
  evidence_rationale: string;
  source_id?: GiftIntelSourceId;
  source_tier?: SourceTier;
  source_url?: string;
  source_snippet?: string;
};

export type GiftIntelMergeStatus = "auto_merged" | "pending_confirm" | "no_match";

export type GiftIntelResultRow = ExtractedGiftIntel & {
  mergeStatus: GiftIntelMergeStatus;
  matchedAccountId?: string;
  matchedAccountName?: string;
};

export type GiftIntelSweepResult = {
  results: GiftIntelResultRow[];
  autoMerged: number;
  pendingConfirmations: GiftIntelResultRow[];
  errors: string[];
  stats: {
    queriesRun: number;
    hitsFound: number;
    hitsAfterPreFilter: number;
    hitsExtracted: number;
    byTier: Record<number, number>;
    targetCity?: string;
    targetCities?: string[];
    targetBrands?: string[];
    combinationsRun?: number;
  };
};

export type GiftIntelSweepParams = {
  tenantId: string;
  workspaceId: string;
  targetBrands: string[];
  targetCategory: string;
  enabledSourceTiers?: SourceTier[];
  targetCities?: string[];
};
