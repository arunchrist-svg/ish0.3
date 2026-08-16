import { describe, expect, it } from "vitest";
import { parsePeopleFromSearchResults } from "@/lib/enrichment/people-parser";
import {
  currentEmployerFromHeadline,
  hitShowsCurrentEmployment,
  personTitleConflictsWithCompany,
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
    expect(
      currentEmployerFromHeadline(
        "Chief Human Resource Officer (CHRO) - Finocontrol | LinkedIn Top Voice | Incharge - Corporate Relations",
      ),
    ).toBe("Finocontrol");
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

  it("rejects Finocontrol CHRO when scouting Harita Fehrer", () => {
    expect(
      currentEmployerFromHeadline(
        "Tejaswee Tripathy | Chief Human Resource Officer (CHRO) - Finocontrol | LinkedIn",
      ),
    ).toBe("Finocontrol");
    expect(
      personTitleConflictsWithCompany(
        "Chief Human Resource Officer (CHRO) - Finocontrol",
        "Harita Fehrer",
      ),
    ).toBe(true);
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Tejaswee Tripathy | Chief Human Resource Officer (CHRO) - Finocontrol | LinkedIn",
          content: "Chief Human Resource Officer (CHRO) - Finocontrol | Gurugram, Haryana, India",
        },
        "Harita Fehrer",
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

  it("flags a Tata Steel title on a Hosur Steel / Jindal account", () => {
    expect(personTitleConflictsWithCompany("Plant Head Tata Steel(Hosur)", "Hosur Steel Industries")).toBe(true);
    expect(personTitleConflictsWithCompany("Plant Head Tata Steel(Hosur)", "Tata Steel")).toBe(false);
    expect(personTitleConflictsWithCompany("Chief Human Resources Officer", "Pavna Industries")).toBe(false);
  });

  it("does not treat department words as rival employers", () => {
    expect(personTitleConflictsWithCompany("Head of Procurement", "Bosch")).toBe(false);
    expect(personTitleConflictsWithCompany("Director - People & Culture", "Wipro")).toBe(false);
    expect(personTitleConflictsWithCompany("Software Engineer", "Wipro")).toBe(false);
    expect(personTitleConflictsWithCompany("VP Human Resources at Infosys", "Infosys")).toBe(false);
    expect(personTitleConflictsWithCompany("HR Director at Peak Performance HR", "Wipro")).toBe(true);
  });

  it("drops Tejaswee Tripathy when scouting Harita Fehrer", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Tejaswee Tripathy | Chief Human Resource Officer (CHRO) - Finocontrol | LinkedIn",
          url: "https://www.linkedin.com/in/tejaswee-tripathy",
          content:
            "Chief Human Resource Officer (CHRO) - Finocontrol | LinkedIn Top Voice | Gurugram, Haryana, India",
        },
      ],
      5,
      "web_heuristic",
      "Harita Fehrer",
    );
    expect(results).toHaveLength(0);
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
    expect(personLocationMatchesSelection("New York City Metropolitan Area", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("Hosur, Tamil Nadu", ["Hosur"])).toBe(true);
  });

  it("drops other Indian cities and empty location on a district pick", () => {
    expect(personLocationMatchesSelection("Delhi, India", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("New Delhi", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("Mumbai", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("", ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection(null, ["Hosur"])).toBe(false);
    expect(personLocationMatchesSelection("India", ["Hosur"])).toBe(false);
  });
});
