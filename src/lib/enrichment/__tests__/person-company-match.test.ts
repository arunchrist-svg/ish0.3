import { describe, expect, it } from "vitest";
import { parsePeopleFromSearchResults } from "@/lib/enrichment/people-parser";
import {
  currentEmployerFromHeadline,
  entitiesReferToSameCompany,
  hitShowsCurrentEmployment,
  isOpenToWorkProfile,
  operatingEntityFromParentheses,
  personAppearsOnOpenToWorkHit,
  personLooksOpenToWork,
  personTitleConflictsWithCompany,
  specificOperatingEntityFromProfile,
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

  it("rejects a Jindal hospital HR when scouting Trilife Hospital", () => {
    // Regression: "hospital" used to be a brand needle, so any …Hospital profile
    // matched Trilife even when the person works at Manav Charitable / Jindal.
    const title = "Manjunath K | Deputy Manager - Human Resources | LinkedIn";
    const content =
      "Unit HR - Human Resources - Jindal Healthcare - Manav Charitable Hospital. Sep 2025 - Present · Bangalore Urban";
    expect(hitShowsCurrentEmployment({ title, content }, "Trilife Hospital")).toBe(false);
    expect(hitShowsCurrentEmployment({ title, content }, "Jindal Healthcare")).toBe(true);

    const results = parsePeopleFromSearchResults(
      [
        {
          title,
          url: "https://www.linkedin.com/in/manjunath-k-195b7a111",
          content,
        },
      ],
      5,
      "web_heuristic",
      "Trilife Hospital",
    );
    expect(results).toHaveLength(0);
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

  it("rejects a person whose LinkedIn snippet shows the company only in a past date range", () => {
    // Anusha Ramachandra is currently at 3M but her snippet shows Aron Universal with a 2014-2016 range.
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Manager Human Resources | LinkedIn",
          content:
            "Experience\nHuman Resources Manager\n3M · May 2024 - Present · 2 yrs 4 mos\nBengaluru, Karnataka\n\n" +
            "HR Executive\nAron Universal Ltd · Jun 2014 - Jan 2016 · 1 yr 8 mos\nJigani, Bangalore",
        },
        "Aron Universal",
      ),
    ).toBe(false);

    // Sanity: currently-at-3M should still pass when scouting 3M
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Manager Human Resources | LinkedIn",
          content:
            "Human Resources Manager\n3M · May 2024 - Present · 2 yrs 4 mos\nBengaluru, Karnataka",
        },
        "3M",
      ),
    ).toBe(true);
  });

  it("rejects via content current-employer detection when snippet has no date range for past company", () => {
    // Stale Tavily snapshot: title and content show Aron Universal but content also shows 3M as current.
    // The date range for Aron Universal may be absent (truncated snippet) but "3M · Present" is present.
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Manager Human Resources | LinkedIn",
          content: "Human Resources Manager\n3M · May 2024 - Present · 2 yrs 4 mos\nBengaluru\n\nHR Executive\nAron Universal Ltd\nJigani",
        },
        "Aron Universal",
      ),
    ).toBe(false);

    // Content with newline-separated format: "CompanyName\nYear - Present"
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Manager Human Resources | LinkedIn",
          content: "Human Resources Manager\n3M\n2019 - Present\nBengaluru\n\nHR Executive\nAron Universal Ltd\nJigani",
        },
        "Aron Universal",
      ),
    ).toBe(false);

    // Current employee at Aron Universal should still pass
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Ravi Kumar | HR Manager | LinkedIn",
          content: "HR Manager\nAron Universal · 2021 - Present · 4 yrs\nHosur",
        },
        "Aron Universal",
      ),
    ).toBe(true);
  });

  it("rejects Open to Work profiles even when the company is named", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Kiran | HR Team Lead at Titan Company | Open to Work | LinkedIn",
          content: "#OpenToWork  Looking for new opportunities. Previously Titan Company, Hosur.",
        },
        "Titan Company",
      ),
    ).toBe(false);
    expect(isOpenToWorkProfile("Human Resources Manager | OPEN_TO_WORK")).toBe(true);
    expect(isOpenToWorkProfile("HR Manager – Open to work")).toBe(true);
    expect(isOpenToWorkProfile("Human Resources Manager at Autosense")).toBe(false);
    expect(isOpenToWorkProfile("#OPENTOWORK")).toBe(true);
    expect(isOpenToWorkProfile("Purchase Manager #OPENTOWORK Madurai")).toBe(true);
  });

  it("rejects Open to Work even after the title is stripped to Purchase Manager", () => {
    expect(
      personLooksOpenToWork({
        name: "Pandiyarajan S",
        title: "Purchase Manager",
        bio: "#OPENTOWORK",
      }),
    ).toBe(true);
    expect(
      personLooksOpenToWork({
        name: "Pandiyarajan S",
        title: "Purchase Manager",
        bio: "Purchase Manager at a plant in Madurai",
      }),
    ).toBe(false);
  });

  it("drops a clean company-page hit when another snippet marks the same LinkedIn as Open to Work", () => {
    expect(
      personAppearsOnOpenToWorkHit(
        {
          name: "Karthi P",
          linkedIn: "https://www.linkedin.com/in/karthi-p-hr",
        },
        [
          {
            title: "Karthi P | Human Resources Manager at Autosense | LinkedIn",
            url: "https://www.linkedin.com/in/karthi-p-hr",
            content: "Human Resources Manager at Autosense Private Limited",
          },
          {
            title: "Karthi P | Open to Work | LinkedIn",
            url: "https://www.linkedin.com/in/karthi-p-hr",
            content: "#OpenToWork  Human Resources Manager at Autosense",
          },
        ],
      ),
    ).toBe(true);
  });

  it("does not treat another Motor company as TVS Motor", () => {
    const title = "Gowtham Giri | Head of Human Resources | LinkedIn";
    const content =
      "Head of Human Resources\nKMB Motor LLP · Full-time\nAug 2023 – Sep 2024 · 1 yr 2 mos\nVadavalli";
    expect(hitShowsCurrentEmployment({ title, content }, "TVS Motor Company")).toBe(false);

    const currentHeadline =
      "Gowtham Giri | Pricol / Yashaswi Group/HR Operations Specialist | LinkedIn";
    const currentContent =
      "Human Resources Operations Specialist\nYashaswi Group · Full-time\nSep 2024 - Present · 2 yrs\n" +
      "Managed HR operations for Pricol Plant. Previously Head of Human Resources at KMB Motor LLP.";
    expect(currentEmployerFromHeadline(currentHeadline)).toBe("Yashaswi Group");
    expect(hitShowsCurrentEmployment({ title: currentHeadline, content: currentContent }, "TVS Motor Company")).toBe(
      false,
    );

    const results = parsePeopleFromSearchResults(
      [
        {
          title: currentHeadline,
          url: "https://www.linkedin.com/in/gowtham-giri-053b34277/",
          content: currentContent,
        },
      ],
      5,
      "web_heuristic",
      "TVS Motor Company",
    );
    expect(results).toHaveLength(0);
  });

  it("matches short brands like TVS in LinkedIn headlines", () => {
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Priya N | HR at TVS | LinkedIn",
          content: "HR at TVS Motor Company · Hosur, Tamil Nadu, India",
        },
        "TVS Motor Company",
      ),
    ).toBe(true);
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Ravi | HR Manager at HCL | LinkedIn",
          content: "HR Manager at HCLTech, Noida",
        },
        "HCL Technologies",
      ),
    ).toBe(true);
  });

  it("rejects M3M HR when scouting 3M (substring false positive)", () => {
    expect(entitiesReferToSameCompany("M3M", "3M")).toBe(false);
    expect(entitiesReferToSameCompany("M3M India", "3M")).toBe(false);
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Veena Bansal - HR Head - M3M | LinkedIn",
          url: "https://www.linkedin.com/in/veena-bansal-75176112a/",
          content: "HR Head at M3M India Limited · Bengaluru · Present",
        },
        "3M",
      ),
    ).toBe(false);
    expect(
      hitShowsCurrentEmployment(
        {
          title: "Anusha Ramachandra | Human Resources Manager | LinkedIn",
          content:
            "Human Resources Manager\n3M · May 2024 - Present · 2 yrs 4 mos\nBengaluru, Karnataka",
        },
        "3M",
      ),
    ).toBe(true);
  });

  it("flags a Tata Steel title on a Hosur Steel / Jindal account", () => {
    expect(personTitleConflictsWithCompany("Plant Head Tata Steel(Hosur)", "Hosur Steel Industries")).toBe(true);
    expect(personTitleConflictsWithCompany("Plant Head Tata Steel(Hosur)", "Tata Steel")).toBe(false);
    expect(personTitleConflictsWithCompany("Chief Human Resources Officer", "Pavna Industries")).toBe(false);
  });

  it("rejects Nissan Trading India HR on a generic Nissan or Nissan Motor scout", () => {
    const title = "Amit Kumar Patnaik | Head - Human Resources ( Nissan Trading India ) | LinkedIn";
    const content =
      "Head - Human Resources ,General Admin ,IT ( Nissan Trading India)\n" +
      "Nissan Motor Corporation · Full-time\nDec 2008 - Present · 17 yrs 9 mos\nGreater Chennai Area";

    expect(operatingEntityFromParentheses("Head - Human Resources ( Nissan Trading India )")).toBe(
      "Nissan Trading India",
    );
    expect(specificOperatingEntityFromProfile(title, content)).toBe("Nissan Trading India");
    expect(entitiesReferToSameCompany("Nissan Trading India", "Nissan")).toBe(false);
    expect(entitiesReferToSameCompany("Nissan Trading India", "Nissan Motor Corporation")).toBe(false);
    expect(entitiesReferToSameCompany("Nissan Trading India", "Nissan Trading India Pvt Ltd")).toBe(true);
    expect(personTitleConflictsWithCompany(title, "Nissan")).toBe(true);
    expect(personTitleConflictsWithCompany(title, "Nissan Motor Corporation")).toBe(true);
    expect(hitShowsCurrentEmployment({ title, content }, "Nissan")).toBe(false);
    expect(hitShowsCurrentEmployment({ title, content }, "Nissan Motor Corporation")).toBe(false);
    expect(hitShowsCurrentEmployment({ title, content }, "Nissan Trading India")).toBe(true);

    const results = parsePeopleFromSearchResults(
      [{ title, url: "https://www.linkedin.com/in/amit-kumar-patnaik", content }],
      5,
      "web_heuristic",
      "Nissan",
    );
    expect(results).toHaveLength(0);
  });

  it("rejects Sai Lifescience HR when scouting Sai Chemicals (shared weak prefix)", () => {
    const title = "Mehar Babu | Human Resources Manager at Sai Lifescience | LinkedIn";
    const content =
      "Human Resources Manager\nSai Lifescience · Full-time\nAndhra Pradesh, India";

    expect(entitiesReferToSameCompany("Sai Lifescience", "Sai Chemicals")).toBe(false);
    expect(entitiesReferToSameCompany("Sai", "Sai Chemicals")).toBe(false);
    expect(entitiesReferToSameCompany("Sai Chemicals", "Sai Chemicals Pvt Ltd")).toBe(true);
    expect(personTitleConflictsWithCompany(title, "Sai Chemicals")).toBe(true);
    expect(hitShowsCurrentEmployment({ title, content }, "Sai Chemicals")).toBe(false);
    expect(hitShowsCurrentEmployment({ title, content }, "Sai Lifescience")).toBe(true);

    const results = parsePeopleFromSearchResults(
      [{ title, url: "https://www.linkedin.com/in/mehar-babu", content }],
      5,
      "web_heuristic",
      "Sai Chemicals",
    );
    expect(results).toHaveLength(0);
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
