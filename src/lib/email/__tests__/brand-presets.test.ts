import { describe, expect, it } from "vitest";
import { resolveBrandConfig } from "@/lib/email/brand-presets";
import { getDefaultEmailConfig, resolveEmailConfig } from "@/lib/email/config";

describe("resolveBrandConfig", () => {
  it("defaults unset brandSlug to custom, not ish", () => {
    const brand = resolveBrandConfig();
    expect(brand.brandSlug).toBe("custom");
    expect(brand.brandName).toBe("Your Company");
    expect(brand.productSummary).toBe("");
    expect(brand.platformIntent).toBe("general_b2b");
  });

  it("hydrates ish legacy slug into sweets pack on custom brand", () => {
    const brand = resolveBrandConfig({ brandSlug: "ish" });
    expect(brand.brandSlug).toBe("custom");
    expect(brand.verticalPackId).toBe("gifting-sweets");
    expect(brand.platformIntent).toBe("corporate_gifting");
    expect(brand.productSummary.toLowerCase()).toContain("mithai");
  });

  it("hydrates prestige legacy slug into appliances pack on custom brand", () => {
    const brand = resolveBrandConfig({ brandSlug: "prestige" });
    expect(brand.brandSlug).toBe("custom");
    expect(brand.verticalPackId).toBe("gifting-appliances");
    expect(brand.platformIntent).toBe("appliances");
    expect(brand.productSummary.toLowerCase()).toContain("appliance");
    expect(brand.productSummary.toLowerCase()).not.toContain("mithai");
  });
});

describe("email config brand defaults", () => {
  it("defaults workspace brand to custom", () => {
    const defaults = getDefaultEmailConfig();
    expect(defaults.brandConfig.brandSlug).toBe("custom");
  });

  it("preserves appliances pack through resolveEmailConfig", () => {
    const resolved = resolveEmailConfig({
      brandConfig: resolveBrandConfig({ brandSlug: "prestige" }),
    });
    expect(resolved.brandConfig.brandSlug).toBe("custom");
    expect(resolved.brandConfig.verticalPackId).toBe("gifting-appliances");
    expect(resolved.brandConfig.productSummary.toLowerCase()).toContain("mixer");
  });
});
