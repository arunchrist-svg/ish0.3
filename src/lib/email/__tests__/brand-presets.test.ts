import { describe, expect, it } from "vitest";
import { resolveBrandConfig } from "@/lib/email/brand-presets";
import { getDefaultEmailConfig, resolveEmailConfig } from "@/lib/email/config";

describe("resolveBrandConfig", () => {
  it("defaults unset brandSlug to custom, not ish", () => {
    const brand = resolveBrandConfig();
    expect(brand.brandSlug).toBe("custom");
    expect(brand.brandName).toBe("Your Company");
    expect(brand.productSummary).toBe("");
  });

  it("keeps explicit ish preset", () => {
    const brand = resolveBrandConfig({ brandSlug: "ish" });
    expect(brand.brandSlug).toBe("ish");
    expect(brand.productSummary.toLowerCase()).toContain("mithai");
  });

  it("keeps explicit prestige preset", () => {
    const brand = resolveBrandConfig({ brandSlug: "prestige" });
    expect(brand.brandSlug).toBe("prestige");
    expect(brand.productSummary.toLowerCase()).toContain("appliance");
    expect(brand.productSummary.toLowerCase()).not.toContain("mithai");
  });
});

describe("email config brand defaults", () => {
  it("defaults workspace brand to custom", () => {
    const defaults = getDefaultEmailConfig();
    expect(defaults.brandConfig.brandSlug).toBe("custom");
  });

  it("preserves saved prestige brand through resolveEmailConfig", () => {
    const resolved = resolveEmailConfig({
      brandConfig: resolveBrandConfig({ brandSlug: "prestige" }),
    });
    expect(resolved.brandConfig.brandSlug).toBe("prestige");
    expect(resolved.brandConfig.productSummary.toLowerCase()).toContain("mixer");
  });
});
