import { describe, expect, it } from "vitest";
import {
  companyPeopleBucket,
  peoplePerCompanyLimit,
  selectPeopleByCompanyCap,
} from "@/lib/enrichment/people-diversity";

describe("peoplePerCompanyLimit", () => {
  it("caps at 3 and never goes below 1", () => {
    expect(peoplePerCompanyLimit(8)).toBe(3);
    expect(peoplePerCompanyLimit(1)).toBe(1);
    expect(peoplePerCompanyLimit(0)).toBe(1);
  });
});

describe("companyPeopleBucket", () => {
  it("groups Taurus legal entities together", () => {
    expect(companyPeopleBucket("Taurus CG Automobiles")).toBe("taurus");
    expect(companyPeopleBucket("Taurus Group B.V.")).toBe("taurus");
    expect(companyPeopleBucket("Taurus Powertronics P Ltd")).toBe("taurus");
  });
});

describe("selectPeopleByCompanyCap", () => {
  it("keeps the most senior people first and caps per company", () => {
    const picked = selectPeopleByCompanyCap(
      [
        { name: "Engineer", title: "Labeling Engineer", company: "Philips", matchScore: 23 },
        { name: "CHRO", title: "CHRO", company: "Philips", matchScore: 40 },
        { name: "HR Dir", title: "HR Director", company: "Philips", matchScore: 70 },
        { name: "HR Mgr", title: "HR Manager", company: "Philips", matchScore: 55 },
        { name: "Plant HR", title: "Plant HR Head", company: "Bosch", matchScore: 65 },
        { name: "Buyer", title: "Procurement Manager", company: "Bosch", matchScore: 50 },
      ],
      {
        perCompany: 3,
        bucketOf: (p) => companyPeopleBucket(p.company),
      },
    );

    expect(picked.filter((p) => p.company === "Philips").map((p) => p.name)).toEqual([
      "CHRO",
      "HR Dir",
      "HR Mgr",
    ]);
    expect(picked.filter((p) => p.company === "Bosch")).toHaveLength(2);
  });
});
