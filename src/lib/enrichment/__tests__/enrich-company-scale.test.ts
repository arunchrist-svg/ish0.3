import { describe, expect, it } from "vitest";
import {
  buildCompanyScaleSearchQueries,
  companyNeedsScaleEnrichment,
} from "@/lib/enrichment/enrich-company-scale";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

describe("buildCompanyScaleSearchQueries", () => {
  it("builds IndiaMART and AmbitionBox headcount queries", () => {
    const queries = buildCompanyScaleSearchQueries({
      name: "QUALIFOUR AUTO PRODUCTS INDIA PRIVATE LIMITED",
      city: "Krishnagiri",
      domain: "qualifour.com",
    });
    expect(queries.some((q) => /number of employees/i.test(q))).toBe(true);
    expect(queries.some((q) => /site:indiamart.com/i.test(q))).toBe(true);
    expect(queries.some((q) => /site:ambitionbox.com/i.test(q))).toBe(true);
    expect(queries.some((q) => /qualifour\.com/i.test(q))).toBe(true);
  });
});

describe("companyNeedsScaleEnrichment", () => {
  it("flags missing employees only", () => {
    const unknown: ScoutCompanyResult = {
      name: "Acme",
      dataSource: "google_places",
      fitScore: 70,
    };
    const known: ScoutCompanyResult = {
      name: "Acme",
      employees: "51-100",
      dataSource: "india_directories",
      fitScore: 70,
    };
    expect(companyNeedsScaleEnrichment(unknown)).toBe(true);
    expect(companyNeedsScaleEnrichment(known)).toBe(false);
  });
});
