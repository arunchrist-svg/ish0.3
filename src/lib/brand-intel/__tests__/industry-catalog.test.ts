import { describe, expect, it } from "vitest";
import {
  formatProductCategories,
  getIndustryByLabel,
  parseProductCategories,
  searchIndustries,
  suggestedCompetitorsForCategories,
} from "../industry-catalog";

describe("industry catalog", () => {
  it("finds kitchen appliances when typing kit", () => {
    const results = searchIndustries("kit");
    expect(results[0]?.label).toBe("Kitchen Appliances");
  });

  it("finds sweets by keyword", () => {
    const results = searchIndustries("mithai");
    expect(results.some((entry) => entry.label === "Sweets")).toBe(true);
  });

  it("returns default list for empty query", () => {
    expect(searchIndustries("").length).toBeGreaterThan(0);
  });

  it("resolves industry by label", () => {
    const entry = getIndustryByLabel("Kitchen Appliances");
    expect(entry?.suggestedCompetitors).toContain("Prestige");
  });

  it("parses chosen product categories from a stored string", () => {
    expect(parseProductCategories("Sweets, Kitchen Appliances")).toEqual([
      "Sweets",
      "Kitchen Appliances",
    ]);
    expect(formatProductCategories(["Sweets", "sweets", "Kitchen Appliances"])).toBe(
      "Sweets, Kitchen Appliances",
    );
  });

  it("merges suggested competitors across chosen categories", () => {
    const brands = suggestedCompetitorsForCategories("Sweets, Kitchen Appliances");
    expect(brands).toContain("Haldiram's");
    expect(brands).toContain("Prestige");
  });
});
