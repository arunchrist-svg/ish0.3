import { PLATFORM_INTENT_OPTIONS, type PlatformIntent } from "@/lib/brand/platform-intent";
import { BRAND_PRESET_OPTIONS, CAMPAIGN_MODE_OPTIONS } from "@/lib/email/brand-presets";
import type { BrandSlug, CampaignMode } from "@/lib/email/config";

const SWEETS_ONLY_LOCAL_PARTS = ["srilaksha.ish"];

export function isSweetsOnlyOperator(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  const local = normalized.split("@")[0] ?? "";
  return SWEETS_ONLY_LOCAL_PARTS.some(
    (part) => local === part || local.startsWith(`${part}.`) || normalized.includes(part),
  );
}

export function platformIntentOptionsForUser(email?: string | null) {
  if (!isSweetsOnlyOperator(email)) return PLATFORM_INTENT_OPTIONS;
  return PLATFORM_INTENT_OPTIONS.filter((option) => option.value === "corporate_gifting");
}

export function brandPresetOptionsForUser(email?: string | null) {
  if (!isSweetsOnlyOperator(email)) return BRAND_PRESET_OPTIONS;
  return BRAND_PRESET_OPTIONS.filter((option) => option.value === "ish");
}

export function campaignModeOptionsForUser<T extends { value: CampaignMode }>(
  options: T[],
  email?: string | null,
): T[] {
  if (!isSweetsOnlyOperator(email)) return options;
  return options.filter((option) => option.value === "diwali_gifting");
}

export function defaultPlatformIntentForUser(email?: string | null): PlatformIntent {
  return isSweetsOnlyOperator(email) ? "corporate_gifting" : "b2b_saas";
}

export function defaultBrandPresetForUser(email?: string | null): BrandSlug {
  return isSweetsOnlyOperator(email) ? "ish" : "custom";
}

export { CAMPAIGN_MODE_OPTIONS };
