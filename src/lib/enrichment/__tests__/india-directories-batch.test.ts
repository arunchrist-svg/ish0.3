import { describe, expect, it } from "vitest";
import {
  buildDirectoryQueries,
  directoryQueryBatchCount,
  directorySearchQueryCap,
} from "@/lib/enrichment/india-directories";

describe("directoryQueryBatchCount", () => {
  it("keeps a small batch and scales modestly for 100 companies", () => {
    expect(directoryQueryBatchCount(8, 12)).toBe(3);
    expect(directoryQueryBatchCount(25, 12)).toBeGreaterThanOrEqual(3);
    expect(directorySearchQueryCap(100, 12)).toBeGreaterThanOrEqual(4);
    expect(directorySearchQueryCap(100, 12)).toBeLessThanOrEqual(6);
  });
});

describe("buildDirectoryQueries", () => {
  it("puts Zauba and MCA registries ahead of JustDial listings", () => {
    const queries = buildDirectoryQueries(["Bengaluru"], ["Technology"]);
    expect(queries[0]).toMatch(/zaubacorp|tofler/i);
    expect(queries.some((q) => /zaubacorp/i.test(q))).toBe(true);
    expect(queries.some((q) => /indiamart|tradeindia/i.test(q))).toBe(true);
  });

  it("puts JustDial listings ahead of Zauba for business types", () => {
    const queries = buildDirectoryQueries(["Bengaluru"], ["Banks"], 0, [], "business");
    expect(queries[0]).toMatch(/justdial|sulekha|indiamart/i);
    expect(queries.some((q) => /Banks/.test(q))).toBe(true);
    expect(queries[0]).not.toMatch(/private limited companies/i);
  });
});
