import { describe, expect, it } from "vitest";
import {
  campaignModesForIntent,
  inferPlatformIntent,
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
  });

  it("uses leadership scout defaults for saas", () => {
    const defaults = scoutDefaultsForIntent("b2b_saas");
    expect(defaults.scoutDepartments).toContain("Leadership");
    expect(defaults.scoutDepartments).not.toContain("Procurement");
    expect(defaults.scoutSeniority).toContain("Founders");
  });
});
