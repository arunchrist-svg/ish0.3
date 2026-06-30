import { randomUUID } from "crypto";
import { callLLM } from "@/lib/llm";
import { parseGiftIntelExtractions } from "@/lib/agents/schemas/gift-intel-output";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { discoverGiftIntelPosts } from "@/lib/enrichment/gift-intel-search";
import { enrichPostsWithOcr } from "@/lib/enrichment/post-image-ocr";
import { buildGiftIntelSystemPrompt, buildGiftIntelUserPrompt } from "./gift-intel-prompt";
import { classifyAndMergeExtractions } from "@/lib/gift-intel/merge-accounts";
import { matchesTargetCity } from "@/lib/gift-intel/city-match";
import type {
  ExtractedGiftIntel,
  GiftIntelResultRow,
  GiftIntelSweepParams,
  GiftIntelSweepResult,
} from "@/lib/gift-intel/types";

const BATCH_SIZE = 5;

function parseExtractionRow(
  raw: Record<string, unknown>,
  post: { url: string; text: string; sourceId: string; sourceTier: number },
  index: number,
): ExtractedGiftIntel {
  const extraction = (raw.extraction_data ?? raw.extractionData) as Record<string, unknown> | undefined;
  const confidence = Number(raw.confidence_score ?? raw.confidenceScore ?? 0);

  return {
    id: randomUUID(),
    is_target_gifting_event: Boolean(raw.is_target_gifting_event ?? raw.isTargetGiftingEvent),
    confidence_score: Number.isFinite(confidence) ? confidence : 0,
    extraction_data: extraction
      ? {
          giving_company: String(extraction.giving_company ?? extraction.givingCompany ?? ""),
          brand_identified: String(extraction.brand_identified ?? extraction.brandIdentified ?? ""),
          specific_product_details:
            extraction.specific_product_details != null
              ? String(extraction.specific_product_details)
              : extraction.specificProductDetails != null
                ? String(extraction.specificProductDetails)
                : undefined,
          product_category: String(extraction.product_category ?? extraction.productCategory ?? ""),
          occasion_or_context:
            extraction.occasion_or_context != null
              ? String(extraction.occasion_or_context)
              : extraction.occasionOrContext != null
                ? String(extraction.occasionOrContext)
                : undefined,
          timeframe:
            extraction.timeframe != null ? String(extraction.timeframe) : undefined,
          giving_company_city:
            extraction.giving_company_city != null
              ? String(extraction.giving_company_city)
              : extraction.givingCompanyCity != null
                ? String(extraction.givingCompanyCity)
                : undefined,
        }
      : undefined,
    evidence_rationale: String(raw.evidence_rationale ?? raw.evidenceRationale ?? ""),
    source_id: post.sourceId as ExtractedGiftIntel["source_id"],
    source_tier: post.sourceTier as ExtractedGiftIntel["source_tier"],
    source_url: post.url,
    source_snippet: post.text.slice(0, 280),
  };
}

async function extractBatch(
  targetBrand: string,
  targetCategory: string,
  targetCity: string | undefined,
  posts: {
    url: string;
    text: string;
    ocrText?: string;
    sourceId: string;
    sourceTier: number;
  }[],
  startIndex: number,
): Promise<ExtractedGiftIntel[]> {
  const system = buildGiftIntelSystemPrompt(targetBrand, targetCategory, targetCity);
  const prompt = buildGiftIntelUserPrompt(
    posts.map((p, i) => ({
      index: startIndex + i,
      url: p.url,
      text: p.text,
      ocrText: p.ocrText,
      sourceId: p.sourceId,
    })),
    targetCity,
  );

  const raw = await callLLM({ tier: "quality", system, prompt, maxTokens: 2048 });
  const parsed = parseGiftIntelExtractions(raw);

  return parsed.map((row, i) =>
    parseExtractionRow(row as Record<string, unknown>, posts[i] ?? posts[0], startIndex + i),
  );
}

function dedupeResultRows(rows: GiftIntelResultRow[]): GiftIntelResultRow[] {
  const seen = new Set<string>();
  const out: GiftIntelResultRow[] = [];
  for (const row of rows) {
    const key = [
      row.source_url ?? "",
      row.extraction_data?.giving_company ?? "",
      row.extraction_data?.brand_identified ?? "",
      row.extraction_data?.giving_company_city ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

type SingleSweepResult = {
  rows: GiftIntelResultRow[];
  autoMerged: number;
  pendingConfirmations: GiftIntelResultRow[];
  errors: string[];
  stats: GiftIntelSweepResult["stats"];
};

async function runSingleGiftIntelSweep(params: {
  tenantId: string;
  workspaceId: string;
  targetBrand: string;
  targetCategory: string;
  enabledSourceTiers?: GiftIntelSweepParams["enabledSourceTiers"];
  targetCity?: string;
}): Promise<SingleSweepResult> {
  const { tenantId, workspaceId, targetBrand, targetCategory, enabledSourceTiers, targetCity } = params;

  const discovery = await discoverGiftIntelPosts({
    targetBrand: targetBrand.trim(),
    targetCategory: targetCategory.trim(),
    enabledSourceTiers,
    targetCity: targetCity?.trim() || undefined,
  });

  const errors = [...discovery.errors];
  let posts = discovery.posts;

  try {
    posts = await enrichPostsWithOcr(posts);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  const extractions: ExtractedGiftIntel[] = [];

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await extractBatch(
        targetBrand.trim(),
        targetCategory.trim(),
        targetCity?.trim() || undefined,
        batch.map((p) => ({
          url: p.url,
          text: p.text,
          ocrText: p.ocrText,
          sourceId: p.sourceId,
          sourceTier: p.sourceTier,
        })),
        i,
      );
      extractions.push(...batchResults);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const positive = extractions.filter((e) => {
    if (!e.is_target_gifting_event) return false;
    if (!targetCity?.trim()) return true;
    const post = posts.find((p) => p.url === e.source_url);
    return matchesTargetCity({
      targetCity: targetCity.trim(),
      extractedCity: e.extraction_data?.giving_company_city,
      postText: post?.text ?? e.source_snippet,
    });
  });

  const { rows, autoMerged, pendingConfirmations } = await classifyAndMergeExtractions({
    tenantId,
    workspaceId,
    extractions: positive,
    targetCity: targetCity?.trim() || undefined,
  });

  return {
    rows,
    autoMerged,
    pendingConfirmations,
    errors,
    stats: {
      queriesRun: discovery.queriesRun,
      hitsFound: discovery.hitsFound,
      hitsAfterPreFilter: posts.length,
      hitsExtracted: positive.length,
      byTier: discovery.byTier,
      targetCity: targetCity?.trim() || undefined,
    },
  };
}

function mergeStats(
  acc: GiftIntelSweepResult["stats"],
  next: GiftIntelSweepResult["stats"],
): GiftIntelSweepResult["stats"] {
  const byTier = { ...acc.byTier };
  for (const [tier, count] of Object.entries(next.byTier)) {
    const t = Number(tier);
    byTier[t] = (byTier[t] ?? 0) + count;
  }
  return {
    queriesRun: acc.queriesRun + next.queriesRun,
    hitsFound: acc.hitsFound + next.hitsFound,
    hitsAfterPreFilter: acc.hitsAfterPreFilter + next.hitsAfterPreFilter,
    hitsExtracted: acc.hitsExtracted + next.hitsExtracted,
    byTier,
    targetCity: acc.targetCity,
    targetCities: acc.targetCities,
    targetBrands: acc.targetBrands,
    combinationsRun: acc.combinationsRun,
  };
}

export async function runGiftIntelSweep(params: GiftIntelSweepParams): Promise<GiftIntelSweepResult> {
  const { tenantId, workspaceId, targetBrands, targetCategory, enabledSourceTiers, targetCities } =
    params;

  const brands = [...new Set(targetBrands.map((b) => b.trim()).filter(Boolean))];
  const cities = [...new Set((targetCities ?? []).map((c) => c.trim()).filter(Boolean))];

  if (!brands.length || !targetCategory.trim()) {
    throw new Error("Select at least one competitor brand");
  }

  const citySlots: (string | undefined)[] = cities.length ? cities : [undefined];
  const combinationsRun = brands.length * citySlots.length;

  await assertCredits(tenantId, "gift-intel.sweep", combinationsRun);

  const allErrors: string[] = [];
  let allRows: GiftIntelResultRow[] = [];
  let autoMerged = 0;
  let pendingConfirmations: GiftIntelResultRow[] = [];

  let stats: GiftIntelSweepResult["stats"] = {
    queriesRun: 0,
    hitsFound: 0,
    hitsAfterPreFilter: 0,
    hitsExtracted: 0,
    byTier: {},
    targetCities: cities.length ? cities : undefined,
    targetBrands: brands,
    combinationsRun,
  };

  for (const brand of brands) {
    for (const city of citySlots) {
      try {
        const result = await runSingleGiftIntelSweep({
          tenantId,
          workspaceId,
          targetBrand: brand,
          targetCategory: targetCategory.trim(),
          enabledSourceTiers,
          targetCity: city,
        });
        allRows = dedupeResultRows([...allRows, ...result.rows]);
        autoMerged += result.autoMerged;
        pendingConfirmations = dedupeResultRows([
          ...pendingConfirmations,
          ...result.pendingConfirmations,
        ]);
        allErrors.push(...result.errors);
        stats = mergeStats(stats, result.stats);
      } catch (e) {
        const label = city ? `${brand} / ${city}` : brand;
        allErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  await deductCredits({
    tenantId,
    action: "gift-intel.sweep",
    quantity: combinationsRun,
    referenceId: `gift-intel:${brands.join(",")}:${Date.now()}`,
  });

  return {
    results: allRows,
    autoMerged,
    pendingConfirmations,
    errors: allErrors,
    stats,
  };
}
