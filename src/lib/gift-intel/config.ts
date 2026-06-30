import type { EnrichmentConfig } from "@/lib/enrichment/config";

export const ISH_DEFAULT_GIFT_INTEL = {
  giftIntelProductCategory: "Sweets",
  giftIntelCompetitorBrands: [
    "Kanti Sweets",
    "Anand Sweets",
    "Haldiram's",
    "MTR Foods",
    "Karachi Bakery",
  ],
} as const;

export type GiftIntelConfigView = {
  productCategory: string;
  competitorBrands: string[];
};

export function parseCompetitorBrandsInput(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

export function formatCompetitorBrandsForInput(brands: string[] | undefined): string {
  return (brands ?? []).join("\n");
}

export function resolveGiftIntelConfig(
  partial?: Partial<Pick<EnrichmentConfig, "giftIntelProductCategory" | "giftIntelCompetitorBrands">>,
): GiftIntelConfigView {
  const productCategory =
    partial?.giftIntelProductCategory?.trim() || ISH_DEFAULT_GIFT_INTEL.giftIntelProductCategory;
  const competitorBrands =
    partial?.giftIntelCompetitorBrands?.filter(Boolean).length
      ? partial.giftIntelCompetitorBrands.filter((b) => b.trim()).map((b) => b.trim())
      : [...ISH_DEFAULT_GIFT_INTEL.giftIntelCompetitorBrands];

  return { productCategory, competitorBrands };
}

export function assertCompetitorInList(brand: string, brands: string[]): void {
  const normalized = brand.trim().toLowerCase();
  const match = brands.some((b) => b.toLowerCase() === normalized);
  if (!match) {
    throw new Error(`"${brand}" is not in your configured competitor list. Update Settings → Enrichment.`);
  }
}


export function assertCompetitorsInList(selected: string[], allowed: string[]): void {
  for (const brand of selected) {
    assertCompetitorInList(brand, allowed);
  }
}
