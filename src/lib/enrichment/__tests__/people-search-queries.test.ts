import { describe, expect, it } from "vitest";
import {
  buildOpenToWorkDenylistQueries,
  buildPeopleSearchQueries,
  buildNaturalLinkedInPeopleQueries,
  companyPeopleSearchNames,
  companyPeopleSearchTokens,
  dropOpenToWorkPeople,
  HQ_BUYER_ROLE_TERM,
  HQ_LINKEDIN_ROLE_TERM,
  OPEN_TO_WORK_EXCLUSION,
} from "@/lib/enrichment/people-search";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

describe("companyPeopleSearchNames", () => {
  it("expands Titan to Titan Company for LinkedIn search", () => {
    expect(companyPeopleSearchNames("Titan")[0]).toBe("Titan Company");
    expect(companyPeopleSearchNames("Titan")).toContain("Titan");
  });

  it("includes SBI shorthand for State Bank of India", () => {
    expect(companyPeopleSearchTokens("State Bank of India")).toEqual(
      expect.arrayContaining(["SBI", "State Bank of India"]),
    );
  });
});

describe("buildNaturalLinkedInPeopleQueries", () => {
  it("builds Google-style locality + bank + role linkedin queries", () => {
    const queries = buildNaturalLinkedInPeopleQueries({
      company: "State Bank of India",
      localities: ["Kasturi Nagar"],
      roleHints: ["Branch Manager"],
    });
    expect(queries).toEqual(
      expect.arrayContaining([
        `Kasturi Nagar SBI Branch Manager linkedin ${OPEN_TO_WORK_EXCLUSION}`,
        `site:linkedin.com/in Kasturi Nagar SBI Branch Manager ${OPEN_TO_WORK_EXCLUSION}`,
      ]),
    );
  });
});

describe("buildPeopleSearchQueries", () => {
  it("query 1 is LinkedIn Head of HR with Bangalore on a Hosur fetch", () => {
    const queries = buildPeopleSearchQueries({
      company: "Titan Company",
      roleTerm: "Director OR Head OR VP",
      cityClause: "Hosur OR Bengaluru OR Bangalore",
      companyDomain: "titancompany.in",
      hasCityFilter: true,
      companyAliases: ["Titan"],
    });

    expect(queries[0]).toBe(
      `site:linkedin.com/in "Titan Company" (${HQ_LINKEDIN_ROLE_TERM}) (Hosur OR Bengaluru OR Bangalore) ${OPEN_TO_WORK_EXCLUSION}`,
    );
    expect(queries[0]).toContain("Head of HR");
    expect(queries[0]).toContain("HR Director");
    expect(queries[0]).toContain("CHRO");
    expect(queries[0]).toContain("Bengaluru");
    expect(queries[0]).toContain("Bangalore");
    expect(queries[0]).toContain("Hosur");
    expect(queries[1]).toBe(
      `site:linkedin.com/in "Titan Company" (${HQ_LINKEDIN_ROLE_TERM}) India ${OPEN_TO_WORK_EXCLUSION}`,
    );
    expect(queries.some((q) => q.includes("titancompany.in"))).toBe(true);
    expect(queries.some((q) => /Director OR Head OR VP OR CEO/.test(q))).toBe(false);
  });

  it("never searches bare Director/VP/CEO as a fill-in query", () => {
    const queries = buildPeopleSearchQueries({
      company: "Titan Company",
      roleTerm: HQ_BUYER_ROLE_TERM,
      cityClause: "India",
      hasCityFilter: false,
    });
    expect(queries.join("\n")).not.toMatch(/Director OR Head OR VP OR CEO/);
    expect(queries[0]).toContain("site:linkedin.com/in");
    expect(queries[0]).toContain("Head of HR");
  });

  it("finds SMB HR contacts after the short LinkedIn HQ query", () => {
    const queries = buildPeopleSearchQueries({
      company: "Sansu Automotives",
      roleTerm: "HR Manager OR HR Director",
      cityClause: "Ramanagara OR Bengaluru OR Bangalore",
      hasCityFilter: true,
    });
    expect(queries[0]).toBe(
      `site:linkedin.com/in "Sansu Automotives" (${HQ_LINKEDIN_ROLE_TERM}) (Ramanagara OR Bengaluru OR Bangalore) ${OPEN_TO_WORK_EXCLUSION}`,
    );
    expect(queries).toContain(
      `"Sansu Automotives" (${HQ_BUYER_ROLE_TERM}) (Ramanagara OR Bengaluru OR Bangalore)`,
    );
  });

  it("searches branch managers for Businesses instead of Head of HR", () => {
    const queries = buildPeopleSearchQueries({
      company: "HDFC Bank Kasturi Nagar",
      roleTerm: '"Branch Manager" OR "Chief Manager" OR "Cluster Head" OR Manager',
      cityClause: "Kasturi Nagar",
      hasCityFilter: true,
      localOperators: true,
    });
    expect(queries[0]).toContain("Branch Manager");
    expect(queries.join("\n")).not.toContain("Head of HR");
    expect(queries.join("\n")).not.toContain("CHRO");
    expect(queries.join("\n")).not.toMatch(/\bIndia\b/);
  });

  it("restricts Focus Area queries to selected neighborhoods without HQ Head of HR", () => {
    const queries = buildPeopleSearchQueries({
      company: "Bosch",
      roleTerm: "HR Manager OR Director",
      cityClause: "Kasturi Nagar OR Ramamurthy Nagar",
      hasCityFilter: true,
      restrictToArea: true,
    });
    expect(queries[0]).toContain("Kasturi Nagar");
    expect(queries.join("\n")).not.toContain("Head of HR");
    expect(queries.join("\n")).not.toContain("CHRO");
    expect(queries.join("\n")).not.toMatch(/\bIndia\b/);
  });

  it("restrictToArea stays on the locality clause and skips India-wide fallback", () => {
    const queries = buildPeopleSearchQueries({
      company: "HDFC Bank",
      roleTerm: '"Head of HR" OR "HR Director"',
      cityClause: "Kasturi Nagar OR Banaswadi",
      hasCityFilter: true,
      restrictToArea: true,
    });
    const blob = queries.join("\n");
    expect(blob).not.toMatch(/\bIndia\b/);
    expect(queries[0]).toContain("Kasturi Nagar OR Banaswadi");
    expect(queries.every((q) => q.includes("(Kasturi Nagar OR Banaswadi)"))).toBe(true);
  });

  it("excludes Open to Work from LinkedIn queries", () => {
    const queries = buildPeopleSearchQueries({
      company: "Titan Company",
      roleTerm: HQ_BUYER_ROLE_TERM,
      cityClause: "India",
      hasCityFilter: false,
    });
    expect(queries[0]).toContain("-#OPENTOWORK");
  });
});

function person(overrides: Partial<ScoutPersonResult>): ScoutPersonResult {
  return {
    name: "Manikandan R",
    title: "HR - Executive - Talent Acquisition",
    emailStatus: "missing",
    dataSource: "tavily+llm",
    ...overrides,
  } as ScoutPersonResult;
}

describe("buildOpenToWorkDenylistQueries", () => {
  it("targets the company and each candidate LinkedIn slug", () => {
    const queries = buildOpenToWorkDenylistQueries({
      company: "Renault Nissan",
      people: [
        { name: "Manikandan R", linkedIn: "https://www.linkedin.com/in/manikandan-r-123" },
        { name: "Priya S", linkedIn: null },
      ],
    });
    expect(queries[0]).toBe('site:linkedin.com/in "Renault Nissan" (#OPENTOWORK OR "Open to Work" OR OPEN_TO_WORK)');
    expect(queries.some((q) => q.includes("linkedin.com/in/manikandan-r-123"))).toBe(true);
    expect(queries.some((q) => q.includes('"Priya S" linkedin'))).toBe(true);
  });

  it("caps profile queries", () => {
    const queries = buildOpenToWorkDenylistQueries({
      company: "Renault Nissan",
      people: Array.from({ length: 9 }, (_, i) => ({
        name: `Person ${i}`,
        linkedIn: `https://www.linkedin.com/in/person-${i}`,
      })),
      maxProfileQueries: 3,
    });
    expect(queries).toHaveLength(4);
  });
});

describe("dropOpenToWorkPeople", () => {
  it("drops a clean-title person when a denylist hit for the same LinkedIn URL says #OPENTOWORK", () => {
    const candidate = person({ linkedIn: "https://www.linkedin.com/in/manikandan-r-123" });
    const kept = dropOpenToWorkPeople(
      [candidate],
      [
        {
          title: "Manikandan R - Open to Work",
          url: "https://www.linkedin.com/in/manikandan-r-123",
          content: "#OPENTOWORK seeking new opportunities",
        },
      ],
    );
    expect(kept).toHaveLength(0);
  });

  it("keeps a person with no denylist hit", () => {
    const candidate = person({ linkedIn: "https://www.linkedin.com/in/manikandan-r-123" });
    const kept = dropOpenToWorkPeople(
      [candidate],
      [
        {
          title: "Someone Else - Open to Work",
          url: "https://www.linkedin.com/in/someone-else",
          content: "#OPENTOWORK",
        },
      ],
    );
    expect(kept).toEqual([candidate]);
  });
});
