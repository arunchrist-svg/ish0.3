import { describe, expect, it } from "vitest";
import { retrieveRelevantRules } from "@/lib/rag";

describe("retrieveRelevantRules brand isolation", () => {
  it("injects mithai gifting rules for ish", () => {
    const rules = retrieveRelevantRules({
      brandSlug: "ish",
      campaignMode: "diwali_gifting",
      season: "diwali",
      productSummary: "Premium pure-ghee mithai",
    });
    expect(rules.toLowerCase()).toMatch(/mithai|pure.?ghee|india sweet house/);
  });

  it("does not inject ISH gifting_rules for prestige", () => {
    const rules = retrieveRelevantRules({
      brandSlug: "prestige",
      campaignMode: "diwali_gifting",
      season: "diwali",
      productSummary:
        "Mixer grinders, induction cooktops, and kitchen appliance bundles for corporate rewards.",
    });
    expect(rules.toLowerCase()).not.toContain("mithai");
    expect(rules.toLowerCase()).not.toContain("pure-ghee");
    expect(rules.toLowerCase()).not.toContain("india sweet house");
    expect(rules.toLowerCase()).toMatch(/prestige|mixer|appliance/);
  });

  it("does not inject sweets Diwali campaign MD for prestige", () => {
    const rules = retrieveRelevantRules({
      brandSlug: "prestige",
      campaignMode: "diwali_gifting",
      productSummary: "Kitchen appliance bundles",
    });
    expect(rules.toLowerCase()).not.toContain("tasting sample");
  });

  it("uses neutral defaults when custom has no catalog", () => {
    const rules = retrieveRelevantRules({ brandSlug: "custom" });
    expect(rules.toLowerCase()).not.toContain("mithai");
    expect(rules).toMatch(/Outreach Rules|Personalise/i);
  });
});
