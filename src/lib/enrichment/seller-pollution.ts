import type { PlatformIntent } from "@/lib/brand/platform-intent";
import type { ScoutQualityProfile, ScoutSellerPollution } from "@/lib/enrichment/quality-profile";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

const SWEETS_SELLER_RE =
  /\b(mithai|halwai|sweet(?:s)?(?:\s+(?:shop|store|mart))?|bakery|confection(?:ery)?|hamper\s*(?:shop|store)|gift\s*(?:shop|store|gallery)|dry\s*fruit(?:s)?\s*(?:shop|store))\b/i;

const APPLIANCE_SELLER_RE =
  /\b(appliance\s*(?:shop|store)|electronics\s*(?:shop|store|retail)|white\s*goods\s*(?:shop|store))\b/i;

const SAAS_SELLER_RE =
  /\b(saas\s*(?:agency|vendor|reseller)|software\s*(?:reseller|vendor)|competing\s+software)\b/i;

export function looksLikeLookalikeSeller(
  company: Pick<ScoutCompanyResult, "name" | "industry" | "intelNotes">,
  intent: PlatformIntent,
): boolean {
  const hay = `${company.name} ${company.industry ?? ""} ${company.intelNotes ?? ""}`;
  if (intent === "corporate_gifting") return SWEETS_SELLER_RE.test(hay);
  if (intent === "appliances") return APPLIANCE_SELLER_RE.test(hay) || SWEETS_SELLER_RE.test(hay);
  if (intent === "b2b_saas" || intent === "general_b2b") return SAAS_SELLER_RE.test(hay);
  return false;
}

export function shouldDropLookalikeSeller(
  sellerPollution: ScoutSellerPollution,
  searchKind?: "industry" | "business",
): boolean {
  if (sellerPollution === "hard_block") return true;
  if (sellerPollution === "separate_modes") return searchKind !== "business";
  return false;
}

export function applySellerPollutionFilter(
  companies: ScoutCompanyResult[],
  profile: ScoutQualityProfile,
  searchKind?: "industry" | "business",
): ScoutCompanyResult[] {
  if (!shouldDropLookalikeSeller(profile.sellerPollution, searchKind)) return companies;
  return companies.filter((company) => !looksLikeLookalikeSeller(company, profile.intent));
}
