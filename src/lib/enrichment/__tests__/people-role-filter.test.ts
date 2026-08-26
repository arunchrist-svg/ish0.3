import { describe, expect, it } from "vitest";
import {
  assessPeopleFetchRisk,
  buildRoleTitleHints,
  filterPeopleByRoles,
  inferRoleFromTitle,
  isFestivalBuyerRole,
  peopleAndFilterWarning,
  personMatchesRoles,
} from "@/lib/enrichment/people-role-filter";
import { hasPlantCitySelection, selectPeopleForScoutCities } from "@/lib/enrichment/city-search";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string; title?: string }): ScoutPersonResult {
  return {
    name: partial.name,
    title: partial.title,
    department: partial.department,
    seniority: partial.seniority,
    bio: partial.bio,
    linkedIn: partial.linkedIn,
    dataSource: "test",
    emailStatus: "missing",
  };
}

describe("isFestivalBuyerRole", () => {
  it("accepts HR Manager and above", () => {
    expect(isFestivalBuyerRole("HR Manager")).toBe(true);
    expect(isFestivalBuyerRole("HR Director")).toBe(true);
    expect(isFestivalBuyerRole("Head of HR")).toBe(true);
    expect(isFestivalBuyerRole("CHRO")).toBe(true);
    expect(isFestivalBuyerRole("CPO")).toBe(true);
    expect(isFestivalBuyerRole("Chief People Officer")).toBe(true);
    expect(isFestivalBuyerRole("Plant HR Manager")).toBe(true);
    expect(isFestivalBuyerRole("People Manager")).toBe(true);
    expect(isFestivalBuyerRole("HR and payroll personnel")).toBe(true);
    expect(isFestivalBuyerRole("Plant HR")).toBe(true);
    // "HR Executive" / "HR Officer" are common SME titles in India — they ARE the gift DM.
    expect(isFestivalBuyerRole("HR Executive")).toBe(true);
    expect(isFestivalBuyerRole("HR Officer")).toBe(true);
    // Plain "HR" with no seniority hint is too vague to accept.
    expect(isFestivalBuyerRole("HR")).toBe(false);
  });

  it("accepts Procurement and Admin buyers", () => {
    expect(isFestivalBuyerRole("Procurement Manager")).toBe(true);
    expect(isFestivalBuyerRole("Purchase Manager")).toBe(true);
    expect(isFestivalBuyerRole("Procurement Head")).toBe(true);
    expect(isFestivalBuyerRole("Admin Manager")).toBe(true);
    expect(isFestivalBuyerRole("Facilities Manager")).toBe(true);
  });

  it("rejects Finance Director, CTO, VP Operations", () => {
    expect(isFestivalBuyerRole("Finance Director")).toBe(false);
    expect(isFestivalBuyerRole("CTO")).toBe(false);
    expect(isFestivalBuyerRole("VP Operations")).toBe(false);
    expect(isFestivalBuyerRole("Software Engineer")).toBe(false);
    expect(isFestivalBuyerRole("CEO")).toBe(false);
  });

  it("rejects Team Lead titles", () => {
    expect(isFestivalBuyerRole("HR Team Lead")).toBe(false);
    expect(isFestivalBuyerRole("HR Intern")).toBe(false);
  });

  it("rejects untitled / null", () => {
    expect(isFestivalBuyerRole(null)).toBe(false);
    expect(isFestivalBuyerRole("")).toBe(false);
  });
});

describe("personMatchesRoles", () => {
  it("requires both seniority and department when both filters are set", () => {
    expect(
      personMatchesRoles(person({ name: "Asha", title: "HR Director" }), ["Director"], ["HR"]),
    ).toBe(true);
    expect(
      personMatchesRoles(person({ name: "Ravi", title: "Plant HR Manager" }), ["Director"], ["HR"]),
    ).toBe(false);
  });

  it("drops sales managers and labeling engineers for HR or Procurement filters", () => {
    expect(
      personMatchesRoles(
        person({ name: "Mohan", title: "Regional Sales Manager at Taurus" }),
        ["Manager"],
        ["HR"],
      ),
    ).toBe(false);
    expect(
      personMatchesRoles(
        person({ name: "Ram", title: "Senior Project Manager" }),
        ["Manager"],
        ["HR"],
      ),
    ).toBe(false);
    expect(
      personMatchesRoles(person({ name: "Juby", title: "Labeling Engineer" }), ["Manager"], ["HR"]),
    ).toBe(false);
  });
});

describe("filterPeopleByRoles", () => {
  it("keeps HR Director or Procurement Head before other Directors", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Meera", title: "Plant HR Manager" }),
        person({ name: "Kiran", title: "HR Team Lead" }),
        person({ name: "Arjun", title: "Finance Director" }),
        person({ name: "Asha", title: "HR Director" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result.relaxed).toBe(false);
    expect(result.people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("keeps Plant HR Manager when no HR Director exists (buyer-dept relaxation)", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Meera", title: "Plant HR Manager" }),
        person({ name: "Kiran", title: "HR Team Lead" }),
        person({ name: "Arjun", title: "Finance Director" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    // Meera is a valid buyer (HR Manager). Finance Director is NOT.
    expect(result.relaxed).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Meera"]);
  });

  it("keeps public SMB HR contacts without a Manager title", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Narendra Y K", title: "HR and payroll personnel" }),
        person({ name: "Arjun", title: "Finance Director" }),
      ],
      ["Manager", "Director"],
      ["HR", "Procurement"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Narendra Y K"]);
  });

  it("keeps Procurement Manager when no HR Director or Procurement Director exists", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Raj", title: "Procurement Manager" }),
        person({ name: "Arjun", title: "Finance Director" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result.relaxed).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Raj"]);
  });

  it("does NOT fall back to Finance Director or VP Operations when no buyer-dept person exists", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Arjun", title: "Finance Director" }),
        person({ name: "Neha", title: "VP Operations" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result.people).toHaveLength(0);
    expect(result.relaxed).toBe(false);
  });

  it("stage 4 catches Payroll Manager when dept keywords do not match HR/Procurement/Admin/Facilities", () => {
    // "Payroll Manager" passes isFestivalBuyerRole (payroll = buyer dept, manager = senior)
    // but fails stage 2 personMatchesRoles dept checks since "payroll" is not in HR/Procurement/Admin/Facilities keywords.
    const result = filterPeopleByRoles(
      [
        person({ name: "Sunita", title: "Payroll Manager" }),
        person({ name: "Arjun", title: "Finance Director" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Sunita"]);
    expect(result.relaxed).toBe(true);
  });

  it("stage 4 still rejects Finance Director, CTO, and CEO even as final fallback", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Raj", title: "Finance Director" }),
        person({ name: "Sanjay", title: "Chief Technology Officer" }),
        person({ name: "Priya", title: "CEO" }),
      ],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result.people).toHaveLength(0);
    expect(result.relaxed).toBe(false);
  });

  it("does NOT fall back to CEO when no buyer-dept person exists", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Raj", title: "CEO" }),
        person({ name: "Meera", title: "HR Manager" }),
      ],
      ["Director"],
      ["Procurement"],
    );
    // Meera is HR (not Procurement), Raj is CEO (no buyer dept). Only Procurement asked.
    // HR Manager would only match if HR dept is in the filter.
    // With HR+Procurement filter:
    const result2 = filterPeopleByRoles(
      [person({ name: "Raj", title: "CEO" })],
      ["Director"],
      ["HR", "Procurement"],
    );
    expect(result2.people).toHaveLength(0);
  });

  it("keeps Bangalore HQ Head of HR for a Hosur scout after city filter", () => {
    const people = [
      { ...person({ name: "Meera", title: "Plant HR Manager" }), location: "Hosur, Tamil Nadu" },
      { ...person({ name: "Asha", title: "Head of HR" }), location: "Bangalore, Karnataka" },
      { ...person({ name: "Kiran", title: "HR Team Lead" }), location: "Hosur, Tamil Nadu" },
      { ...person({ name: "DelhiCHRO", title: "CHRO" }), location: "New Delhi" },
      { ...person({ name: "NYC", title: "CHRO" }), location: "New York City" },
      { ...person({ name: "Seeker", title: "HR Director | Open to Work" }), location: "Bengaluru" },
    ];
    const roles = filterPeopleByRoles(people, ["Director"], ["HR", "Procurement"]);
    expect(roles.people.map((p) => p.name)).toEqual(["Asha"]);
    const city = selectPeopleForScoutCities(roles.people, ["Hosur"]);
    expect(city.people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("keeps a Hosur Plant HR Manager and drops a Bangalore Finance Director", () => {
    const people = [
      { ...person({ name: "Meera", title: "Plant HR Manager" }), location: "Hosur, Tamil Nadu" },
      { ...person({ name: "Arjun", title: "Finance Director" }), location: "Bangalore, Karnataka" },
    ];
    const roles = filterPeopleByRoles(people, ["Director"], ["HR", "Procurement"]);
    expect(roles.people.map((p) => p.name)).toEqual(["Meera"]);
    const city = selectPeopleForScoutCities(roles.people, ["Hosur"]);
    expect(city.people.map((p) => p.name)).toEqual(["Meera"]);
  });

  it("drops a Finance Director in Bangalore — not a buyer-dept relaxation for Hosur", () => {
    const people = [
      { ...person({ name: "Arjun", title: "Finance Director" }), location: "Bangalore, Karnataka" },
      { ...person({ name: "Kiran", title: "HR Team Lead" }), location: "Hosur, Tamil Nadu" },
    ];
    const roles = filterPeopleByRoles(people, ["Director"], ["HR", "Procurement"]);
    // Finance Director is not a buyer. HR Team Lead is dropped. Result = empty.
    expect(roles.people).toHaveLength(0);
    // City filter: nothing to filter.
    const city = selectPeopleForScoutCities(roles.people, ["Hosur"]);
    expect(city.people).toHaveLength(0);
  });

  it("drops Delhi CHRO when only buyer in Hosur corridor is a Finance Director", () => {
    const people = [
      { ...person({ name: "DelhiCHRO", title: "CHRO" }), location: "New Delhi" },
      { ...person({ name: "Arjun", title: "Finance Director" }), location: "Hosur, Tamil Nadu" },
    ];
    const roles = filterPeopleByRoles(people, ["Director"], ["HR", "Procurement"]);
    // CHRO is a buyer-dept role (HR). Stage 3 catches CHRO.
    // Finance Director in Hosur does not pass any buyer stage.
    expect(roles.people.map((p) => p.name)).toEqual(["DelhiCHRO"]);
    // City filter: Delhi drops.
    const city = selectPeopleForScoutCities(roles.people, ["Hosur"]);
    expect(city.people).toHaveLength(0);
  });

  it("drops Open to Work even when the title was wiped and only a hashtag remains", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Pandiyarajan S", title: "Purchase Manager", bio: "#OPENTOWORK" }),
        person({ name: "Asha", title: "HR Director" }),
      ],
      [],
      [],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("drops Team Leads even with no People chips", () => {
    const result = filterPeopleByRoles(
      [person({ name: "Kiran", title: "HR Team Lead" }), person({ name: "Asha", title: "HR Director" })],
      [],
      [],
    );
    expect(result.people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("keeps untitled contacts for non-waterfall department filters", () => {
    const people = [
      person({ name: "Ravi", title: "Regional Sales Manager" }),
      person({ name: "Deepa" }),
    ];
    const result = filterPeopleByRoles(people, [], ["Marketing"]);
    expect(result.relaxed).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Deepa"]);
  });

  it("keeps the strict match when someone hits both filters", () => {
    const people = [
      person({ name: "Meera", title: "Plant HR Manager" }),
      person({ name: "Kavya", title: "HR Director" }),
    ];
    const result = filterPeopleByRoles(people, ["Director"], ["HR"]);
    expect(result.relaxed).toBe(false);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]?.name).toBe("Kavya");
  });

  it("keeps a Kasturi Nagar Branch Manager and drops a Mumbai CHRO", () => {
    const people = [
      { ...person({ name: "Ravi", title: "Branch Manager" }), location: "Kasturi Nagar, Bengaluru" },
      { ...person({ name: "Neha", title: "CHRO" }), location: "Mumbai" },
      person({ name: "Kiran", title: "Team Lead" }),
    ];
    const result = filterPeopleByRoles(people, ["Director"], ["HR", "Procurement"], {
      searchKind: "business",
      businesses: ["Banks"],
    });
    expect(result.people.map((p) => p.name)).toEqual(["Ravi"]);
  });

  it("keeps a school Principal and drops Team Lead", () => {
    const result = filterPeopleByRoles(
      [
        person({ name: "Anitha", title: "Principal" }),
        person({ name: "Kiran", title: "Team Lead" }),
        person({ name: "Asha", title: "Head of HR" }),
      ],
      [],
      [],
      { searchKind: "business", businesses: ["Schools"] },
    );
    expect(result.people.map((p) => p.name)).toEqual(["Anitha"]);
  });
});

describe("assessPeopleFetchRisk", () => {
  it("does not confirm plant-city VP or C-Level risk when Businesses is on", () => {
    const risk = assessPeopleFetchRisk({
      companyCount: 4,
      cities: ["Ramanagara"],
      seniority: ["Director", "VP", "C-Level"],
      departments: ["HR", "Procurement", "Marketing"],
      searchKind: "business",
      businesses: ["Banks"],
    });
    expect(risk.needsConfirm).toBe(false);
    expect(peopleAndFilterWarning(["Director", "VP"], ["HR", "Procurement"], ["Ramanagara"], { searchKind: "business" })).toBeNull();
  });

  it("does not confirm plant-city VP or C-Level risk when Focus Area is on", () => {
    const risk = assessPeopleFetchRisk({
      companyCount: 4,
      cities: ["Ramanagara"],
      seniority: ["Director", "VP", "C-Level"],
      departments: ["HR", "Procurement", "Marketing"],
      locationScope: "focus",
    });
    expect(risk.needsConfirm).toBe(false);
    expect(risk.headline).not.toMatch(/plant-city/i);
    expect(
      peopleAndFilterWarning(
        ["Director", "VP", "C-Level"],
        ["HR", "Procurement", "Marketing"],
        ["Ramanagara"],
        undefined,
        "focus",
      ),
    ).toBeNull();
  });

  it("flags plant-city VP or C-Level buyer stacks before credits are spent", () => {
    const risk = assessPeopleFetchRisk({
      companyCount: 4,
      cities: ["Ramanagara"],
      seniority: ["Director", "VP", "C-Level"],
      departments: ["HR", "Procurement", "Marketing"],
    });
    expect(risk.needsConfirm).toBe(true);
    expect(risk.headline).toMatch(/0 leads/i);
    expect(risk.emptyRiskLine).toMatch(/Manager or Director/i);
    expect(risk.costLine).toContain("4 people search credits");
    expect(risk.suggestedFilters).toEqual({
      seniority: ["Manager", "Director"],
      departments: ["HR", "Procurement"],
    });
    expect(risk.suggestionLine).toContain("Manager + Director");
  });

  it("keeps the buyer waterfall relaxed for plant cities without VP or C-Level filters", () => {
    const risk = assessPeopleFetchRisk({
      companyCount: 4,
      cities: ["Ramanagara"],
      seniority: ["Director"],
      departments: ["HR", "Procurement"],
    });
    expect(risk.needsConfirm).toBe(false);
    expect(peopleAndFilterWarning(["Director"], ["HR", "Procurement"], ["Ramanagara"])).toBeNull();
  });

  it("does not confirm when only one filter stack is set", () => {
    expect(
      assessPeopleFetchRisk({
        companyCount: 10,
        seniority: ["Director", "Manager"],
        departments: [],
      }).needsConfirm,
    ).toBe(false);
    expect(peopleAndFilterWarning(["Director"], [])).toBeNull();
  });

  it("does not treat Director plus HR as a stacked AND confirm", () => {
    expect(
      assessPeopleFetchRisk({
        companyCount: 10,
        seniority: ["Director"],
        departments: ["HR", "Procurement"],
      }).needsConfirm,
    ).toBe(false);
    expect(peopleAndFilterWarning(["Director"], ["HR"])).toBeNull();
  });

  it("requires confirm when seniority and department are both set", () => {
    const risk = assessPeopleFetchRisk({
      companyCount: 10,
      seniority: ["Manager"],
      departments: ["Marketing", "Operations", "Admin"],
    });
    expect(risk.needsConfirm).toBe(true);
    expect(risk.stacked).toBe(true);
    expect(risk.headline).toMatch(/0 leads/i);
    expect(risk.costLine).toContain("10 people search credits");
    expect(peopleAndFilterWarning(["Manager"], ["Marketing"])).toMatch(/AND department/);
  });
});

describe("hasPlantCitySelection", () => {
  it("detects industrial plant-city labels used in scouting", () => {
    expect(hasPlantCitySelection(["Ramanagara"])).toBe(true);
    expect(hasPlantCitySelection(["Hosur"])).toBe(true);
    expect(hasPlantCitySelection(["Bengaluru"])).toBe(false);
  });
});

describe("buildRoleTitleHints", () => {
  it("keeps Procurement in LinkedIn terms instead of filling the query with HR only", () => {
    const hints = buildRoleTitleHints(["Director"], ["HR", "Procurement"]);
    expect(hints).toContain("HR Director");
    expect(hints).toContain("Procurement Head");
    expect(hints.indexOf("HR Director")).toBeLessThan(hints.indexOf("Procurement Head"));
  });

  it("includes Manager-level buyer titles so Plant HR Managers appear in search", () => {
    const hints = buildRoleTitleHints(["Director"], ["HR", "Procurement"]);
    expect(hints).toContain("HR Manager");
    expect(hints).toContain("Procurement Manager");
  });

  it("does NOT include bare Director/VP/CEO in buyer-dept hints", () => {
    const hints = buildRoleTitleHints(["Director"], ["HR", "Procurement"]);
    // These bare terms pull Finance Directors and CTOs
    expect(hints).not.toContain("Director");
    expect(hints).not.toContain("VP");
    expect(hints).not.toContain("CEO");
  });

  it("uses branch manager titles when Businesses is on", () => {
    const hints = buildRoleTitleHints(["Director"], ["HR"], { searchKind: "business", businesses: ["Banks"] });
    expect(hints[0]).toBe("Branch Manager");
    expect(hints).toContain("Chief Manager");
    expect(hints).not.toContain("Head of HR");
    expect(hints).not.toContain("CHRO");
  });
});

describe("HR department filters", () => {
  it("drops HR interns even when seniority chips are empty", () => {
    expect(
      personMatchesRoles(person({ name: "Intern", title: "HR Intern" }), [], ["HR"]),
    ).toBe(false);
  });

  it("drops Team Leads even when they sit in HR or People", () => {
    expect(
      personMatchesRoles(person({ name: "Kiran", title: "HR Team Lead" }), ["Director"], ["HR"]),
    ).toBe(false);
    expect(
      personMatchesRoles(person({ name: "Kiran", title: "People Team Lead" }), [], ["HR", "Procurement"]),
    ).toBe(false);
    expect(
      personMatchesRoles(person({ name: "Kiran", title: "Team Lead" }), [], []),
    ).toBe(false);
    expect(
      personMatchesRoles(person({ name: "Asha", title: "Head of HR" }), ["Director"], ["HR"]),
    ).toBe(true);
  });
});

describe("inferRoleFromTitle", () => {
  it("fills department and seniority from titled people", () => {
    expect(inferRoleFromTitle("Director HR")).toEqual({ department: "HR", seniority: "Director" });
    expect(inferRoleFromTitle("Manager HR")).toEqual({ department: "HR", seniority: "Manager" });
    expect(inferRoleFromTitle("Head of Procurement")).toEqual({
      department: "Procurement",
      seniority: "Head",
    });
  });

  it("returns nothing when there is no title to infer from", () => {
    expect(inferRoleFromTitle(undefined)).toEqual({});
    expect(inferRoleFromTitle("")).toEqual({});
  });
});
