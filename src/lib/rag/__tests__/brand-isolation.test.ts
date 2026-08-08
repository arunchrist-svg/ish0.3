import { describe, expect, it } from "vitest";
import { retrieveRelevantRules } from "@/lib/rag";

describe("retrieveRelevantRules brand isolation", () => {
  it("injects sweets pack knowledge for gifting-sweets", () => {
    const rules = retrieveRelevantRules({
      verticalPackId: "gifting-sweets",
      campaignMode: "diwali_gifting",
      season: "diwali",
      productSummary: "Premium pure-ghee mithai",
    });
    expect(rules.toLowerCase()).toMatch(/mithai|pure.?ghee|india sweet house/);
  });

  it("does not inject sweets knowledge for appliances pack", () => {
    const rules = retrieveRelevantRules({
      verticalPackId: "gifting-appliances",
      campaignMode: "mass_ordering",
      productSummary:
        "Mixer grinders, induction cooktops, and kitchen appliance bundles for corporate rewards.",
    });
    expect(rules.toLowerCase()).not.toContain("mithai");
    expect(rules.toLowerCase()).not.toContain("pure-ghee");
    expect(rules.toLowerCase()).not.toContain("india sweet house");
    expect(rules.toLowerCase()).toMatch(/prestige|mixer|appliance/);
  });

  it("does not inject sweets Diwali campaign MD for appliances pack", () => {
    const rules = retrieveRelevantRules({
      verticalPackId: "gifting-appliances",
      campaignMode: "diwali_gifting",
      productSummary: "Kitchen appliance bundles",
    });
    expect(rules.toLowerCase()).not.toContain("tasting sample");
  });

  it("uses neutral defaults when general pack has no catalog", () => {
    const rules = retrieveRelevantRules({ brandSlug: "custom", verticalPackId: "general" });
    expect(rules.toLowerCase()).not.toContain("mithai");
    expect(rules).toMatch(/Outreach Rules|Personalise/i);
  });
});
