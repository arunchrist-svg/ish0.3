import type { BrandConfig, BrandSlug, CampaignMode } from "@/lib/email/config";
import {
  applyVerticalPack,
  getVerticalPack,
  packIdFromLegacyBrandSlug,
  resolveVerticalPackId,
  VERTICAL_PACK_OPTIONS,
  VERTICAL_PACKS,
} from "@/vertical-packs";
import {
  resolvePlatformIntent,
  verticalPackIdForIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";

/** UI: vertical packs as one-shot templates (legacy BrandSlug values map to packs). */
export const BRAND_PRESET_OPTIONS: { value: BrandSlug; label: string; desc: string }[] = [
  { value: "custom", label: "Custom / from website", desc: "Define your own product catalog and tone" },
  {
    value: "ish",
    label: VERTICAL_PACKS["gifting-sweets"].label,
    desc: VERTICAL_PACKS["gifting-sweets"].description,
  },
  {
    value: "prestige",
    label: VERTICAL_PACKS["gifting-appliances"].label,
    desc: VERTICAL_PACKS["gifting-appliances"].description,
  },
];

export const VERTICAL_PACK_UI_OPTIONS = VERTICAL_PACK_OPTIONS;

export const CAMPAIGN_MODE_OPTIONS: { value: CampaignMode; label: string; desc: string }[] = [
  { value: "custom", label: "Custom", desc: "Free-text campaign notes" },
  { value: "year_round", label: "Year-round programs", desc: "Birthdays, onboarding, pantry, openings, empanelment" },
  { value: "mass_ordering", label: "Mass Ordering", desc: "Bulk orders, volume pricing, procurement CTAs" },
  { value: "festival_bundle", label: "Festival Bundle", desc: "Festival combos and limited-time bundles" },
  { value: "diwali_gifting", label: "Diwali Gifting", desc: "Seasonal employee gifting (sweets pack)" },
];

/** Campaign modes allowed for the active vertical pack / platform intent. */
export function campaignModeOptionsForBrand(brand?: Partial<BrandConfig> | null): typeof CAMPAIGN_MODE_OPTIONS {
  const intent = resolvePlatformIntent(brand?.platformIntent, brand?.verticalPackId ?? brand?.brandSlug);
  const packId = brand?.verticalPackId ?? verticalPackIdForIntent(intent);
  const allowed = new Set(getVerticalPack(packId).campaignModes);
  return CAMPAIGN_MODE_OPTIONS.filter((o) => allowed.has(o.value));
}

/** @deprecated Use applyVerticalPack. Kept for tests reading legacy shapes. */
export const BRAND_PRESETS: Record<Exclude<BrandSlug, "custom">, BrandConfig> = {
  ish: applyVerticalPack("gifting-sweets"),
  prestige: applyVerticalPack("gifting-appliances"),
};

/**
 * Resolve seller brand for runtime. Always returns custom fields.
 * Legacy ish/prestige slugs hydrate once from their vertical pack when fields are thin.
 */
export function resolveBrandConfig(partial?: Partial<BrandConfig>): BrandConfig {
  const websiteUrl = partial?.websiteUrl?.trim() || undefined;
  const websiteInsights = partial?.websiteInsights;
  const packId = resolveVerticalPackId(
    partial?.verticalPackId,
    partial?.brandSlug,
  );
  const platformIntent = resolvePlatformIntent(partial?.platformIntent, packId);

  const legacyPackId = packIdFromLegacyBrandSlug(partial?.brandSlug);
  const shouldHydrateFromPack =
    Boolean(legacyPackId) &&
    (!partial?.productSummary?.trim() || partial.brandSlug === "ish" || partial.brandSlug === "prestige");

  if (shouldHydrateFromPack && legacyPackId) {
    const applied = applyVerticalPack(legacyPackId, {
      ...partial,
      websiteUrl,
      websiteInsights,
    });
    return {
      ...applied,
      brandName: partial?.brandName?.trim() || applied.brandName,
      productSummary: partial?.productSummary?.trim() || applied.productSummary,
      vertical: partial?.vertical?.trim() || applied.vertical,
      buyerPersonas: partial?.buyerPersonas?.length ? partial.buyerPersonas : applied.buyerPersonas,
      toneNotes: partial?.toneNotes ?? applied.toneNotes,
      websiteUrl,
      websiteInsights,
      brandSlug: "custom",
      verticalPackId: packId,
      platformIntent,
      defaultOutreachCta: partial?.defaultOutreachCta ?? applied.defaultOutreachCta,
    };
  }

  return {
    brandSlug: "custom",
    verticalPackId: packId,
    platformIntent,
    brandName: partial?.brandName?.trim() || "Your Company",
    vertical: partial?.vertical?.trim() || "general",
    productSummary: partial?.productSummary?.trim() || "",
    buyerPersonas: partial?.buyerPersonas?.length ? partial.buyerPersonas : ["HR Manager"],
    toneNotes: partial?.toneNotes,
    websiteUrl,
    websiteInsights,
    defaultOutreachCta: partial?.defaultOutreachCta,
  };
}

/** Apply a UI preset selection as a one-shot pack copy into custom brand. */
export function brandConfigFromPresetSelection(
  slug: BrandSlug,
  overrides?: Partial<BrandConfig>,
): BrandConfig {
  const packId = packIdFromLegacyBrandSlug(slug) ?? "general";
  if (slug === "custom") {
    return resolveBrandConfig({
      ...overrides,
      brandSlug: "custom",
      verticalPackId: "general",
      platformIntent: overrides?.platformIntent ?? "general_b2b",
    });
  }
  const platformIntent: PlatformIntent =
    slug === "ish" ? "corporate_gifting" : "appliances";
  return applyVerticalPack(packId, { ...overrides, platformIntent });
}

/** Apply an explicit platform intent (onboarding / Settings). */
export function brandConfigFromPlatformIntent(
  intent: PlatformIntent,
  overrides?: Partial<BrandConfig>,
): BrandConfig {
  const packId = verticalPackIdForIntent(intent);
  if (packId === "general") {
    return resolveBrandConfig({
      ...overrides,
      brandSlug: "custom",
      verticalPackId: "general",
      platformIntent: intent,
    });
  }
  return applyVerticalPack(packId, { ...overrides, platformIntent: intent });
}
