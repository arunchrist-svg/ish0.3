import { describe, expect, it, vi } from "vitest";
import {
  defaultPeopleSearchProvider,
  resolveEnrichmentConfig,
  resolvePeopleSearchProvider,
  searchProviderUsesTavily,
  shouldFallbackToIndiaDirectories,
  SEARCH_PROVIDER_LABELS,
} from "@/lib/enrichment/config";

describe("people search provider configuration", () => {
  it("keeps company and people provider defaults separate", () => {
    const config = resolveEnrichmentConfig("free", {
      searchProvider: "google_places",
      peopleSearchProvider: "tavily_ai",
      fallbackToAI: true,
    });

    expect(config.searchProvider).toBe("google_places");
    expect(config.peopleSearchProvider).toBe("tavily_ai");
  });

  it("does not enable Tavily company fallback for Places", () => {
    const config = resolveEnrichmentConfig("free", {
      searchProvider: "google_places",
      fallbackToAI: true,
    });

    expect(config.searchProvider).toBe("google_places");
    expect(config.fallbackToAI).toBe(false);
  });

  it("preserves an explicit provider even when its paid key is unavailable", () => {
    const config = resolveEnrichmentConfig("free", {
      searchProvider: "apollo",
      peopleSearchProvider: "none",
    });

    expect(config.searchProvider).toBe("apollo");
    expect(searchProviderUsesTavily(config.searchProvider)).toBe(false);
  });

  it("does not turn a Places company provider into a people provider", () => {
    expect(defaultPeopleSearchProvider("google_places")).toBe("tavily_ai");
    expect(defaultPeopleSearchProvider("india_directories")).toBe("tavily_ai");
    expect(defaultPeopleSearchProvider("apollo")).toBe("apollo");
  });

  it("makes the India provider's Tavily dependency explicit without changing provider routing", () => {
    expect(searchProviderUsesTavily("india_directories")).toBe(true);
    expect(searchProviderUsesTavily("tavily_ai")).toBe(true);
    expect(searchProviderUsesTavily("google_places")).toBe(false);
    expect(searchProviderUsesTavily("apollo")).toBe(false);
    expect(SEARCH_PROVIDER_LABELS.india_directories.label).toBe("India + Tavily");
  });

  it("does not route Google Places misses into the Tavily-backed directory fallback", () => {
    expect(shouldFallbackToIndiaDirectories("google_places")).toBe(false);
    expect(shouldFallbackToIndiaDirectories("india_directories")).toBe(false);
    expect(shouldFallbackToIndiaDirectories("tavily_ai")).toBe(true);
  });

  it("backfills Apollo misses from India directories: Apollo has no tier-2 India coverage", () => {
    expect(shouldFallbackToIndiaDirectories("apollo")).toBe(true);
  });

  it("honors an explicitly disabled people provider", () => {
    expect(resolvePeopleSearchProvider("free", "none")).toBe("none");
  });

  it("uses Apollo for paid or auto mode when Apollo is configured", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    expect(resolvePeopleSearchProvider("auto", "tavily_ai")).toBe("apollo");
    vi.unstubAllEnvs();
  });
});
