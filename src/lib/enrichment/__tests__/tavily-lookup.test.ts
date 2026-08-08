import { describe, expect, it } from "vitest";
import {
  buildCompanyLookupQuery,
  filterLookupLlmCompanies,
  lookupCompaniesFromHits,
} from "@/lib/enrichment/tavily";
import { parseCompaniesFromDirectoryResults } from "@/lib/enrichment/directory-parser";

const MONEYVIEW_HITS = [
  {
    title: "Moneyview - Personal Loans & Credit in Bengaluru, Karnataka",
    url: "https://www.moneyview.in/",
    content:
      "Moneyview is a fintech company headquartered in Bengaluru, Karnataka. Apply for personal loans online.",
  },
  {
    title: "Companies in Karnataka",
    url: "https://example.com/karnataka-directory",
    content: "This document contains a list of company addresses in Bengaluru, Karnataka including Moneyview.",
  },
];

describe("buildCompanyLookupQuery", () => {
  it("quotes the brand and keeps city as a hint", () => {
    expect(buildCompanyLookupQuery("Moneyview", ["Bengaluru"])).toContain('"Moneyview"');
    expect(buildCompanyLookupQuery("Moneyview", ["Bengaluru"])).not.toMatch(/^Moneyview Bengaluru/);
  });
});

describe("lookupCompaniesFromHits", () => {
  it("returns Moneyview from mixed geo snippets and never Karnataka", () => {
    const results = lookupCompaniesFromHits(MONEYVIEW_HITS, "Moneyview", ["Bengaluru"]);
    expect(results.map((r) => r.name)).toEqual(["Moneyview"]);
    expect(results[0]?.domain).toBe("moneyview.in");
    expect(results.some((r) => /karnataka/i.test(r.name))).toBe(false);
  });

  it("returns empty when the target is not mentioned", () => {
    const results = lookupCompaniesFromHits(
      [{ title: "Karnataka state portal", url: "https://karnataka.gov.in", content: "Official state website" }],
      "Moneyview",
      ["Bengaluru"],
    );
    expect(results).toEqual([]);
  });
});

describe("filterLookupLlmCompanies", () => {
  it("drops geo and unrelated LLM names", () => {
    const mapped = filterLookupLlmCompanies(
      [
        { name: "Karnataka", domain: null, city: "Bengaluru" },
        { name: "India in 2026", domain: null },
        { name: "Whizdm Finance", domain: "moneyview.in", city: "Bengaluru" },
        { name: "SingleStore", domain: "singlestore.com" },
      ],
      "Moneyview",
      5,
    );
    expect(mapped.map((c) => c.name)).toEqual(["Whizdm Finance"]);
  });
});

describe("directory heuristic on the same snippet", () => {
  it("does not emit Karnataka as a company", () => {
    const parsed = parseCompaniesFromDirectoryResults(MONEYVIEW_HITS, ["Bengaluru"], 10);
    expect(parsed.some((c) => /karnataka/i.test(c.name))).toBe(false);
  });
});
