import { describe, expect, it, vi } from "vitest";
import { checkDiscoveryPrerequisites } from "@/lib/enrichment/discovery-prerequisites";
import { resolveEnrichmentConfig } from "@/lib/enrichment/config";

function clearTavilyEnv() {
  for (const name of Object.keys(process.env)) {
    if (/^TAVILY_API_KEY(?:_\d+)?$/.test(name)) vi.stubEnv(name, "");
  }
  vi.stubEnv("TAVILY_API_KEYS", "");
}

describe("company discovery prerequisites", () => {
  it("explains that India Directories requires Tavily and names Places as the alternative", () => {
    clearTavilyEnv();

    const errors = checkDiscoveryPrerequisites(
      resolveEnrichmentConfig("free", { searchProvider: "india_directories" }),
    );

    expect(errors).toContain(
      "India Directories uses Tavily to search Indian directory sites. Add a Tavily key or switch Company search to Google Places.",
    );
  });

  it("keeps explicit Tavily and Google Places provider semantics separate", () => {
    clearTavilyEnv();

    const tavilyErrors = checkDiscoveryPrerequisites(
      resolveEnrichmentConfig("free", { searchProvider: "tavily_ai" }),
    );
    const placesErrors = checkDiscoveryPrerequisites(
      resolveEnrichmentConfig("free", { searchProvider: "google_places" }),
    );

    expect(tavilyErrors[0]).toMatch(/TAVILY_API_KEY is missing/i);
    expect(placesErrors.some((error) => /TAVILY_API_KEY|India Directories/i.test(error))).toBe(false);
  });

  it("does not require Tavily for Agentic Places + Apollo stack", () => {
    clearTavilyEnv();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-key");
    vi.stubEnv("APOLLO_API_KEY", "apollo-key");

    const errors = checkDiscoveryPrerequisites(
      resolveEnrichmentConfig("free", {
        searchProvider: "agentic_ai",
        agenticDataStack: "places_apollo",
        peopleSearchProvider: "apollo",
      }),
    );

    expect(errors.some((error) => /Tavily/i.test(error))).toBe(false);
    vi.unstubAllEnvs();
  });

  it("requires Places and Apollo keys for Agentic Places + Apollo", () => {
    clearTavilyEnv();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("APOLLO_API_KEY", "");

    const errors = checkDiscoveryPrerequisites(
      resolveEnrichmentConfig("free", {
        searchProvider: "agentic_ai",
        agenticDataStack: "places_apollo",
        peopleSearchProvider: "apollo",
      }),
    );

    expect(errors.some((error) => /GOOGLE_PLACES_API_KEY/i.test(error))).toBe(true);
    expect(errors.some((error) => /APOLLO_API_KEY/i.test(error))).toBe(true);
    vi.unstubAllEnvs();
  });
});
