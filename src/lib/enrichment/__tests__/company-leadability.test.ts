import { describe, expect, it } from "vitest";
import {
  assessLeadabilityFromPeople,
  applyLeadability,
  probeCompanyLeadability,
  sortCompaniesByLeadability,
} from "@/lib/enrichment/company-leadability";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string; title?: string }): ScoutPersonResult {
  return {
    name: partial.name,
    title: partial.title,
    department: partial.department,
    seniority: partial.seniority,
    location: partial.location,
    dataSource: partial.dataSource ?? "test",
    emailStatus: "missing",
  };
}

function company(partial: Partial<ScoutCompanyResult> & { name: string }): ScoutCompanyResult {
  return {
    name: partial.name,
    city: partial.city,
    fitScore: partial.fitScore,
    domain: partial.domain,
    website: partial.website,
    dataSource: partial.dataSource ?? "test",
  };
}

describe("assessLeadabilityFromPeople", () => {
  it("scores exact in-corridor matches as high", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [
        person({ name: "Asha", title: "HR Director", location: "Bangalore, Karnataka" }),
        person({ name: "Meera", title: "Head of HR", location: "Hosur, Tamil Nadu" }),
      ],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Hosur"],
    });
    expect(leadability.leadabilityBand).toBe("high");
    expect(leadability.leadabilityMatchedInCity).toBe(2);
    expect(leadability.leadabilityScore).toBeGreaterThanOrEqual(80);
  });

  it("does not treat Chennai as in-city for a Ramanagara plant scout", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [person({ name: "Kiran", title: "HR Director", location: "Chennai, Tamil Nadu" })],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Ramanagara"],
    });
    expect(leadability.leadabilityMatchedPeople).toBe(1);
    expect(leadability.leadabilityMatchedInCity).toBe(0);
  });

  it("does not reward wrong seniority when both filters are selected", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [person({ name: "Ravi", title: "Plant HR Manager", location: "Hosur, Tamil Nadu" })],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Hosur"],
    });
    expect(leadability.leadabilityBand).toBe("low");
    expect(leadability.leadabilityMatchedInCity).toBe(1);
    expect(leadability.leadabilityScore).toBeLessThan(45);
  });

  it("keeps off-corridor exact matches below in-corridor matches", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [person({ name: "Asha", title: "HR Director", location: "New Delhi" })],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Hosur"],
    });
    expect(leadability.leadabilityBand).toBe("medium");
    expect(leadability.leadabilityMatchedPeople).toBe(1);
    expect(leadability.leadabilityMatchedInCity).toBe(0);
  });

  it("counts parent-metro HQ as in-city for a Focus Area neighborhood", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [person({ name: "Asha", title: "HR Director", location: "Bengaluru, Karnataka" })],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Kasturi Nagar"],
      locationScope: "focus",
    });
    expect(leadability.leadabilityMatchedPeople).toBe(1);
    // LinkedIn profiles resolve to the metro, so a strict locality gate scores every
    // Focus Area company as unleadable.
    expect(leadability.leadabilityMatchedInCity).toBe(1);
  });

  it("still excludes a far metro for a neighborhood Focus Area", () => {
    const leadability = assessLeadabilityFromPeople({
      people: [person({ name: "Asha", title: "HR Director", location: "New Delhi" })],
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Kasturi Nagar", "Banaswadi"],
      locationScope: "focus",
    });
    expect(leadability.leadabilityMatchedInCity).toBe(0);
  });
});

describe("probeCompanyLeadability", () => {
  it("uses the company corridor and exact-role scoring on probe results", async () => {
    const leadability = await probeCompanyLeadability({
      company: company({ name: "Titan Company", domain: "titancompany.in" }),
      seniority: ["Director"],
      departments: ["HR"],
      cities: ["Hosur"],
      searchPeople: async () => [
        person({ name: "Asha", title: "HR Director", location: "Bangalore, Karnataka", dataSource: "probe" }),
      ],
    });
    expect(leadability.leadabilityBand).toBe("high");
    expect(leadability.leadabilityMatchedInCity).toBe(1);
    expect(leadability.leadabilityProbeSource).toBe("probe");
  });
});

describe("sortCompaniesByLeadability", () => {
  it("sorts by leadability first, then fit score", () => {
    const ranked = sortCompaniesByLeadability([
      applyLeadability(company({ name: "Fit Only", fitScore: 95 }), {
        leadabilityScore: 0,
        leadabilityBand: "unknown",
        leadabilityMatchedPeople: 0,
        leadabilityMatchedInCity: 0,
      }),
      applyLeadability(company({ name: "Leadable", fitScore: 70 }), {
        leadabilityScore: 84,
        leadabilityBand: "high",
        leadabilityMatchedPeople: 1,
        leadabilityMatchedInCity: 1,
      }),
      applyLeadability(company({ name: "Tie Breaker", fitScore: 80 }), {
        leadabilityScore: 84,
        leadabilityBand: "high",
        leadabilityMatchedPeople: 1,
        leadabilityMatchedInCity: 1,
      }),
    ]);
    expect(ranked.map((item) => item.name)).toEqual(["Tie Breaker", "Leadable", "Fit Only"]);
  });
});
