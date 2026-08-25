import { describe, expect, it } from "vitest";
import { filterPeopleByRoles } from "@/lib/enrichment/people-role-filter";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string }): ScoutPersonResult {
  return {
    name: partial.name,
    title: partial.title,
    department: partial.department,
    seniority: partial.seniority,
    emailStatus: "missing",
    dataSource: "test",
  };
}

describe("strictPeopleFilters role match", () => {
  it("does not relax Director+HR to Plant HR Manager when strict", () => {
    const people = [
      person({ name: "Meera", title: "Plant HR Manager", department: "HR" }),
      person({ name: "Ravi", title: "HR Director", department: "HR" }),
    ];
    const strict = filterPeopleByRoles(people, ["Director"], ["HR"], { strict: true });
    expect(strict.relaxed).toBe(false);
    expect(strict.people.map((p) => p.name)).toEqual(["Ravi"]);
  });

  it("smart mode still accepts Plant HR Manager when no Director exists", () => {
    const people = [person({ name: "Meera", title: "Plant HR Manager", department: "HR" })];
    const smart = filterPeopleByRoles(people, ["Director"], ["HR"]);
    expect(smart.people.map((p) => p.name)).toContain("Meera");
    expect(smart.relaxed).toBe(true);
  });

  it("returns empty instead of untitled fallback when strict", () => {
    const people = [person({ name: "Blank" })];
    const strict = filterPeopleByRoles(people, ["Director"], ["HR"], { strict: true });
    expect(strict.people).toEqual([]);
  });
});
