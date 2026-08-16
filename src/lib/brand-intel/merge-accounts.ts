import { db, accounts } from "@/db";
import { and, eq } from "drizzle-orm";
import type { PastGiftingBrand, CompanyOverview, DetectedOccasion } from "@/lib/company-overview";
import type { ExtractedGiftIntel, GiftIntelMergeStatus, GiftIntelResultRow } from "./types";
import { nameMatchScore } from "./name-match";
import { citiesMatch } from "./city-match";
import { getOccasion, normalizeOccasionType } from "@/lib/occasions/catalog";

const AUTO_MERGE_CONFIDENCE = 0.85;
const T3_AUTO_MERGE_CONFIDENCE = 0.9;
const NAME_MATCH_THRESHOLD = 0.72;

function toPastGiftingEntry(extraction: ExtractedGiftIntel): PastGiftingBrand {
  const data = extraction.extraction_data;
  const year = data?.timeframe?.slice(0, 4);
  return {
    year,
    occasion: data?.occasion_or_context,
    items: [data?.brand_identified, data?.specific_product_details].filter(Boolean).join(" | "),
  };
}

function toDetectedOccasion(extraction: ExtractedGiftIntel): DetectedOccasion | null {
  const data = extraction.extraction_data;
  const type =
    normalizeOccasionType(data?.occasion_type) ??
    normalizeOccasionType(data?.occasion_or_context) ??
    null;
  if (!type && !data?.occasion_or_context) return null;
  const def = type ? getOccasion(type) : null;
  return {
    type: type ?? "milestone",
    label: data?.occasion_or_context || def?.label,
    timeframe: data?.timeframe,
    location: [data?.specific_product_details, data?.giving_company_city].filter(Boolean).join(", ") || undefined,
    sourceUrl: extraction.source_url,
    timing: data?.timing,
    signalType: data?.signal_type,
  };
}

function dedupePastGifting(existing: PastGiftingBrand[], entry: PastGiftingBrand): PastGiftingBrand[] {
  const key = `${entry.year ?? ""}|${entry.occasion ?? ""}|${entry.items ?? ""}`.toLowerCase();
  const filtered = existing.filter((e) => {
    const k = `${e.year ?? ""}|${e.occasion ?? ""}|${e.items ?? ""}`.toLowerCase();
    return k !== key;
  });
  return [...filtered, entry];
}

function dedupeOccasions(existing: DetectedOccasion[], entry: DetectedOccasion): DetectedOccasion[] {
  const key = `${entry.type}|${entry.timing ?? ""}|${entry.timeframe ?? ""}|${entry.location ?? ""}|${entry.sourceUrl ?? ""}`.toLowerCase();
  const filtered = existing.filter((e) => {
    const k = `${e.type}|${e.timing ?? ""}|${e.timeframe ?? ""}|${e.location ?? ""}|${e.sourceUrl ?? ""}`.toLowerCase();
    return k !== key;
  });
  return [...filtered, entry];
}

export async function findMatchingAccount(
  tenantId: string,
  workspaceId: string,
  companyName: string,
  targetCity?: string,
  extractedCity?: string,
): Promise<{ id: string; name: string; score: number } | null> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name, city: accounts.city })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.workspaceId, workspaceId)));

  const cityHint = extractedCity ?? targetCity;

  let best: { id: string; name: string; score: number } | null = null;
  for (const row of rows) {
    const score = nameMatchScore(companyName, row.name);
    if (score < NAME_MATCH_THRESHOLD) continue;

    if (targetCity?.trim() && row.city) {
      if (!citiesMatch(row.city, targetCity) && !citiesMatch(row.city, cityHint ?? "")) continue;
    }

    if (!best || score > best.score) {
      best = { id: row.id, name: row.name, score };
    }
  }
  return best;
}

function autoMergeThreshold(extraction: ExtractedGiftIntel): number {
  if (extraction.source_tier === 3) return T3_AUTO_MERGE_CONFIDENCE;
  return AUTO_MERGE_CONFIDENCE;
}

export async function mergeExtractionToAccount(params: {
  tenantId: string;
  workspaceId: string;
  extraction: ExtractedGiftIntel;
  accountId: string;
}): Promise<void> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, params.accountId),
        eq(accounts.tenantId, params.tenantId),
        eq(accounts.workspaceId, params.workspaceId),
      ),
    )
    .limit(1);

  if (!account) throw new Error("Account not found");

  const entry = toPastGiftingEntry(params.extraction);
  const existingPast = (account.pastGifting as PastGiftingBrand[] | null) ?? [];
  const mergedPast = dedupePastGifting(existingPast, entry);

  const overview = (account.companyOverview as CompanyOverview | null) ?? {};
  const existingBrands = overview.pastGiftingBrands ?? [];
  const mergedBrands = dedupePastGifting(existingBrands, entry);

  const detected = toDetectedOccasion(params.extraction);
  const existingOccasions = overview.detectedOccasions ?? [];
  const mergedOccasions = detected ? dedupeOccasions(existingOccasions, detected) : existingOccasions;
  const nextCycle =
    detected
      ? [detected.label, detected.location, detected.timeframe].filter(Boolean).join(" · ")
      : overview.nextGiftingCalendarCycle;

  const notePrefix = detected && !params.extraction.extraction_data?.brand_identified ? "[Occasion]" : "[Gift Intel]";
  const noteLine = `${notePrefix} ${params.extraction.evidence_rationale}${params.extraction.source_url ? ` (${params.extraction.source_url})` : ""}`;
  const intelNotes = account.intelNotes ? `${account.intelNotes}\n${noteLine}` : noteLine;

  await db
    .update(accounts)
    .set({
      pastGifting: mergedPast,
      companyOverview: {
        ...overview,
        pastGiftingBrands: mergedBrands,
        detectedOccasions: mergedOccasions,
        nextGiftingCalendarCycle: nextCycle || overview.nextGiftingCalendarCycle,
      },
      intelNotes,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, params.accountId));
}

export async function classifyAndMergeExtractions(params: {
  tenantId: string;
  workspaceId: string;
  extractions: ExtractedGiftIntel[];
  targetCity?: string;
}): Promise<{ rows: GiftIntelResultRow[]; autoMerged: number; pendingConfirmations: GiftIntelResultRow[] }> {
  const rows: GiftIntelResultRow[] = [];
  let autoMerged = 0;
  const pendingConfirmations: GiftIntelResultRow[] = [];

  for (const extraction of params.extractions) {
    if (!extraction.is_target_gifting_event || !extraction.extraction_data?.giving_company) {
      rows.push({ ...extraction, mergeStatus: "no_match" });
      continue;
    }

    const match = await findMatchingAccount(
      params.tenantId,
      params.workspaceId,
      extraction.extraction_data.giving_company,
      params.targetCity,
      extraction.extraction_data.giving_company_city,
    );

    const threshold = autoMergeThreshold(extraction);
    const canAuto =
      extraction.confidence_score >= threshold &&
      match &&
      match.score >= NAME_MATCH_THRESHOLD;

    if (canAuto && match) {
      await mergeExtractionToAccount({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        extraction,
        accountId: match.id,
      });
      const row: GiftIntelResultRow = {
        ...extraction,
        mergeStatus: "auto_merged" as GiftIntelMergeStatus,
        matchedAccountId: match.id,
        matchedAccountName: match.name,
      };
      rows.push(row);
      autoMerged++;
    } else if (match) {
      const row: GiftIntelResultRow = {
        ...extraction,
        mergeStatus: "pending_confirm",
        matchedAccountId: match.id,
        matchedAccountName: match.name,
      };
      rows.push(row);
      pendingConfirmations.push(row);
    } else {
      rows.push({ ...extraction, mergeStatus: "pending_confirm" });
      pendingConfirmations.push({
        ...extraction,
        mergeStatus: "pending_confirm",
      });
    }
  }

  return { rows, autoMerged, pendingConfirmations };
}

export async function createAccountFromExtraction(params: {
  tenantId: string;
  workspaceId: string;
  extraction: ExtractedGiftIntel;
}): Promise<{ accountId: string; name: string }> {
  const data = params.extraction.extraction_data;
  const name = data?.giving_company?.trim();
  if (!name) throw new Error("giving_company is required to create an account");

  const existing = await findMatchingAccount(
    params.tenantId,
    params.workspaceId,
    name,
    undefined,
    data?.giving_company_city,
  );
  if (existing) {
    await mergeExtractionToAccount({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      extraction: params.extraction,
      accountId: existing.id,
    });
    return { accountId: existing.id, name: existing.name };
  }

  const detected = toDetectedOccasion(params.extraction);
  const nextCycle = detected
    ? [detected.label, detected.location, detected.timeframe].filter(Boolean).join(" · ")
    : undefined;
  const notePrefix = detected && !data?.brand_identified ? "[Occasion]" : "[Gift Intel]";
  const intelNotes = `${notePrefix} ${params.extraction.evidence_rationale}${params.extraction.source_url ? ` (${params.extraction.source_url})` : ""}`;
  const overview: CompanyOverview = {
    detectedOccasions: detected ? [detected] : [],
    nextGiftingCalendarCycle: nextCycle,
    pastGiftingBrands: [toPastGiftingEntry(params.extraction)].filter((e) => e.occasion || e.items),
    intelligenceNotes: intelNotes,
  };

  const [created] = await db
    .insert(accounts)
    .values({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      name,
      city: data?.giving_company_city?.trim() || null,
      intelNotes,
      companyOverview: overview,
      pastGifting: overview.pastGiftingBrands ?? [],
      dataSource: "brand_intel",
    })
    .returning({ id: accounts.id, name: accounts.name });

  if (!created) throw new Error("Account create failed");
  return { accountId: created.id, name: created.name };
}
