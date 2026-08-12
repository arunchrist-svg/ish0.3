import { describe, expect, it } from "vitest";
import { filterPeopleByRoles, personMatchesRoles } from "@/lib/enrichment/people-role-filter";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string; title?: string }): ScoutPersonResult {
  return {
    name: partial.name,
    title: partial.title,
    department: partial.department,
    seniority: partial.seniority,
    dataSource: "test",
    emailStatus: "missing",
  };
}

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
  it("relaxes to department matches when nobody hits both filters", () => {
    const people = [
      person({ name: "Meera", title: "Plant HR Manager" }),
      person({ name: "Arjun", title: "Finance Director" }),
    ];
    const result = filterPeopleByRoles(people, ["Director"], ["HR"]);
    expect(result.relaxed).toBe(true);
    expect(result.people.map((p) => p.name)).toEqual(["Meera"]);
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
});
