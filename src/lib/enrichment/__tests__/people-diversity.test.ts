import { describe, expect, it } from "vitest";
import {
  companyPeopleBucket,
  peoplePerCompanyLimit,
  rankPeopleForScout,
  scoutPeopleCoverage,
  selectPeopleByCompanyCap,
} from "@/lib/enrichment/people-diversity";

describe("peoplePerCompanyLimit", () => {
  it("honors scout leads-per-company up to 25", () => {
    expect(peoplePerCompanyLimit(8)).toBe(8);
    expect(peoplePerCompanyLimit(1)).toBe(1);
    expect(peoplePerCompanyLimit(0)).toBe(1);
    expect(peoplePerCompanyLimit(40)).toBe(10);
  });
});

describe("companyPeopleBucket", () => {
  it("keeps distinct companies separate even when brand words overlap", () => {
    expect(companyPeopleBucket("Taurus CG Automobiles", "c1")).toBe("id:c1");
    expect(companyPeopleBucket("Taurus Group B.V.", "c2")).toBe("id:c2");
    expect(companyPeopleBucket("Tata Steel", "tata-steel")).not.toBe(
      companyPeopleBucket("Tata Motors", "tata-motors"),
    );
  });

  it("falls back to normalized name when id is missing", () => {
    expect(companyPeopleBucket("Infosys Limited")).toBe("name:infosys");
  });
});

describe("selectPeopleByCompanyCap", () => {
  it("keeps the most senior people first and caps per company id", () => {
    const picked = selectPeopleByCompanyCap(
      [
        { name: "Engineer", title: "Labeling Engineer", companyId: "philips", matchScore: 23 },
        { name: "CHRO", title: "CHRO", companyId: "philips", matchScore: 40 },
        { name: "HR Dir", title: "HR Director", companyId: "philips", matchScore: 70 },
        { name: "HR Mgr", title: "HR Manager", companyId: "philips", matchScore: 55 },
        { name: "Plant HR", title: "Plant HR Head", companyId: "bosch", matchScore: 65 },
        { name: "Buyer", title: "Procurement Manager", companyId: "bosch", matchScore: 50 },
      ],
      {
        perCompany: 3,
        bucketOf: (p) => p.companyId,
      },
    );

    expect(picked.filter((p) => p.companyId === "philips").map((p) => p.name)).toEqual([
      "CHRO",
      "HR Dir",
      "HR Mgr",
    ]);
    expect(picked.filter((p) => p.companyId === "bosch")).toHaveLength(2);
  });
});

describe("scoutPeopleCoverage", () => {
  it("counts companies with and without people", () => {
    const coverage = scoutPeopleCoverage({
      selectedCompanyIds: ["a", "b", "c"],
      people: [{ companyId: "a" }, { companyId: "a" }, { companyId: "c" }],
    });
    expect(coverage).toEqual({
      companiesWithPeople: 2,
      companiesWithoutPeople: 1,
      totalCompanies: 3,
      emptyCompanyIds: ["b"],
    });
  });
});

describe("rankPeopleForScout", () => {
  it("ranks plant HR above CTO when scouting gifting buyers", () => {
    const ranked = rankPeopleForScout(
      [
        { name: "CTO", title: "CTO", emailStatus: "missing", dataSource: "tavily" },
        { name: "Meera", title: "Plant HR Manager", emailStatus: "missing", dataSource: "tavily" },
      ],
      { departments: ["HR", "Procurement", "Admin"], buyerPersonas: ["HR Manager"] },
    );
    expect(ranked[0]?.name).toBe("Meera");
  });
});
