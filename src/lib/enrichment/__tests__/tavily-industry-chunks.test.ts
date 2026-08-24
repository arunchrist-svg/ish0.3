import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/enrichment/tavily-client", () => {
  const calls: string[] = [];
  return {
    tavilySearch: vi.fn(async (query: string) => {
      calls.push(query);
      if (calls.length === 1) {
        return [
          {
            title: "TVS Motor Company Hosur",
            url: "https://example.com/tvs",
            content: "TVS Motor Company is an automotive manufacturer in Hosur.",
          },
        ];
      }
      throw new Error("Tavily API quota exceeded. Upgrade at tavily.com or wait for your monthly credit reset.");
    }),
    isTavilyQuotaError: (msg: string) => /quota|usage limit|432|exhausted/i.test(msg),
    TavilyQuotaError: class TavilyQuotaError extends Error {},
    __calls: calls,
  };
});

vi.mock("@/lib/llm", () => ({
  callLLM: vi.fn(async () => {
    throw new Error("skip llm");
  }),
  hasLLMKey: () => false,
}));

vi.mock("@/lib/enrichment/tavily-keys", () => ({
  hasTavilyKey: () => true,
  hasTavilyKeys: () => true,
  getTavilyKeys: () => ["tvly-test"],
}));

describe("tavilyDiscoverCompanies industry chunking", () => {
  it("keeps companies from earlier chunks when a later chunk hits quota", async () => {
    const { tavilySearchCompanies } = await import("@/lib/enrichment/tavily");
    const industries = [
      "Automotive",
      "Chemicals",
      "Construction",
      "Education",
      "Electronics",
      "Energy",
      "Financial Services",
      "Food Processing",
      "Healthcare",
      "Hospitality",
      "IT Services",
      "Logistics",
      "Manufacturing",
      "Pharmaceuticals",
      "Real Estate",
      "Retail",
      "Textiles",
      "Telecom",
    ];
    const rows = await tavilySearchCompanies({
      cities: ["Hosur", "Salem"],
      industries,
      limit: 10,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => /tvs/i.test(r.name))).toBe(true);
  });
});
