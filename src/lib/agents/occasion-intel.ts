import { randomUUID } from "crypto";
import { callLLM } from "@/lib/llm";
import { parseGiftIntelExtractions } from "@/lib/agents/schemas/brand-intel-output";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { discoverOccasionIntelPosts } from "@/lib/enrichment/occasion-intel-search";
import {
  buildComingSoonIntelSystemPrompt,
  buildComingSoonIntelUserPrompt,
  buildOccasionIntelSystemPrompt,
  buildOccasionIntelUserPrompt,
} from "./occasion-intel-prompt";
import { classifyAndMergeExtractions } from "@/lib/brand-intel/merge-accounts";
import { matchesTargetCity } from "@/lib/brand-intel/city-match";
import {
  normalizeComingSoonSignalType,
  type OccasionSweepFamily,
} from "@/lib/brand-intel/occasion-sources";
import { normalizeOccasionTiming, normalizeOccasionType } from "@/lib/occasions/catalog";
import type {
  ComingSoonSignalType,
  ExtractedGiftIntel,
  GiftIntelResultRow,
  GiftIntelSweepResult,
  OccasionTiming,
  RawGiftIntelPost,
  SourceTier,
} from "@/lib/brand-intel/types";

const BATCH_SIZE = 5;

const NEW_UNIT_HINT =
  /opening soon|coming soon|will open|to (?:launch|open)|new store|new outlet|new showroom|upcoming (?:store|outlet)|shopfit|fit-?out|tenant mix|pre-opening|hiring store/i;

function parseOccasionRow(
  raw: Record<string, unknown>,
  post: RawGiftIntelPost,
  family: OccasionSweepFamily,
): ExtractedGiftIntel {
  const extraction = (raw.extraction_data ?? raw.extractionData) as Record<string, unknown> | undefined;
  const confidence = Number(raw.confidence_score ?? raw.confidenceScore ?? 0);
  const occasionType = extraction
    ? String(extraction.occasion_type ?? extraction.occasionType ?? "")
    : "";
  const occasionContext = extraction
    ? String(extraction.occasion_or_context ?? extraction.occasionOrContext ?? "")
    : "";
  const isTarget = Boolean(
    raw.is_target_occasion_event ?? raw.isTargetOccasionEvent ?? raw.is_target_gifting_event ?? raw.isTargetGiftingEvent,
  );
  const timingRaw = extraction
    ? String(extraction.timing ?? "")
    : "";
  const signalRaw = extraction
    ? String(extraction.signal_type ?? extraction.signalType ?? "")
    : "";
  const timing: OccasionTiming | undefined =
    normalizeOccasionTiming(timingRaw) ?? (family === "coming_soon" ? "upcoming" : undefined);
  const signalType: ComingSoonSignalType | undefined =
    normalizeComingSoonSignalType(signalRaw) ?? (family === "coming_soon" ? post.signalType : undefined);

  return {
    id: randomUUID(),
    is_target_gifting_event: isTarget,
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
          product_category: String(extraction.product_category ?? extraction.productCategory ?? "Sweets"),
          occasion_or_context: occasionContext || undefined,
          occasion_type: normalizeOccasionType(occasionType || occasionContext) ?? undefined,
          timeframe: extraction.timeframe != null ? String(extraction.timeframe) : undefined,
          giving_company_city:
            extraction.giving_company_city != null
              ? String(extraction.giving_company_city)
              : extraction.givingCompanyCity != null
                ? String(extraction.givingCompanyCity)
                : undefined,
          timing,
          signal_type: signalType,
        }
      : undefined,
    evidence_rationale: String(raw.evidence_rationale ?? raw.evidenceRationale ?? ""),
    source_id: post.sourceId,
    source_tier: post.sourceTier,
    source_url: post.url,
    source_snippet: post.text.slice(0, 280),
  };
}

function keepComingSoonExtraction(extraction: ExtractedGiftIntel): boolean {
  const data = extraction.extraction_data;
  const city = data?.giving_company_city?.trim();
  const loc = data?.specific_product_details?.trim();
  if (!city && !loc) return false;
  const blob = [
    data?.occasion_or_context,
    extraction.evidence_rationale,
    loc,
    city,
    extraction.source_snippet,
  ]
    .filter(Boolean)
    .join(" ");
  return NEW_UNIT_HINT.test(blob);
}

async function extractBatch(
  targetCity: string | undefined,
  posts: RawGiftIntelPost[],
  startIndex: number,
  family: OccasionSweepFamily,
): Promise<ExtractedGiftIntel[]> {
  const comingSoon = family === "coming_soon";
  const system = comingSoon
    ? buildComingSoonIntelSystemPrompt(targetCity)
    : buildOccasionIntelSystemPrompt(targetCity);
  const prompt = comingSoon
    ? buildComingSoonIntelUserPrompt(
        posts.map((p, i) => ({
          index: startIndex + i,
          url: p.url,
          text: p.text,
          sourceId: p.sourceId,
          signalType: p.signalType,
        })),
        targetCity,
      )
    : buildOccasionIntelUserPrompt(
        posts.map((p, i) => ({
          index: startIndex + i,
          url: p.url,
          text: p.text,
          sourceId: p.sourceId,
        })),
        targetCity,
      );
  const raw = await callLLM({ tier: "quality", system, prompt, maxTokens: 2048 });
  const parsed = parseGiftIntelExtractions(raw);
  return parsed.map((row, i) => parseOccasionRow(row as Record<string, unknown>, posts[i] ?? posts[0], family));
}

export type OccasionIntelSweepParams = {
  tenantId: string;
  workspaceId: string;
  enabledSourceTiers?: SourceTier[];
  targetCities?: string[];
  families?: OccasionSweepFamily[];
};

export async function runOccasionIntelSweep(params: OccasionIntelSweepParams): Promise<GiftIntelSweepResult> {
  const { tenantId, workspaceId, enabledSourceTiers } = params;
  const cities = [...new Set((params.targetCities ?? []).map((c) => c.trim()).filter(Boolean))];
  const families: OccasionSweepFamily[] = params.families?.length
    ? params.families
    : ["openings", "milestones"];
  const citySlots: (string | undefined)[] = cities.length ? cities : [undefined];
  const combinationsRun = families.length * citySlots.length;

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
    combinationsRun,
  };

  for (const family of families) {
    for (const city of citySlots) {
      try {
        const discovery = await discoverOccasionIntelPosts({
          family,
          enabledSourceTiers,
          targetCity: city,
        });
        const posts = discovery.posts;
        const extractions: ExtractedGiftIntel[] = [];
        for (let i = 0; i < posts.length; i += BATCH_SIZE) {
          const batch = posts.slice(i, i + BATCH_SIZE);
          try {
            extractions.push(...(await extractBatch(city, batch, i, family)));
          } catch (e) {
            allErrors.push(e instanceof Error ? e.message : String(e));
          }
        }
        const positive = extractions.filter((e) => {
          if (!e.is_target_gifting_event) return false;
          if (family === "coming_soon" && !keepComingSoonExtraction(e)) return false;
          if (!city?.trim()) return true;
          const post = posts.find((p) => p.url === e.source_url);
          return matchesTargetCity({
            targetCity: city.trim(),
            extractedCity: e.extraction_data?.giving_company_city,
            postText: post?.text ?? e.source_snippet,
          });
        });
        const merged = await classifyAndMergeExtractions({
          tenantId,
          workspaceId,
          extractions: positive,
          targetCity: city,
        });
        allRows = [...allRows, ...merged.rows];
        autoMerged += merged.autoMerged;
        pendingConfirmations = [...pendingConfirmations, ...merged.pendingConfirmations];
        stats.queriesRun += discovery.queriesRun;
        stats.hitsFound += discovery.hitsFound;
        stats.hitsAfterPreFilter += posts.length;
        stats.hitsExtracted += positive.length;
        for (const [tier, count] of Object.entries(discovery.byTier)) {
          const t = Number(tier);
          stats.byTier[t] = (stats.byTier[t] ?? 0) + count;
        }
        allErrors.push(...discovery.errors);
      } catch (e) {
        allErrors.push(`${family}${city ? ` / ${city}` : ""}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  await deductCredits({
    tenantId,
    action: "gift-intel.sweep",
    quantity: combinationsRun,
    referenceId: `occasion-intel:${Date.now()}`,
  });

  return {
    results: allRows,
    autoMerged,
    pendingConfirmations,
    errors: allErrors,
    stats,
  };
}
