import { describe, expect, it } from "vitest";
import {
  buildRoleTitleHints,
  filterPeopleByRoles,
  isNonSeniorTitle,
  personMatchesRoles,
} from "@/lib/enrichment/people-role-filter";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string }): ScoutPersonResult {
  return {
    emailStatus: "missing",
    isKeyDM: false,
    matchScore: 50,
    dataSource: "test",
    ...partial,
  };
}

describe("isNonSeniorTitle", () => {
  it("keeps Assistant Manager and Associate Director", () => {
    expect(isNonSeniorTitle("Assistant Manager - HR")).toBe(false);
    expect(isNonSeniorTitle("Associate Director")).toBe(false);
  });

  it("drops true junior titles", () => {
    expect(isNonSeniorTitle("HR Intern")).toBe(true);
    expect(isNonSeniorTitle("Junior Executive")).toBe(true);
    expect(isNonSeniorTitle("Administrative Assistant")).toBe(true);
  });
});

describe("filterPeopleByRoles", () => {
  it("falls back to OR when AND finds nobody", () => {
    const people = [
      person({ name: "Asha", title: "HR Manager" }),
      person({ name: "Dev", title: "Software Engineer" }),
    ];
    const result = filterPeopleByRoles(people, ["Director"], ["HR"]);
    expect(result.relaxed).toBe("or");
    expect(result.people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("keeps untitled LinkedIn profiles as valid unknown-title matches", () => {
    const people = [person({ name: "Vikram Patel", linkedIn: "https://linkedin.com/in/vikram" })];
    const result = filterPeopleByRoles(people, ["Director"], ["Procurement"]);
    expect(result.relaxed).toBeNull();
    expect(result.people).toHaveLength(1);
  });

  it("falls back to unfiltered when only junior titles exist", () => {
    const people = [person({ name: "Intern", title: "HR Intern" })];
    const result = filterPeopleByRoles(people, ["Director"], ["HR"]);
    expect(result.relaxed).toBe("unfiltered");
    expect(result.people.map((p) => p.name)).toEqual(["Intern"]);
  });

  it("does not require a title to keep a LinkedIn hit", () => {
    expect(
      personMatchesRoles(
        person({ name: "No Title", linkedIn: "https://linkedin.com/in/x" }),
        ["Manager"],
        ["HR"],
      ),
    ).toBe(true);
  });
});

describe("buildRoleTitleHints", () => {
  it("puts department keywords before generic seniority", () => {
    const hints = buildRoleTitleHints(["Director", "Manager"], ["HR", "Procurement"]);
    expect(hints.indexOf("HR")).toBeLessThan(hints.indexOf("Director"));
    expect(hints.indexOf("Procurement")).toBeLessThan(hints.indexOf("Manager"));
  });
});
