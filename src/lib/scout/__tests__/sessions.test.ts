import { describe, expect, it } from "vitest";
import {
  buildScoutSessionTitle,
  capScoutSessionCompanies,
  capScoutSessionPeople,
  SCOUT_SESSION_COMPANIES_CAP,
  SCOUT_SESSION_PEOPLE_CAP,
} from "@/lib/scout/sessions";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";
import type { ScoutSessionPerson } from "@/db";

function company(name: string, i: number): ScoutCompanyResult {
  return { name, city: "Chennai", dataSource: "test", externalId: `c-${i}` };
}

function person(name: string, i: number): ScoutSessionPerson {
  return {
    name,
    companyId: `co-${i}`,
    emailStatus: "missing",
    dataSource: "test",
    externalId: `p-${i}`,
  };
}

describe("buildScoutSessionTitle", () => {
  it("summarizes multi-city autopilot with industries and scale", () => {
    expect(
      buildScoutSessionTitle({
        mode: "autopilot",
        cities: ["Madras", "Salem", "Erode"],
        industries: Array.from({ length: 18 }, (_, i) => `Industry ${i + 1}`),
        employeeBands: ["medium"],
        verticalScope: "industries",
      }),
    ).toBe("Madras +2 · 18 industries · Medium scale");
  });

  it("uses company name for search mode", () => {
    expect(
      buildScoutSessionTitle({
        mode: "search",
        cities: ["Chennai"],
        companyName: "TVS Motor",
      }),
    ).toBe("TVS Motor · Chennai");
  });

  it("falls back when cities are empty", () => {
    expect(
      buildScoutSessionTitle({
        mode: "autopilot",
        cities: [],
        industries: ["Technology"],
      }),
    ).toBe("All locations · Technology");
  });
});

describe("session payload caps", () => {
  it("caps companies at the session limit", () => {
    const input = Array.from({ length: SCOUT_SESSION_COMPANIES_CAP + 25 }, (_, i) =>
      company(`Co ${i}`, i),
    );
    const capped = capScoutSessionCompanies(input);
    expect(capped).toHaveLength(SCOUT_SESSION_COMPANIES_CAP);
    expect(capped[0]?.name).toBe("Co 0");
    expect(capped.at(-1)?.name).toBe(`Co ${SCOUT_SESSION_COMPANIES_CAP - 1}`);
  });

  it("caps people at the session limit", () => {
    const input = Array.from({ length: SCOUT_SESSION_PEOPLE_CAP + 10 }, (_, i) =>
      person(`Person ${i}`, i),
    );
    expect(capScoutSessionPeople(input)).toHaveLength(SCOUT_SESSION_PEOPLE_CAP);
  });
});
