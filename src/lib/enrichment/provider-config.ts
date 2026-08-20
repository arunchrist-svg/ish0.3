import type { EnrichmentProviderId } from "./enrich-types";
import {
  hasApolloKey,
  hasHunterKey,
  hasProspeoKey,
  hasZintlrKeys,
  resolveEnrichProvider,
  type EnrichProvider,
  type DataMode,
} from "./config";
import { sanitizeEmail, sanitizePhone, isGenericCompanyEmail } from "./validate-contact";

export const FREE_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "website_email",
  "web_snippets",
  "ai_research",
  "google_places",
];

export const PAID_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "prospeo",
  "hunter",
  "apollo",
];

export const PAID_PROVIDER_IDS = new Set<EnrichmentProviderId>(PAID_ENRICH_PROVIDER_ORDER);

export function isProviderConfigured(id: EnrichmentProviderId): boolean {
  switch (id) {
    case "prospeo":
      return hasProspeoKey();
    case "hunter":
      return hasHunterKey();
    case "apollo":
      return hasApolloKey();
    case "zintlr":
      return hasZintlrKeys();
    default:
      return true;
  }
}

export function hasAnyPaidProvider(): boolean {
  return PAID_ENRICH_PROVIDER_ORDER.some(isProviderConfigured) || hasZintlrKeys();
}

export function hasAnyEnrichmentProvider(): boolean {
  return true;
}

/** Insert Zintlr after free web sources and before Google Places. */
export function withZintlrPhoneProvider(chain: EnrichmentProviderId[]): EnrichmentProviderId[] {
  if (!hasZintlrKeys() || chain.includes("zintlr")) return chain;
  const placesIdx = chain.indexOf("google_places");
  if (placesIdx >= 0) {
    return [...chain.slice(0, placesIdx), "zintlr", ...chain.slice(placesIdx)];
  }
  const aiIdx = chain.indexOf("ai_research");
  if (aiIdx >= 0) {
    return [...chain.slice(0, aiIdx + 1), "zintlr", ...chain.slice(aiIdx + 1)];
  }
  const snippetsIdx = chain.indexOf("web_snippets");
  if (snippetsIdx >= 0) {
    return [...chain.slice(0, snippetsIdx + 1), "zintlr", ...chain.slice(snippetsIdx + 1)];
  }
  return [...chain, "zintlr"];
}

function paidProvidersForSetting(resolved: EnrichProvider): EnrichmentProviderId[] {
  const paid: EnrichmentProviderId[] = [];
  const pushIfReady = (id: EnrichmentProviderId) => {
    if (isProviderConfigured(id) && !paid.includes(id)) paid.push(id);
  };

  if (resolved === "prospeo") {
    pushIfReady("prospeo");
    pushIfReady("hunter");
    pushIfReady("apollo");
  } else if (resolved === "hunter") {
    pushIfReady("hunter");
    pushIfReady("prospeo");
    pushIfReady("apollo");
  } else if (resolved === "apollo") {
    pushIfReady("apollo");
    pushIfReady("prospeo");
    pushIfReady("hunter");
  } else {
    pushIfReady("prospeo");
    pushIfReady("hunter");
    pushIfReady("apollo");
  }
  return paid;
}

export function providerChainForEnrichSetting(
  enrichProvider: EnrichProvider,
  dataMode: DataMode,
  options?: { skipGooglePlaces?: boolean },
): EnrichmentProviderId[] {
  const resolved = resolveEnrichProvider(dataMode, enrichProvider);
  if (resolved === "none") return [];

  const freeChain = options?.skipGooglePlaces
    ? FREE_ENRICH_PROVIDER_ORDER.filter((id) => id !== "google_places")
    : FREE_ENRICH_PROVIDER_ORDER;

  let chain: EnrichmentProviderId[];
  if (resolved === "prospeo" || resolved === "hunter" || resolved === "apollo") {
    const paid = paidProvidersForSetting(resolved);
    chain = paid.length ? [...paid, ...freeChain] : [...freeChain];
  } else {
    chain = [...freeChain];
  }

  return withZintlrPhoneProvider(chain);
}

export function enrichModeForSettings(
  enrichProvider: EnrichProvider,
  dataMode: DataMode,
): "free" | "paid" {
  const resolved = resolveEnrichProvider(dataMode, enrichProvider);
  if (resolved === "prospeo" && isProviderConfigured("prospeo")) return "paid";
  if (resolved === "hunter" && isProviderConfigured("hunter")) return "paid";
  if (resolved === "apollo" && isProviderConfigured("apollo")) return "paid";
  return "free";
}

export function shouldStopOnPersonalEmail(params: {
  stopOnPersonalEmail?: boolean;
  email?: string | null;
  score: number;
  phone?: string | null;
  candidatePhones?: Array<string | null | undefined>;
}): boolean {
  if (!params.stopOnPersonalEmail) return false;
  const email = sanitizeEmail(params.email);
  if (!email || isGenericCompanyEmail(email) || params.score < 35) return false;
  if (sanitizePhone(params.phone)) return true;
  return (params.candidatePhones ?? []).some((phone) => Boolean(sanitizePhone(phone)));
}

export function candidatesHaveWhatsAppMobile(
  phones: Array<string | null | undefined>,
): boolean {
  return phones.some((phone) => Boolean(sanitizePhone(phone)));
}
