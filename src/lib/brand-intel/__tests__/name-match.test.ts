import { describe, expect, it } from "vitest";
import { nameMatchScore, normalizeCompanyName } from "../name-match";

describe("name-match", () => {
  it("normalizes legal suffixes", () => {
    expect(normalizeCompanyName("Flipkart Internet Pvt Ltd")).toBe("flipkart internet");
  });

  it("scores high for same company variants", () => {
    expect(nameMatchScore("Flipkart", "Flipkart Internet Pvt Ltd")).toBeGreaterThanOrEqual(0.72);
  });

  it("scores low for unrelated companies", () => {
    expect(nameMatchScore("Infosys", "Flipkart")).toBeLessThan(0.5);
  });
});
