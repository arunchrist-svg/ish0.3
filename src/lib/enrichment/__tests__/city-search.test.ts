import { describe, expect, it } from "vitest";
import {
  citySearchClause,
  companyCityMatchesSelection,
  expandCitySearchTerms,
  isForeignPersonLocation,
  isNationwideSelection,
  personLocationMatchesSelection,
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
  it("does not fill a plant-city scout with people from other Indian cities", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Meera", location: "Bengaluru, Karnataka", matchScore: 80 },
        { name: "Arjun", location: "Delhi, India", matchScore: 70 },
        { name: "Priya", location: "New Delhi", matchScore: 65 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(false);
    expect(result.people).toHaveLength(0);
  });

  it("still drops clearly foreign people", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Christine", location: "Greater Tampa Bay Area", matchScore: 60 },
        { name: "Crystal", location: "New York City Metropolitan Area", matchScore: 90 },
      ],
      ["Hosur"],
    );
    expect(result.people).toHaveLength(0);
  });

  it("drops empty locations on a district pick", () => {
    const result = selectPeopleForScoutCities(
      [{ name: "Unknown", location: null, matchScore: 90 }],
      ["Hosur"],
    );
    expect(result.people).toHaveLength(0);
  });

  it("prefers people in the selected city when any match", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Hosur, Tamil Nadu", matchScore: 70 },
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
        { name: "North", location: "Delhi, India", matchScore: 85 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(false);
    expect(result.people.map((p) => p.name)).toEqual(["Local"]);
  });

  it("keeps both cities when the scout selected both", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Hosur, Tamil Nadu", matchScore: 70 },
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
      ],
      ["Hosur", "Bengaluru"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["HQ", "Local"]);
  });

  it("does not treat NYC abbreviations or empty location as a Hosur match", () => {
    expect(isForeignPersonLocation("NYC")).toBe(true);
    expect(isForeignPersonLocation("Manhattan, NY")).toBe(true);
    expect(personLocationMatchesSelection("NYC", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("New York City", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("Delhi", ["Hosur", "Bengaluru"])).toBe(false);
  });
});
