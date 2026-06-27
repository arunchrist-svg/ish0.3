import type { EnrichmentProviderId } from "./enrich-types";
import { hasApolloKey, hasHunterKey, resolveEnrichProvider, type EnrichProvider, type DataMode } from "./config";

export const FREE_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "website_email",
  "web_snippets",
  "ai_research",
  "google_places",
];

export const PAID_ENRICH_PROVIDER_ORDER: EnrichmentProviderId[] = [
  "hunter",
  "apollo",
];

export const PAID_PROVIDER_IDS = new Set<EnrichmentProviderId>(PAID_ENRICH_PROVIDER_ORDER);

export function isProviderConfigured(id: EnrichmentProviderId): boolean {
  switch (id) {
    case "hunter":
      return hasHunterKey();
    case "apollo":
      return hasApolloKey();
    default:
      return true;
  }
}

export function hasAnyPaidProvider(): boolean {
  return PAID_ENRICH_PROVIDER_ORDER.some(isProviderConfigured);
}

export function hasAnyEnrichmentProvider(): boolean {
  return true;
}


export function providerChainForEnrichSetting(
  enrichProvider: EnrichProvider,
  dataMode: DataMode,
): EnrichmentProviderId[] {
  const resolved = resolveEnrichProvider(dataMode, enrichProvider);
  if (resolved === "none") return [];

  const freeChain = FREE_ENRICH_PROVIDER_ORDER;
  if (resolved === "website_email") return [...freeChain];

  if (resolved === "apollo") {
    const chain: EnrichmentProviderId[] = [];
    if (isProviderConfigured("apollo")) chain.push("apollo");
    return [...chain, ...freeChain];
  }

  if (resolved === "hunter") {
    const chain: EnrichmentProviderId[] = [];
    if (isProviderConfigured("hunter")) chain.push("hunter");
    if (isProviderConfigured("apollo")) chain.push("apollo");
    return chain.length ? [...chain, ...freeChain] : [...freeChain];
  }

  return [...freeChain];
}

export function enrichModeForSettings(
  enrichProvider: EnrichProvider,
  dataMode: DataMode,
): "free" | "paid" {
  const resolved = resolveEnrichProvider(dataMode, enrichProvider);
  if (resolved === "hunter" && isProviderConfigured("hunter")) return "paid";
  if (resolved === "apollo" && isProviderConfigured("apollo")) return "paid";
  return "free";
}
