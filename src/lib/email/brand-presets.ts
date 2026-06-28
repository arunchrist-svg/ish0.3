import type { BrandConfig, BrandSlug, CampaignMode } from "@/lib/email/config";

export const BRAND_PRESET_OPTIONS: { value: BrandSlug; label: string; desc: string }[] = [
  { value: "ish", label: "ISH — Sweets & Gifting", desc: "Mithai, hampers, Diwali corporate gifting" },
  { value: "prestige", label: "Prestige — Appliances", desc: "Kitchen appliances, bulk employee rewards" },
  { value: "custom", label: "Custom", desc: "Define your own product catalog and tone" },
];

export const CAMPAIGN_MODE_OPTIONS: { value: CampaignMode; label: string; desc: string }[] = [
  { value: "diwali_gifting", label: "Diwali Gifting", desc: "Seasonal employee gifting, sampling, hampers" },
  { value: "mass_ordering", label: "Mass Ordering", desc: "Bulk orders, volume pricing, procurement CTAs" },
  { value: "festival_bundle", label: "Festival Bundle", desc: "Festival combos and limited-time bundles" },
  { value: "custom", label: "Custom", desc: "Free-text campaign notes" },
];

export const BRAND_PRESETS: Record<Exclude<BrandSlug, "custom">, BrandConfig> = {
  ish: {
    brandSlug: "ish",
    brandName: "India Sweet House",
    vertical: "sweets_gifting",
    productSummary:
      "Premium pure-ghee mithai, dry fruit hampers, and curated Diwali gift boxes. Bulk pricing from ₹500/person for 200+ employees. Custom-branded boxes and pan-India delivery.",
    buyerPersonas: ["HR Director", "HR Manager", "Admin Head", "Procurement Manager"],
    toneNotes: "Festive but plain. Focus on mithai, hampers, and tasting samples. Mention Diwali timing without hype. Not salesy.",
  },
  prestige: {
    brandSlug: "prestige",
    brandName: "Prestige",
    vertical: "appliances",
    productSummary:
      "Mixer grinders, induction cooktops, pressure cookers, and kitchen appliance bundles for corporate rewards. Volume pricing for 100+ units. Pan-India warranty and service network.",
    buyerPersonas: ["HR Director", "Procurement Manager", "Admin Head", "CEO at SMBs"],
    toneNotes: "Practical and direct. Focus on appliances, employee rewards, warranty, and bulk value. Not flashy or promotional.",
  },
};

export function resolveBrandConfig(partial?: Partial<BrandConfig>): BrandConfig {
  const slug = partial?.brandSlug ?? "ish";
  if (slug === "custom") {
    return {
      brandSlug: "custom",
      brandName: partial?.brandName?.trim() || "Your Company",
      vertical: partial?.vertical?.trim() || "general",
      productSummary: partial?.productSummary?.trim() || "",
      buyerPersonas: partial?.buyerPersonas?.length ? partial.buyerPersonas : ["HR Manager"],
      toneNotes: partial?.toneNotes,
    };
  }
  const preset = BRAND_PRESETS[slug];
  return { ...preset, ...partial, brandSlug: slug };
}
