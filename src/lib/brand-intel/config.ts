import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { getVerticalPack, type VerticalPackId } from "@/vertical-packs";

export type BrandIntelConfigView = {
  productCategory: string;
  competitorBrands: string[];
  configured: boolean;
};

/** @deprecated Use BrandIntelConfigView */
export type GiftIntelConfigView = BrandIntelConfigView;

export function parseCompetitorBrandsInput(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

export function formatCompetitorBrandsForInput(brands: string[] | undefined): string {
  return (brands ?? []).join("\n");
}

/**
 * Resolve Brand Intelligence category/competitors from workspace settings.
 * Never silently fill Sweets / ISH competitors. Empty means "not configured".
 */
export function resolveBrandIntelConfig(
  partial?: Partial<
    Pick<
      EnrichmentConfig,
      "giftIntelProductCategory" | "giftIntelCompetitorBrands" | "brandIntelProductCategory" | "brandIntelCompetitorBrands"
    >
  >,
  packId?: VerticalPackId | string | null,
): BrandIntelConfigView {
  const category =
    partial?.brandIntelProductCategory?.trim() ||
    partial?.giftIntelProductCategory?.trim() ||
    "";
  const brandsRaw =
    partial?.brandIntelCompetitorBrands?.filter(Boolean).length
      ? partial.brandIntelCompetitorBrands
      : partial?.giftIntelCompetitorBrands?.filter(Boolean).length
        ? partial.giftIntelCompetitorBrands
        : [];
  const competitorBrands = brandsRaw.filter((b) => b.trim()).map((b) => b.trim());

  return {
    productCategory: category,
    competitorBrands,
    configured: Boolean(category && competitorBrands.length),
  };
}

/** Optional: defaults when explicitly applying a vertical pack during setup. */
export function brandIntelDefaultsFromPack(packId?: VerticalPackId | string | null) {
  return getVerticalPack(packId).brandIntelDefaults;
}

/** @deprecated Prefer resolveBrandIntelConfig */
export function resolveGiftIntelConfig(
  partial?: Partial<Pick<EnrichmentConfig, "giftIntelProductCategory" | "giftIntelCompetitorBrands">>,
): BrandIntelConfigView {
  return resolveBrandIntelConfig(partial);
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
