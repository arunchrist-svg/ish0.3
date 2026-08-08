import { describe, expect, it } from "vitest";
import {
  companyMatchesNameQuery,
  compactCompanyName,
  filterCompaniesMatchingQuery,
  isGeographicEntity,
  nameMatchesQuery,
  normalizeCompanyName,
} from "@/lib/enrichment/company-name-match";

describe("normalizeCompanyName", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalizeCompanyName("Moneyview Private Limited")).toBe("moneyview");
    expect(normalizeCompanyName("Titan Company Ltd")).toBe("titan");
  });
});

describe("nameMatchesQuery", () => {
  it("matches exact, suffix, and spaced brand variants", () => {
    expect(nameMatchesQuery("Moneyview", "Moneyview")).toBe(true);
    expect(nameMatchesQuery("Moneyview Private Limited", "Moneyview")).toBe(true);
    expect(nameMatchesQuery("Money View", "Moneyview")).toBe(true);
    expect(compactCompanyName("Money View")).toBe("moneyview");
  });

  it("does not match unrelated legal names without a shared brand", () => {
    expect(nameMatchesQuery("Whizdm Finance", "Moneyview")).toBe(false);
    expect(nameMatchesQuery("Karnataka", "Moneyview")).toBe(false);
    expect(nameMatchesQuery("India in 2026", "Moneyview")).toBe(false);
  });
});

describe("companyMatchesNameQuery", () => {
  it("allows a legal alias only when the domain slug matches the query", () => {
    expect(companyMatchesNameQuery({ name: "Whizdm Finance" }, "Moneyview")).toBe(false);
    expect(
      companyMatchesNameQuery({ name: "Whizdm Finance", domain: "moneyview.in" }, "Moneyview"),
    ).toBe(true);
  });

  it("rejects geographic entities even with a domain", () => {
    expect(
      companyMatchesNameQuery({ name: "Karnataka", domain: "karnataka.gov.in" }, "Moneyview"),
    ).toBe(false);
  });
});

describe("isGeographicEntity", () => {
  it("rejects India, states, and major metros", () => {
    for (const name of ["Karnataka", "Maharashtra", "Bengaluru", "Bangalore", "India", "South India"]) {
      expect(isGeographicEntity(name), name).toBe(true);
    }
  });

  it("allows real company names that mention India", () => {
    expect(isGeographicEntity("Bosch India")).toBe(false);
    expect(isGeographicEntity("Moneyview")).toBe(false);
  });
});

describe("filterCompaniesMatchingQuery", () => {
  it("keeps only query matches", () => {
    const filtered = filterCompaniesMatchingQuery(
      [
        { name: "Karnataka", city: "Bengaluru" },
        { name: "Moneyview", city: "Bengaluru" },
        { name: "SingleStore", city: "Bengaluru" },
      ],
      "Moneyview",
    );
    expect(filtered.map((c) => c.name)).toEqual(["Moneyview"]);
  });
});
