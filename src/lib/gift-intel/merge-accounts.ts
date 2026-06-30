import { db, accounts } from "@/db";
import { and, eq } from "drizzle-orm";
import type { PastGiftingBrand, CompanyOverview } from "@/lib/company-overview";
import type { ExtractedGiftIntel, GiftIntelMergeStatus, GiftIntelResultRow } from "./types";
import { nameMatchScore } from "./name-match";
import { citiesMatch } from "./city-match";

const AUTO_MERGE_CONFIDENCE = 0.85;
const T3_AUTO_MERGE_CONFIDENCE = 0.9;
const NAME_MATCH_THRESHOLD = 0.72;

function toPastGiftingEntry(extraction: ExtractedGiftIntel): PastGiftingBrand {
  const data = extraction.extraction_data;
  const year = data?.timeframe?.slice(0, 4);
  return {
    year,
    occasion: data?.occasion_or_context,
    items: [data?.brand_identified, data?.specific_product_details].filter(Boolean).join(" — "),
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

  const noteLine = `[Gift Intel] ${params.extraction.evidence_rationale}${params.extraction.source_url ? ` (${params.extraction.source_url})` : ""}`;
  const intelNotes = account.intelNotes ? `${account.intelNotes}\n${noteLine}` : noteLine;

  await db
    .update(accounts)
    .set({
      pastGifting: mergedPast,
      companyOverview: { ...overview, pastGiftingBrands: mergedBrands },
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
