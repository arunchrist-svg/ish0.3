import { z } from "zod";
import { parseJsonArrayFromLLM } from "@/lib/llm/parse-json";

const extractionDataSchema = z.object({
  giving_company: z.string().optional(),
  givingCompany: z.string().optional(),
  brand_identified: z.string().optional(),
  brandIdentified: z.string().optional(),
  specific_product_details: z.string().optional(),
  specificProductDetails: z.string().optional(),
  product_category: z.string().optional(),
  productCategory: z.string().optional(),
  occasion_or_context: z.string().optional(),
  occasionOrContext: z.string().optional(),
  timeframe: z.string().optional(),
  giving_company_city: z.string().optional(),
  givingCompanyCity: z.string().optional(),
});

export const giftIntelExtractionSchema = z.object({
  is_target_gifting_event: z.boolean().optional(),
  isTargetGiftingEvent: z.boolean().optional(),
  confidence_score: z.number().optional(),
  confidenceScore: z.number().optional(),
  extraction_data: extractionDataSchema.optional(),
  extractionData: extractionDataSchema.optional(),
  evidence_rationale: z.string().optional(),
  evidenceRationale: z.string().optional(),
});

export type GiftIntelExtractionRow = z.infer<typeof giftIntelExtractionSchema>;

export function parseGiftIntelExtractions(raw: string): GiftIntelExtractionRow[] {
  const rows = parseJsonArrayFromLLM(raw);
  return rows
    .map((row) => giftIntelExtractionSchema.safeParse(row))
    .filter((result) => result.success)
    .map((result) => result.data);
}
