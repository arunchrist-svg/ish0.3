import { describe, expect, it } from "vitest";
import {
  assertCompetitorInList,
  formatCompetitorBrandsForInput,
  parseCompetitorBrandsInput,
  resolveGiftIntelConfig,
} from "../config";

describe("gift-intel config", () => {
  it("defaults to ISH sweets category and competitors", () => {
    const cfg = resolveGiftIntelConfig({});
    expect(cfg.productCategory).toBe("Sweets");
    expect(cfg.competitorBrands).toContain("Kanti Sweets");
    expect(cfg.competitorBrands.length).toBeGreaterThan(2);
  });

  it("parses competitor textarea input", () => {
    expect(parseCompetitorBrandsInput("Kanti Sweets\nAnand Sweets, Haldiram's")).toEqual([
      "Kanti Sweets",
      "Anand Sweets",
      "Haldiram's",
    ]);
  });

  it("formats brands for textarea", () => {
    expect(formatCompetitorBrandsForInput(["A", "B"])).toBe("A\nB");
  });

  it("uses workspace overrides when provided", () => {
    const cfg = resolveGiftIntelConfig({
      giftIntelProductCategory: "Mithai",
      giftIntelCompetitorBrands: ["Brand X"],
    });
    expect(cfg.productCategory).toBe("Mithai");
    expect(cfg.competitorBrands).toEqual(["Brand X"]);
  });

  it("assertCompetitorInList rejects unknown brand", () => {
    expect(() => assertCompetitorInList("Unknown", ["Kanti Sweets"])).toThrow(/not in your configured competitor list/);
  });
});
