import { describe, expect, it } from "vitest";
import {
  citySearchClause,
  companyCityMatchesSelection,
  expandCitySearchTerms,
  isNationwideSelection,
} from "@/lib/enrichment/city-search";

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
