import { describe, expect, it } from "vitest";
import {
  citySearchClause,
  companyCityMatchesSelection,
  expandCitySearchTerms,
  includeHqCorridorForScoutPeople,
  isForeignPersonLocation,
  isNationwideSelection,
  nearbyLabelsForScoutCities,
  personLocationMatchesSelection,
  selectPeopleForLeadLocation,
  selectPeopleForScoutCities,
} from "@/lib/enrichment/city-search";

describe("nearbyLabelsForScoutCities", () => {
  it("opens the Hosur corridor to Bengaluru HQ without Delhi", () => {
    const nearby = nearbyLabelsForScoutCities(["Hosur"]);
    expect(nearby).toEqual(expect.arrayContaining(["Hosur", "Bengaluru", "Bangalore", "Krishnagiri"]));
    expect(nearby).not.toContain("Delhi");
    expect(nearbyLabelsForScoutCities(["Krishnagiri"])).toEqual(
      expect.arrayContaining(["Bengaluru", "Bangalore"]),
    );
    expect(nearbyLabelsForScoutCities(["Ramanagara"])).toEqual(
      expect.arrayContaining(["Ramanagara", "Bengaluru", "Bangalore"]),
    );
  });

  it("expands Focus Area neighborhoods to their parent metro", () => {
    expect(nearbyLabelsForScoutCities(["Kasturi Nagar", "Ramamurthy Nagar"])).toEqual(
      expect.arrayContaining(["Kasturi Nagar", "Ramamurthy Nagar", "Bengaluru", "Bangalore"]),
    );
    expect(includeHqCorridorForScoutPeople({ cities: ["Kasturi Nagar"], locationScope: "focus" })).toBe(true);
    expect(includeHqCorridorForScoutPeople({ cities: ["Hosur"], locationScope: "focus" })).toBe(true);
    expect(includeHqCorridorForScoutPeople({ cities: ["Hosur"], locationScope: "interest" })).toBe(true);
  });

  it("keeps the corridor closed for local-business scouts", () => {
    expect(includeHqCorridorForScoutPeople({ cities: ["Hosur"], localOperators: true })).toBe(false);
    expect(
      includeHqCorridorForScoutPeople({ cities: ["Kasturi Nagar"], localOperators: true }),
    ).toBe(false);
  });
});

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

  it("puts Bengaluru first when many Focus Area chips would otherwise fill the cap", () => {
    const chips = [
      "Kasturi Nagar",
      "Banaswadi",
      "Old Madras Road",
      "Baiyappanahalli",
      "CV Raman Nagar",
      "Ramamurthy Nagar",
      "Indiranagar",
      "Hebbal",
    ];
    const clause = citySearchClause(chips, 6);
    expect(clause.startsWith("Bengaluru")).toBe(true);
    expect(clause).toContain("Bangalore");
    expect(clause).toContain("Kasturi Nagar");
  });
});

describe("selectPeopleForScoutCities", () => {
  it("keeps nearby Bengaluru HQ for a Hosur plant, and still drops Delhi", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Meera", location: "Bengaluru, Karnataka", matchScore: 80 },
        { name: "Arjun", location: "Delhi, India", matchScore: 70 },
        { name: "Priya", location: "New Delhi", matchScore: 65 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Meera"]);
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

  it("keeps unknown locations when no city or nearby match exists", () => {
    const result = selectPeopleForScoutCities(
      [{ name: "Unknown", location: null, matchScore: 90 }],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Unknown"]);
  });

  it("keeps Bangalore HQ together with Hosur plant people and still drops Delhi", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Hosur, Tamil Nadu", matchScore: 70 },
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
        { name: "North", location: "Delhi, India", matchScore: 85 },
      ],
      ["Hosur"],
    );
    expect(result.relaxedToIndia).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Local", "HQ"]);
  });

  it("keeps Titan Head of HR in Bangalore on a Hosur plant fetch", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "PlantIC", location: "Hosur, Tamil Nadu", matchScore: 40 },
        { name: "Asha", location: "Bangalore, Karnataka", matchScore: 88 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 95 },
      ],
      ["Hosur"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["PlantIC", "Asha"]);
  });

  it("keeps parent-metro leads for a neighborhood scout but ranks the local one first", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
        { name: "Local", location: "Kasturi Nagar, Bengaluru", matchScore: 70 },
        { name: "IndiaHQ", location: "Mumbai, Maharashtra", matchScore: 85 },
      ],
      ["Kasturi Nagar"],
    );
    // Profiles say "Bengaluru", never "Kasturi Nagar", so the metro must stay eligible.
    expect(result.people.map((p) => p.name)).toEqual(["Local", "HQ"]);
  });

  it("drops Bangalore HQ when includeHqCorridor is off even for Hosur", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Hosur, Tamil Nadu", matchScore: 70 },
        { name: "HQ", location: "Bengaluru, Karnataka", matchScore: 90 },
      ],
      ["Hosur"],
      { includeHqCorridor: false },
    );
    expect(result.people.map((p) => p.name)).toEqual(["Local"]);
  });

  it("keeps Bengaluru HQ HR for a Ramanagara plant fetch", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Narendra", location: "Bengaluru, Karnataka", matchScore: 80 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 95 },
      ],
      ["Ramanagara"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Narendra"]);
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

  it("keeps Kasturi Nagar and Banaswadi people, not Bengaluru-only HQ or other metros", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "Kasturi", location: "Kasturi Nagar, Bengaluru", matchScore: 80 },
        { name: "Banas", location: "Banaswadi", matchScore: 70 },
        { name: "BioLocal", location: "Bengaluru", bio: "Works out of Kasturi Nagar", matchScore: 60 },
        { name: "AliasLocal", location: "Kasturinagar", matchScore: 55 },
        { name: "HQ", location: "Bengaluru", matchScore: 90 },
        { name: "BangKarnataka", location: "Bengaluru, Karnataka", matchScore: 88 },
        { name: "BangaloreOnly", location: "Bangalore", matchScore: 85 },
        { name: "Whitefield", location: "Whitefield, Bengaluru", matchScore: 75 },
        { name: "Delhi", location: "Delhi", matchScore: 50 },
        { name: "Empty", location: "", matchScore: 40 },
        { name: "Untitled", location: null, matchScore: 40 },
        { name: "OpenToWork", location: "Bengaluru", bio: "Open to Work", matchScore: 35 },
      ],
      ["Kasturi Nagar", "Banaswadi"],
      { includeHqCorridor: false },
    );
    expect(result.people.map((p) => p.name).sort()).toEqual(["AliasLocal", "Banas", "BioLocal", "Kasturi"]);
    expect(result.relaxedToIndia).toBe(false);
  });

  it("still keeps Bangalore HQ for a Hosur plant when Focus Area is off", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "PlantIC", location: "Hosur, Tamil Nadu", matchScore: 40 },
        { name: "Asha", location: "Bangalore, Karnataka", matchScore: 88 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 95 },
      ],
      ["Hosur"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["PlantIC", "Asha"]);
  });
});

describe("selectPeopleForLeadLocation plant corridor", () => {
  it("keeps Hosur and Bangalore HQ for a Ramanagara scout, not Chennai or the US", () => {
    const result = selectPeopleForLeadLocation(
      [
        { name: "HosurHR", location: "Hosur, Tamil Nadu", matchScore: 80 },
        { name: "BangaloreHR", location: "Bengaluru, Karnataka", matchScore: 90 },
        { name: "ChennaiHR", location: "Chennai, Tamil Nadu", matchScore: 90 },
        { name: "USHR", location: "New York City", matchScore: 95 },
      ],
      ["Ramanagara"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["BangaloreHR"]);
  });
});

describe("selectPeopleForScoutCities vague-location fallback", () => {
  it("keeps blank-location HR people when no strict city match for a Hosur plant scout", () => {
    // LinkedIn often omits plant city — blank location must not discard buyer-role people.
    const result = selectPeopleForScoutCities(
      [
        { name: "NoCity", location: "", matchScore: 70 },
        { name: "IndiaOnly", location: "India", matchScore: 60 },
        { name: "Karnataka", location: "Karnataka", matchScore: 55 },
        { name: "Delhi", location: "New Delhi", matchScore: 90 },
      ],
      ["Hosur"],
    );
    expect(result.people.map((p) => p.name)).toEqual(expect.arrayContaining(["NoCity", "IndiaOnly", "Karnataka"]));
    expect(result.people.map((p) => p.name)).not.toContain("Delhi");
    expect(result.relaxedToIndia).toBe(true);
  });

  it("keeps strict city match over vague fallback when match exists", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "PlantHR", location: "Hosur, Tamil Nadu", matchScore: 80 },
        { name: "NoCity", location: "", matchScore: 70 },
        { name: "IndiaOnly", location: "India", matchScore: 60 },
      ],
      ["Hosur"],
    );
    // Strict match exists → use strict result only, not the vague fallback.
    expect(result.people.map((p) => p.name)).toContain("PlantHR");
    expect(result.relaxedToIndia).toBe(false);
  });

  it("does NOT apply vague fallback for neighborhood Focus Area scouts", () => {
    // Kasturi Nagar is a neighborhood — unknown city should NOT be relaxed.
    const result = selectPeopleForScoutCities(
      [
        { name: "Local", location: "Kasturi Nagar, Bengaluru", matchScore: 80 },
        { name: "NoCity", location: "", matchScore: 70 },
        { name: "IndiaOnly", location: "India", matchScore: 60 },
      ],
      ["Kasturi Nagar"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Local"]);
    expect(result.relaxedToIndia).toBe(false);
  });

  it("still drops foreign locations even in vague fallback mode", () => {
    const result = selectPeopleForScoutCities(
      [
        { name: "USPerson", location: "New York City", matchScore: 90 },
        { name: "DelhiHR", location: "New Delhi", matchScore: 80 },
        { name: "NoCity", location: "", matchScore: 50 },
      ],
      ["Hosur"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["NoCity"]);
    expect(result.people.map((p) => p.name)).not.toContain("USPerson");
    expect(result.people.map((p) => p.name)).not.toContain("DelhiHR");
  });
});
