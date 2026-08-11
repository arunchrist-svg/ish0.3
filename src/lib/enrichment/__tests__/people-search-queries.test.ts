import { describe, expect, it } from "vitest";
import { buildPeopleSearchQueries, companyPeopleSearchNames } from "@/lib/enrichment/people-search";

describe("companyPeopleSearchNames", () => {
  it("expands Titan to Titan Company for LinkedIn search", () => {
    expect(companyPeopleSearchNames("Titan")[0]).toBe("Titan Company");
    expect(companyPeopleSearchNames("Titan")).toContain("Titan");
  });
});

describe("buildPeopleSearchQueries", () => {
  it("always includes an India-wide LinkedIn query before the plant city", () => {
    const queries = buildPeopleSearchQueries({
      company: "Titan Company",
      roleTerm: "Director OR Manager OR HR",
      cityClause: "Hosur OR Krishnagiri",
      companyDomain: "titancompany.in",
      hasCityFilter: true,
      companyAliases: ["Titan"],
    });

    expect(queries[0]).toContain('site:linkedin.com/in "Titan Company"');
    expect(queries[0]).toContain("India");
    expect(queries[0]).not.toContain("Hosur");
    expect(queries.some((q) => q.includes("Hosur"))).toBe(true);
    expect(queries.some((q) => q.includes("titancompany.in"))).toBe(true);
    expect(queries.some((q) => q.includes('"Titan"'))).toBe(true);
  });
});
