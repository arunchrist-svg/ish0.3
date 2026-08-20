import { db, leadResearch } from "@/db";
import { eq } from "drizzle-orm";

export class ResearchNotReadyError extends Error {
  code = "RESEARCH_NOT_READY" as const;
  missing: string[];

  constructor(missing: string[]) {
    super(`Research brief incomplete: missing ${missing.join(", ")}`);
    this.name = "ResearchNotReadyError";
    this.missing = missing;
  }
}

export function getResearchQualityGaps(research: {
  outreachHook?: string | null;
  decisionChain?: string[] | null;
} | null | undefined): string[] {
  const gaps: string[] = [];
  if (!research?.outreachHook?.trim()) gaps.push("outreachHook");
  if (!research?.decisionChain?.length) gaps.push("decisionChain");
  return gaps;
}

export function assertResearchReadyForWriter(
  research: { outreachHook?: string | null; decisionChain?: string[] | null } | null | undefined,
): void {
  const gaps = getResearchQualityGaps(research);
  if (gaps.length) throw new ResearchNotReadyError(gaps);
}

export function fallbackResearchBrief(params: {
  contactName: string;
  contactTitle?: string | null;
  accountName: string;
  brandName: string;
}): { outreachHook: string; decisionChain: string[] } {
  return {
    outreachHook: `Seasonal corporate gifting for ${params.accountName}`,
    decisionChain: [params.contactName],
  };
}

export async function ensureResearchBriefForWriter(params: {
  leadId: string;
  contactName: string;
  contactTitle?: string | null;
  accountName: string;
  brandName: string;
  existing?: {
    id: string;
    outreachHook?: string | null;
    decisionChain?: string[] | null;
  } | null;
}): Promise<{ outreachHook: string; decisionChain: string[] }> {
  const fallback = fallbackResearchBrief(params);
  const outreachHook = params.existing?.outreachHook?.trim() || fallback.outreachHook;
  const decisionChain = params.existing?.decisionChain?.length
    ? params.existing.decisionChain
    : fallback.decisionChain;

  if (!params.existing) {
    await db.insert(leadResearch).values({
      leadId: params.leadId,
      confidenceTier: "low",
      outreachHook,
      decisionChain,
      outreachHooks: [outreachHook],
    });
  } else if (getResearchQualityGaps(params.existing).length) {
    await db
      .update(leadResearch)
      .set({ outreachHook, decisionChain })
      .where(eq(leadResearch.id, params.existing.id));
  }

  return { outreachHook, decisionChain };
}
