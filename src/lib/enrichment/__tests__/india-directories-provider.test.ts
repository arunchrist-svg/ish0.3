import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/enrichment/tavily-client", () => {
  class TavilyQuotaError extends Error {}

  return {
    TavilyQuotaError,
    TAVILY_QUOTA_INDIA_DIRECTORIES_MSG:
      "India Directories uses Tavily credits to search Indian directory sites. Switch Company search to Google Places, add another Tavily key, or wait for your monthly reset.",
    isTavilyQuotaError: () => true,
    optimizedMaxResults: (limit: number) => limit,
    tavilySearch: vi.fn(async () => {
      throw new Error("Tavily API quota exceeded");
    }),
  };
});

vi.mock("@/lib/enrichment/tavily-keys", () => ({
  hasTavilyKeys: () => true,
}));

describe("India Directories provider", () => {
  it("returns a provider-specific quota error when Tavily is exhausted", async () => {
    const { indiaDirectoriesSearchCompanies } = await import("@/lib/enrichment/india-directories");

    await expect(
      indiaDirectoriesSearchCompanies({
        cities: ["Bengaluru"],
        industries: ["Technology"],
        limit: 1,
      }),
    ).rejects.toThrow(
      "India Directories uses Tavily credits to search Indian directory sites. Switch Company search to Google Places, add another Tavily key, or wait for your monthly reset.",
    );
  });
});
