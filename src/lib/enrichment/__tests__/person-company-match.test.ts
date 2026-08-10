import { describe, expect, it } from "vitest";
import { parsePeopleFromSearchResults } from "@/lib/enrichment/people-parser";
import {
  currentEmployerFromHeadline,
  hitShowsCurrentEmployment,
} from "@/lib/enrichment/person-company-match";
import {
  isForeignPersonLocation,
  personLocationMatchesSelection,
} from "@/lib/enrichment/city-search";

describe("current employer matching", () => {
  it("reads the company after at or the last headline segment", () => {
    expect(currentEmployerFromHeadline("Priya Sharma | HR Director at Titan Company | LinkedIn")).toBe(
      "Titan Company",
    );
    expect(
      currentEmployerFromHeadline(
        "Christine Grebenc - Freelance Human Resources Consultant - Peak Performance HR Florida | LinkedIn",
      ),
    ).toBe("Peak Performance HR Florida");
  });

  it("rejects a different current employer even if Titan appears in the snippet", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title:
            "Christine Grebenc - Freelance Human Resources Consultant - Peak Performance HR Florida | LinkedIn",
          content: "Mentioned Titan Company in a comment thread.",
        },
        "Titan Company Ltd",
      ),
    ).toBe(false);
  });

  it("rejects former employees of the target company", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Ravi Kumar | Former HR Head at Titan Company | LinkedIn",
          content: "Previously led HR at Titan Company Limited, Hosur.",
        },
        "Titan Company",
      ),
    ).toBe(false);
  });

  it("keeps people currently at the target company", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Meera Iyer | Plant HR Manager at Titan Company Ltd | LinkedIn",
          content: "Based in Hosur. HR leader at Titan Company.",
        },
        "Titan Company",
      ),
    ).toBe(true);
  });
});

describe("parsePeopleFromSearchResults company filter", () => {
  it("drops Christine Grebenc when scouting Titan", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title:
            "Christine Grebenc - Freelance Human Resources Consultant - Peak Performance HR Florida | LinkedIn",
          url: "https://www.linkedin.com/in/christine-grebenc/",
          content: "Greater Tampa Bay Area. Freelance Human Resources Consultant.",
        },
      ],
      5,
      "web_heuristic",
      "Titan Company Ltd",
    );
    expect(results).toHaveLength(0);
  });

  it("keeps a Titan Hosur HR profile", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Meera Iyer | Plant HR Manager at Titan Company Ltd | LinkedIn",
          url: "https://www.linkedin.com/in/meera-iyer-titan",
          content: "Plant HR Manager at Titan Company, Hosur, Tamil Nadu.",
        },
      ],
      5,
      "web_heuristic",
      "Titan Company Ltd",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Meera Iyer");
  });

  it("extracts Greater Tampa Bay Area from the headline", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Christine Grebenc | HR Consultant | Greater Tampa Bay Area | LinkedIn",
          url: "https://www.linkedin.com/in/christine-grebenc/",
          content: "",
        },
      ],
      5,
    );
    expect(results[0]?.location).toBe("Greater Tampa Bay Area");
  });
});

describe("foreign person locations", () => {
  it("flags US locations", () => {
    expect(isForeignPersonLocation("Greater Tampa Bay Area")).toBe(true);
    expect(isForeignPersonLocation("Tampa, Florida")).toBe(true);
    expect(isForeignPersonLocation("Hosur, Tamil Nadu")).toBe(false);
  });

  it("drops US people when scouting Indian cities", () => {
    expect(personLocationMatchesSelection("Greater Tampa Bay Area", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("Hosur, Tamil Nadu", ["Hosur"])).toBe(true);
  });
});
