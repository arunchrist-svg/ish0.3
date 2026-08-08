import { describe, expect, it } from "vitest";
import {
  citySearchBatches,
  citySearchClause,
  companyCityMatchesSelection,
  expandCitySearchTerms,
  isNationwideSelection,
  primaryCitiesForSearch,
  rankCompaniesByFitAndDiversity,
} from "@/lib/enrichment/city-search";

const KA12 = [
  "Bengaluru",
  "Mysore",
  "Mangalore",
  "Hubli",
  "Tumkur",
  "Hassan",
  "Belgaum",
  "Davanagere",
  "Shimoga",
  "Bellary",
  "Udupi",
  "Hosur",
];

describe("companyCityMatchesSelection", () => {
  it("matches Hyderabad companies when Telangana is selected", () => {
    expect(companyCityMatchesSelection("Hyderabad", ["Telangana"])).toBe(true);
    expect(companyCityMatchesSelection("Hyderabad, Telangana", ["Telangana"])).toBe(true);
    expect(companyCityMatchesSelection("Secunderabad", ["Telangana"])).toBe(true);
  });

  it("rejects cities outside the selected state", () => {
    expect(companyCityMatchesSelection("Bengaluru", ["Telangana"])).toBe(false);
    expect(companyCityMatchesSelection("Mumbai", ["Telangana", "Andhra Pradesh"])).toBe(false);
  });

  it("matches region selections", () => {
    expect(companyCityMatchesSelection("Hyderabad", ["South India"])).toBe(true);
    expect(companyCityMatchesSelection("Bengaluru", ["South India"])).toBe(true);
    expect(companyCityMatchesSelection("Jaipur", ["South India"])).toBe(false);
  });

  it("does not over-filter Entire India", () => {
    expect(isNationwideSelection(["Entire India"])).toBe(true);
    expect(companyCityMatchesSelection("Pune", ["Entire India"])).toBe(true);
    expect(companyCityMatchesSelection("India", ["Entire India"])).toBe(true);
    expect(companyCityMatchesSelection("", ["Entire India"])).toBe(true);
  });

  it("keeps unknown city when the selection is a state", () => {
    expect(companyCityMatchesSelection("", ["Telangana"])).toBe(true);
    expect(companyCityMatchesSelection("India", ["Telangana"])).toBe(true);
  });

  it("still requires a city match for district picks", () => {
    expect(companyCityMatchesSelection("", ["Hyderabad"])).toBe(false);
    expect(companyCityMatchesSelection("Hyderabad", ["Hyderabad"])).toBe(true);
  });
});

describe("expandCitySearchTerms", () => {
  it("puts Hyderabad in the Telangana query clause", () => {
    const terms = expandCitySearchTerms(["Telangana"]);
    expect(terms[0]).toBe("Telangana");
    expect(terms).toContain("Hyderabad");
    expect(citySearchClause(["Telangana"])).toContain("Hyderabad");
    expect(citySearchClause(["Telangana"])).not.toContain("Adilabad");
  });
});

describe("citySearchClause multi-city", () => {
  it("round-robins unique cities instead of Bengaluru aliases", () => {
    const clause = citySearchClause(KA12);
    expect(clause).toContain("Hubli");
    expect(clause).toContain("Mysore");
    expect(clause).not.toMatch(/Bengaluru OR Bangalore OR Bengaluru Urban/i);
    const bengaluruMentions = clause.split(" OR ").filter((t) => /bengaluru|bangalore/i.test(t));
    expect(bengaluruMentions.length).toBeLessThanOrEqual(1);
  });

  it("covers Hosur in the second search batch", () => {
    expect(primaryCitiesForSearch(KA12)).toEqual(KA12);
    const batches = citySearchBatches(KA12);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toContain("Hubli");
    expect(batches.flat()).toContain("Hosur");
    expect(citySearchClause(batches[1])).toContain("Hosur");
  });
});

describe("rankCompaniesByFitAndDiversity", () => {
  it("keeps higher fitScore first", () => {
    const ranked = rankCompaniesByFitAndDiversity(
      [
        { name: "Low", city: "Bengaluru", fitScore: 40 },
        { name: "High", city: "Bengaluru", fitScore: 90 },
      ],
      ["Bengaluru"],
      2,
    );
    expect(ranked.map((c) => c.name)).toEqual(["High", "Low"]);
  });

  it("is not Bengaluru-only when other cities score", () => {
    const ranked = rankCompaniesByFitAndDiversity(
      [
        { name: "Hikal", city: "Bengaluru", fitScore: 90 },
        { name: "MEX", city: "Bengaluru", fitScore: 80 },
        { name: "IoD", city: "Bengaluru", fitScore: 70 },
        { name: "TVS", city: "Hosur", fitScore: 75 },
        { name: "Infy", city: "Mysore", fitScore: 60 },
      ],
      ["Bengaluru", "Hosur", "Mysore"],
      3,
    );
    const cities = ranked.map((c) => c.city);
    expect(ranked[0]?.name).toBe("Hikal");
    expect(cities.some((c) => c !== "Bengaluru")).toBe(true);
    expect(cities).toContain("Hosur");
  });
});
