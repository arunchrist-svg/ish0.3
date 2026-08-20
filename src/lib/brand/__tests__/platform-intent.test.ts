import { describe, expect, it } from "vitest";
import {
  brandIntelRecommendedForIntent,
  campaignModesForIntent,
  defaultIcpSummary,
  icpCompanyFilterInstructions,
  expandPeopleFiltersForOffer,
  festiveSweetsBuyerGuidance,
  inferPlatformIntent,
  normalizeScoutRoleFilters,
  scoutDefaultsForIntent,
  verticalPackIdForIntent,
} from "@/lib/brand/platform-intent";
import { campaignModeOptionsForBrand } from "@/lib/email/brand-presets";

describe("platform intent", () => {
  it("maps saas vertical to b2b_saas pack and hides diwali", () => {
    expect(inferPlatformIntent({ vertical: "saas", productSummary: "CRM software platform" })).toBe(
      "b2b_saas",
    );
    expect(verticalPackIdForIntent("b2b_saas")).toBe("general");
    expect(campaignModesForIntent("b2b_saas")).not.toContain("diwali_gifting");
    expect(campaignModeOptionsForBrand({ platformIntent: "b2b_saas", verticalPackId: "general" }).map((o) => o.value)).not.toContain(
      "diwali_gifting",
    );
  });

  it("keeps diwali for corporate gifting", () => {
    expect(
      inferPlatformIntent({
        vertical: "sweets_gifting",
        productSummary: "Premium Diwali mithai hampers for corporates",
      }),
    ).toBe("corporate_gifting");
    expect(campaignModesForIntent("corporate_gifting")).toContain("diwali_gifting");
    expect(campaignModesForIntent("corporate_gifting")).toContain("year_round");
  });

  it("recommends Brand Intelligence for physical goods, not software", () => {
    expect(brandIntelRecommendedForIntent("corporate_gifting")).toBe(true);
    expect(brandIntelRecommendedForIntent("appliances")).toBe(true);
    expect(brandIntelRecommendedForIntent("b2b_saas")).toBe(false);
    expect(brandIntelRecommendedForIntent("general_b2b")).toBe(false);
    expect(brandIntelRecommendedForIntent(null)).toBe(false);
  });

  it("uses seniority-only scout defaults for saas", () => {
    const defaults = scoutDefaultsForIntent("b2b_saas");
    expect(defaults.scoutDepartments).toEqual([]);
    expect(defaults.scoutDepartments).not.toContain("Procurement");
    expect(defaults.scoutSeniority).toContain("Founders");
    expect(defaults.scoutSeniority).toContain("C-Level");
  });

  it("uses department-only scout defaults for corporate gifting", () => {
    const defaults = scoutDefaultsForIntent("corporate_gifting");
    expect(defaults.scoutDepartments).toEqual(["HR", "Procurement"]);
    expect(defaults.scoutSeniority).toEqual([]);
    expect(defaultIcpSummary("corporate_gifting")).toMatch(/employees/);
    expect(defaultIcpSummary("corporate_gifting")).toMatch(/not other sweet shops/);
  });

  it("drops one people-filter stack when analysis filled both", () => {
    const gifting = normalizeScoutRoleFilters("corporate_gifting", ["HR"], ["Director"]);
    expect(gifting.scoutDepartments).toEqual(["HR"]);
    expect(gifting.scoutSeniority).toEqual([]);
    const saas = normalizeScoutRoleFilters("b2b_saas", ["Leadership"], ["Founders"]);
    expect(saas.scoutDepartments).toEqual([]);
    expect(saas.scoutSeniority).toEqual(["Founders"]);
  });

  it("tells the company filter to keep employer buyers for sweets", () => {
    const text = icpCompanyFilterInstructions({
      platformIntent: "corporate_gifting",
      icpSummary: defaultIcpSummary("corporate_gifting"),
    });
    expect(text).toMatch(/mithai shops/i);
    expect(text).toMatch(/employees/i);
  });

  it("maps Director-only sweets fetch to HR and Procurement buyers", () => {
    const expanded = expandPeopleFiltersForOffer("corporate_gifting", ["Director"], []);
    expect(expanded.expanded).toBe(true);
    expect(expanded.seniority).toEqual(["Director"]);
    expect(expanded.departments).toEqual(["HR", "Procurement"]);
    expect(festiveSweetsBuyerGuidance("corporate_gifting")).toMatch(/HR, Procurement/);
  });

  it("does not expand HR or Procurement when Scout Businesses is on", () => {
    const expanded = expandPeopleFiltersForOffer("corporate_gifting", ["Director"], [], {
      treatAsGifting: true,
      searchKind: "business",
      businesses: ["Banks"],
    });
    expect(expanded.expanded).toBe(false);
    expect(expanded.departments).toEqual([]);
    expect(expanded.note).toMatch(/branch managers/i);
    expect(festiveSweetsBuyerGuidance("corporate_gifting", "business")).toMatch(/branch managers/i);
  });

  it("maps Director-only fetch to HR and Procurement when the tenant slug is festive sweets", () => {
    const expanded = expandPeopleFiltersForOffer("general_b2b", ["Director"], [], {
      treatAsGifting: true,
    });
    expect(expanded.departments).toEqual(["HR", "Procurement"]);
    expect(expanded.seniority).toEqual(["Director"]);
  });
});
