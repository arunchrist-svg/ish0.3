import type { BrandConfig, BrandSlug, CampaignMode } from "@/lib/email/config";
import { generalPack } from "./general/pack";
import { giftingAppliancesPack } from "./gifting-appliances/pack";
import { giftingSweetsPack } from "./gifting-sweets/pack";
import type { VerticalPack, VerticalPackId } from "./types";

export type { VerticalPack, VerticalPackId, PackOutreachCta } from "./types";

export const VERTICAL_PACKS: Record<VerticalPackId, VerticalPack> = {
  general: generalPack,
  "gifting-sweets": giftingSweetsPack,
  "gifting-appliances": giftingAppliancesPack,
};

export const VERTICAL_PACK_OPTIONS: {
  value: VerticalPackId;
  label: string;
  desc: string;
}[] = [
  { value: "general", label: generalPack.label, desc: generalPack.description },
  { value: "gifting-sweets", label: giftingSweetsPack.label, desc: giftingSweetsPack.description },
  {
    value: "gifting-appliances",
    label: giftingAppliancesPack.label,
    desc: giftingAppliancesPack.description,
  },
];

/** Map legacy BrandSlug presets to vertical packs. */
export function packIdFromLegacyBrandSlug(slug?: BrandSlug | null): VerticalPackId | undefined {
  if (slug === "ish") return "gifting-sweets";
  if (slug === "prestige") return "gifting-appliances";
  return undefined;
}

export function resolveVerticalPackId(
  packId?: VerticalPackId | string | null,
  legacySlug?: BrandSlug | null,
): VerticalPackId {
  if (packId && packId in VERTICAL_PACKS) return packId as VerticalPackId;
  return packIdFromLegacyBrandSlug(legacySlug) ?? "general";
}

export function getVerticalPack(packId?: VerticalPackId | string | null): VerticalPack {
  return VERTICAL_PACKS[resolveVerticalPackId(packId)];
}

/**
 * One-shot apply: copy pack fields into a custom BrandConfig.
 * Does not keep live runtime forks on brandSlug.
 */
export function applyVerticalPack(
  packId: VerticalPackId,
  overrides?: Partial<BrandConfig>,
): BrandConfig {
  const pack = getVerticalPack(packId);
  const t = pack.brandTemplate;
  return {
    brandSlug: "custom",
    verticalPackId: pack.id,
    brandName: overrides?.brandName?.trim() || t.brandName,
    vertical: overrides?.vertical?.trim() || t.vertical,
    productSummary: overrides?.productSummary?.trim() || t.productSummary,
    buyerPersonas: overrides?.buyerPersonas?.length ? overrides.buyerPersonas : [...t.buyerPersonas],
    toneNotes: overrides?.toneNotes ?? t.toneNotes,
    websiteUrl: overrides?.websiteUrl,
    websiteInsights: overrides?.websiteInsights,
    platformIntent: overrides?.platformIntent,
    defaultOutreachCta: overrides?.defaultOutreachCta,
  };
}

export function defaultCampaignModeForPack(packId?: VerticalPackId | string | null): CampaignMode {
  return getVerticalPack(packId).defaultCampaignMode;
}

export function subjectFallbackForAccount(accountName: string, brandName?: string): string {
  const brand = brandName?.trim();
  return brand ? `${brand} for ${accountName}` : `Outreach for ${accountName}`;
}
