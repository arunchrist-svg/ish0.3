import { describe, expect, it } from "vitest";
import { getIndustryByLabel, inferProductCategory, searchIndustries } from "../industry-catalog";

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

  it("infers product category from website copy and intent", () => {
    expect(
      inferProductCategory({
        vertical: "saas",
        productSummary: "B2B CRM software platform for sales teams",
        llmCategory: "Enterprise Software",
      }),
    ).toBe("Enterprise Software");
    expect(
      inferProductCategory({
        vertical: "sweets_gifting",
        productSummary: "Premium mithai hampers for Diwali corporate gifting",
      }),
    ).toBe("Sweets");
    expect(inferProductCategory({ platformIntent: "appliances" })).toBe("Kitchen Appliances");
  });
});
