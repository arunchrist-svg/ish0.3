import { describe, expect, it } from "vitest";
import {
  assertCompetitorInList,
  formatCompetitorBrandsForInput,
  parseCompetitorBrandsInput,
  resolveBrandIntelConfig,
  resolveGiftIntelConfig,
} from "../config";

describe("brand-intel config", () => {
  it("does not default to Sweets / ISH competitors when unset", () => {
    const cfg = resolveGiftIntelConfig({});
    expect(cfg.productCategory).toBe("");
    expect(cfg.competitorBrands).toEqual([]);
    expect(cfg.configured).toBe(false);
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
    const cfg = resolveBrandIntelConfig({
      giftIntelProductCategory: "Mithai",
      giftIntelCompetitorBrands: ["Brand X"],
    });
    expect(cfg.productCategory).toBe("Mithai");
    expect(cfg.competitorBrands).toEqual(["Brand X"]);
    expect(cfg.configured).toBe(true);
  });

  it("assertCompetitorInList rejects unknown brand", () => {
    expect(() => assertCompetitorInList("Unknown", ["Kanti Sweets"])).toThrow(
      /not in your configured competitor list/,
    );
  });
});
