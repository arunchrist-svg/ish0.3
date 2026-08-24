import type { ScoutCompanyResult } from "./types";

const INDUSTRY_BUCKET_MAP: Record<string, string[]> = {
  BFSI: ["Financial Services"],
  Finance: ["Financial Services"],
  Pharma: ["Pharmaceuticals"],
  Healthcare: ["Healthcare"],
  Retail: ["Retail"],
  Education: ["Education"],
  "Real Estate": ["Real Estate"],
  Construction: ["Construction"],
  Automotive: ["Automotive"],
  Hospitality: ["Hospitality"],
  Technology: ["Technology", "Electronics"],
};

/** Split a long industry list so one web query is not 18 ORs. */
export function partitionIndustriesForSearch(
  industries: string[],
  maxChunks = 4,
): string[][] {
  const cleaned = industries.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return [[]];
  if (cleaned.length <= 3) return [cleaned];
  const chunkCount = Math.min(maxChunks, Math.ceil(cleaned.length / 3));
  const chunks: string[][] = Array.from({ length: chunkCount }, () => []);
  cleaned.forEach((industry, i) => {
    chunks[i % chunkCount]!.push(industry);
  });
  return chunks;
}

export function industrySearchClause(industries: string[]): string {
  return industries.map((s) => s.trim()).filter(Boolean).join(" OR ");
}

export function filterBySelectedIndustries(
  results: ScoutCompanyResult[],
  selectedIndustries: string[],
): ScoutCompanyResult[] {
  if (!selectedIndustries.length) return results;

  const selectedSet = new Set(selectedIndustries.map((s) => s.trim()).filter(Boolean));
  const broadIndustrySearch = selectedSet.size >= 8;

  return results.filter((c) => {
    const inferred = c.industry?.trim();
    if (!inferred) return true;

    // Places often labels offices as Corporate. Drop that only on a narrow
    // industry pick; a 18-industry Autopilot should still keep those hits.
    if (inferred === "Corporate" && !broadIndustrySearch) return false;

    if (selectedSet.has(inferred)) return true;

    const mapped = INDUSTRY_BUCKET_MAP[inferred];
    if (!mapped) return true;
    return mapped.some((m) => selectedSet.has(m));
  });
}
