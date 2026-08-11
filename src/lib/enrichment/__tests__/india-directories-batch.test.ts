import { describe, expect, it } from "vitest";
import { directoryQueryBatchCount } from "@/lib/enrichment/india-directories";

describe("directoryQueryBatchCount", () => {
  it("uses more than 2 Tavily queries when targeting 100 companies", () => {
    expect(directoryQueryBatchCount(100, 12)).toBe(12);
    expect(directoryQueryBatchCount(25, 12)).toBeGreaterThan(2);
    expect(directoryQueryBatchCount(8, 12)).toBe(2);
  });
});
