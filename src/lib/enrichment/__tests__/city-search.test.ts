import { describe, expect, it } from "vitest";
import {
  citySearchClause,
  companyCityMatchesSelection,
  expandCitySearchTerms,
  isNationwideSelection,
  selectPeopleForScoutCities,
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

describe("selectPeopleForScoutCities", () => {
  it("keeps India HQ DMs when the scout city is a plant location", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Meera", location: "Bengaluru, Karnataka", matchScore: 80 },
        { name: "Arjun", location: "Chennai, Tamil Nadu", matchScore: 70 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Meera", "Arjun"]);
  });

  it("still drops clearly foreign people", () => {
    const result = selectPeopleForScoutCities(
      [{ name: "Christine", location: "Greater Tampa Bay Area", matchScore: 60 }],
      ["Hosur"],
    );
    expect(result.people).toHaveLength(0);
  });

  it("prefers people in the selected city when any match", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Hosur, Tamil Nadu", matchScore: 70 },
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(false);
    expect(result.people.map((p) => p.name)).toEqual(["Local"]);
  });
});
