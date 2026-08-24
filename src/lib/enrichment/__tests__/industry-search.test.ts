import { describe, expect, it } from "vitest";
import {
  filterBySelectedIndustries,
  industrySearchClause,
  partitionIndustriesForSearch,
} from "@/lib/enrichment/industry-search";

const EIGHTEEN_INDUSTRIES = [
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

describe("partitionIndustriesForSearch", () => {
  it("does not stuff 18 industries into one clause", () => {
    const chunks = partitionIndustriesForSearch(EIGHTEEN_INDUSTRIES);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);
    expect(chunks.flat().sort()).toEqual([...EIGHTEEN_INDUSTRIES].sort());
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(EIGHTEEN_INDUSTRIES.length);
      expect(industrySearchClause(chunk).split(" OR ").length).toBe(chunk.length);
    }
  });

  it("keeps a short industry list as a single query", () => {
    expect(partitionIndustriesForSearch(["Automotive", "Textiles"])).toEqual([
      ["Automotive", "Textiles"],
    ]);
  });
});

describe("filterBySelectedIndustries", () => {
  it("keeps Corporate Places hits on a broad Autopilot industry pick", () => {
    const kept = filterBySelectedIndustries(
      [
        { name: "Salem Mill", industry: "Corporate", city: "Salem", dataSource: "google_places", fitScore: 60 },
        { name: "KKR", industry: "Financial Services", city: "Chennai", dataSource: "tavily+llm", fitScore: 65 },
      ],
      EIGHTEEN_INDUSTRIES,
    );
    expect(kept.map((c) => c.name).sort()).toEqual(["KKR", "Salem Mill"]);
  });

  it("still drops Corporate on a narrow industry pick", () => {
    const kept = filterBySelectedIndustries(
      [
        { name: "Salem Mill", industry: "Corporate", city: "Salem", dataSource: "google_places", fitScore: 60 },
        { name: "TVS", industry: "Automotive", city: "Hosur", dataSource: "tavily+llm", fitScore: 70 },
      ],
      ["Automotive"],
    );
    expect(kept.map((c) => c.name)).toEqual(["TVS"]);
  });
});
