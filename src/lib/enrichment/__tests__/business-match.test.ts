import { describe, expect, it } from "vitest";
import {
  companyMatchesScoutBusiness,
  filterBySelectedBusinesses,
  placeTypesMatchScoutBusiness,
} from "@/lib/enrichment/business-match";

describe("companyMatchesScoutBusiness", () => {
  it("keeps schools and colleges by name", () => {
    expect(companyMatchesScoutBusiness({ name: "Delhi Public School" }, "Schools")).toBe(true);
    expect(companyMatchesScoutBusiness({ name: "St Joseph's College" }, "Colleges")).toBe(true);
    expect(companyMatchesScoutBusiness({ name: "Christ University" }, "Universities")).toBe(true);
  });

  it("drops a kati roll shop from Schools/Colleges", () => {
    const kati = { name: "Kolkata Famous Kati Roll", industry: "Hospitality" };
    expect(companyMatchesScoutBusiness(kati, "Schools")).toBe(false);
    expect(companyMatchesScoutBusiness(kati, "Colleges")).toBe(false);
    expect(
      filterBySelectedBusinesses([kati, { name: "National Public School" }], ["Schools", "Colleges"]),
    ).toEqual([{ name: "National Public School" }]);
  });

  it("keeps Education industry for school chips when the name is ambiguous", () => {
    expect(
      companyMatchesScoutBusiness({ name: "Greenfield Learning Centre", industry: "Education" }, "Schools"),
    ).toBe(true);
  });
});

describe("placeTypesMatchScoutBusiness", () => {
  it("rejects restaurant types for Schools", () => {
    expect(placeTypesMatchScoutBusiness(["restaurant", "food", "point_of_interest"], "Schools")).toBe(
      false,
    );
    expect(placeTypesMatchScoutBusiness(["school", "establishment"], "Schools")).toBe(true);
  });
});
