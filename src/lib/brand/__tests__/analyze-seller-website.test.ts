import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl, mergeWebsiteInsightsIntoBrand } from "@/lib/brand/analyze-seller-website";
import { resolveBrandConfig } from "@/lib/email/brand-presets";
import type { WebsiteBrandInsights } from "@/lib/email/config";

describe("normalizeWebsiteUrl", () => {
  it("adds https and strips trailing slash", () => {
    expect(normalizeWebsiteUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeWebsiteUrl("https://acme.com/")).toBe("https://acme.com");
  });

  it("rejects invalid input", () => {
    expect(normalizeWebsiteUrl("")).toBeNull();
    expect(normalizeWebsiteUrl("not a url")).toBeNull();
  });
});

describe("resolveBrandConfig website fields", () => {
  it("preserves websiteUrl and insights on custom brand", () => {
    const insights: WebsiteBrandInsights = {
      analyzedAt: "2026-01-01T00:00:00.000Z",
      vertical: "saas",
      productSummary: "B2B scheduling software",
      toneNotes: "Direct and practical.",
      buyerPersonas: ["Ops Manager"],
      scoutIndustries: ["Technology"],
      scoutDepartments: ["Operations"],
      scoutSeniority: ["Director"],
    };
    const brand = resolveBrandConfig({
      brandSlug: "custom",
      brandName: "Acme",
      websiteUrl: "https://acme.com",
      websiteInsights: insights,
      productSummary: insights.productSummary,
      toneNotes: insights.toneNotes,
    });
    expect(brand.websiteUrl).toBe("https://acme.com");
    expect(brand.websiteInsights?.scoutIndustries).toEqual(["Technology"]);
    expect(brand.productSummary).toContain("scheduling");
  });
});

describe("mergeWebsiteInsightsIntoBrand", () => {
  it("forces custom slug and writes product summary", () => {
    const merged = mergeWebsiteInsightsIntoBrand(
      resolveBrandConfig({ brandSlug: "custom", brandName: "Old" }),
      {
        websiteUrl: "https://new.co",
        insights: {
          analyzedAt: "2026-01-01T00:00:00.000Z",
          brandName: "New Co",
          vertical: "retail",
          productSummary: "Corporate gift boxes",
          toneNotes: "Warm and concise.",
          buyerPersonas: ["HR Director"],
          scoutIndustries: ["Retail"],
          scoutDepartments: ["HR"],
          scoutSeniority: ["Manager"],
        },
        brandPatch: {
          brandSlug: "custom",
          brandName: "New Co",
          vertical: "retail",
          productSummary: "Corporate gift boxes",
          buyerPersonas: ["HR Director"],
          toneNotes: "Warm and concise.",
          websiteUrl: "https://new.co",
        },
      },
      { forceCustomSlug: true },
    );
    expect(merged.brandSlug).toBe("custom");
    expect(merged.brandName).toBe("New Co");
    expect(merged.websiteUrl).toBe("https://new.co");
    expect(merged.productSummary).toBe("Corporate gift boxes");
    expect(merged.platformIntent).toBe("corporate_gifting");
    expect(merged.verticalPackId).toBe("gifting-sweets");
  });
});
