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
});
