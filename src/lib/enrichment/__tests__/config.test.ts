import { describe, expect, it, vi } from "vitest";
import {
  defaultPeopleSearchProvider,
  resolveEnrichmentConfig,
  resolvePeopleSearchProvider,
  searchProviderUsesTavily,
  configUsesTavilyForCompanies,
  shouldFallbackToIndiaDirectories,
  resolveSearchProviderWithReason,
  describeProviderChoice,
  SEARCH_PROVIDER_LABELS,
  applyAgenticScoutDefaults,
  isAgenticLeadFinding,
  isAgenticSearchProvider,
  materializeDiscoveryConfig,
  resolveAiOperatingMode,
  resolveAgenticDataStack,
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

  it("keeps company and people provider defaults separate", () => {
    expect(defaultPeopleSearchProvider("google_places")).toBe("tavily_ai");
    expect(defaultPeopleSearchProvider("india_directories")).toBe("tavily_ai");
    expect(defaultPeopleSearchProvider("agentic_ai")).toBe("tavily_ai");
    expect(defaultPeopleSearchProvider("apollo")).toBe("apollo");
  });

  it("makes the India provider's Tavily dependency explicit without changing provider routing", () => {
    expect(searchProviderUsesTavily("india_directories")).toBe(true);
    expect(searchProviderUsesTavily("agentic_ai")).toBe(true);
    expect(searchProviderUsesTavily("tavily_ai")).toBe(true);
    expect(searchProviderUsesTavily("google_places")).toBe(false);
    expect(searchProviderUsesTavily("apollo")).toBe(false);
    expect(SEARCH_PROVIDER_LABELS.india_directories.label).toBe("India + Tavily");
    expect(SEARCH_PROVIDER_LABELS.agentic_ai.label).toBe("Agentic AI");
  });

  it("does not route Google Places misses into the Tavily-backed directory fallback", () => {
    expect(shouldFallbackToIndiaDirectories("google_places")).toBe(false);
    expect(shouldFallbackToIndiaDirectories("india_directories")).toBe(false);
    expect(shouldFallbackToIndiaDirectories("tavily_ai")).toBe(true);
  });

  it("backfills Apollo misses from India directories: Apollo has no tier-2 India coverage", () => {
    expect(shouldFallbackToIndiaDirectories("apollo")).toBe(true);
  });

  it("reports when auto mode upgrades the configured provider to Apollo", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const choice = resolveSearchProviderWithReason("auto", "india_directories");
    expect(choice).toEqual({
      provider: "apollo",
      configured: "india_directories",
      reason: "auto_upgraded_apollo",
    });
    expect(describeProviderChoice(choice)).toContain("upgraded from India + Tavily");
  });

  it("reports paid-mode upgrades separately from auto", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    expect(resolveSearchProviderWithReason("paid", "google_places").reason).toBe(
      "paid_upgraded_apollo",
    );
  });

  it("leaves the provider alone in free mode, or with no Apollo key", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    expect(resolveSearchProviderWithReason("free", "india_directories")).toEqual({
      provider: "india_directories",
      configured: "india_directories",
      reason: "configured",
    });
    vi.stubEnv("APOLLO_API_KEY", "");
    expect(resolveSearchProviderWithReason("auto", "india_directories").reason).toBe("configured");
  });

  it("does not claim an upgrade when Apollo was the configured provider", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const choice = resolveSearchProviderWithReason("auto", "apollo");
    expect(choice.reason).toBe("configured");
    expect(describeProviderChoice(choice)).toBe("Using Apollo.io.");
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

describe("agentic AI lead finding", () => {
  it("treats Agentic AI company search as the lead-finding engine", () => {
    expect(isAgenticSearchProvider("agentic_ai")).toBe(true);
    expect(isAgenticLeadFinding({ searchProvider: "agentic_ai" })).toBe(true);
    expect(isAgenticLeadFinding({ searchProvider: "google_places" })).toBe(false);
    expect(resolveAiOperatingMode(undefined, "agentic_ai")).toBe("agentic");
    expect(resolveEnrichmentConfig(undefined, { searchProvider: "agentic_ai" }).aiOperatingMode).toBe(
      "agentic",
    );
  });

  it("locks India-friendly quality defaults for Agentic Scout discovery", () => {
    const locked = applyAgenticScoutDefaults(
      resolveEnrichmentConfig("free", {
        searchProvider: "agentic_ai",
        peopleSearchProvider: "none",
        fallbackToAI: false,
        enrichOnImport: false,
      }),
    );
    expect(locked.aiOperatingMode).toBe("agentic");
    expect(locked.agenticDataStack).toBe("tavily_directories");
    expect(locked.searchProvider).toBe("india_directories");
    expect(locked.peopleSearchProvider).toBe("tavily_ai");
    expect(locked.fallbackToAI).toBe(true);
    expect(locked.enrichOnImport).toBe(true);
    expect(locked.dataMode).toBe("auto");
    expect(locked.strictPeopleFilters).toBe(false);
  });

  it("materializes Places + Apollo Agentic stack without Tavily", () => {
    const locked = applyAgenticScoutDefaults(
      resolveEnrichmentConfig("free", {
        searchProvider: "agentic_ai",
        agenticDataStack: "places_apollo",
        peopleSearchProvider: "tavily_ai",
        fallbackToAI: true,
      }),
    );
    expect(locked.agenticDataStack).toBe("places_apollo");
    expect(locked.searchProvider).toBe("google_places");
    expect(locked.peopleSearchProvider).toBe("apollo");
    expect(locked.fallbackToAI).toBe(false);
    expect(locked.strictPeopleFilters).toBe(false);
    expect(configUsesTavilyForCompanies({ searchProvider: "agentic_ai", agenticDataStack: "places_apollo" })).toBe(
      false,
    );
    expect(configUsesTavilyForCompanies({ searchProvider: "agentic_ai", agenticDataStack: "tavily_directories" })).toBe(
      true,
    );
  });

  it("keeps Agentic AI selected in Settings without Apollo upgrade", () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const config = resolveEnrichmentConfig("auto", { searchProvider: "agentic_ai" });
    expect(config.searchProvider).toBe("agentic_ai");
    expect(resolveAgenticDataStack(config.agenticDataStack)).toBe("tavily_directories");
    expect(materializeDiscoveryConfig(config).searchProvider).toBe("india_directories");
    const places = resolveEnrichmentConfig("auto", {
      searchProvider: "agentic_ai",
      agenticDataStack: "places_apollo",
    });
    expect(materializeDiscoveryConfig(places).searchProvider).toBe("google_places");
    vi.unstubAllEnvs();
  });
});
