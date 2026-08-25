import { describe, expect, it } from "vitest";
import { computeScoutWeightDeltas, applyWeightDeltas } from "@/lib/enrichment/quality-learning";
import { scoutQualityProfileFor } from "@/lib/enrichment/quality-profile";
import { applySellerPollutionFilter, looksLikeLookalikeSeller } from "@/lib/enrichment/seller-pollution";
import { effectiveGeoPolicy } from "@/lib/enrichment/quality-profile";

describe("computeScoutWeightDeltas", () => {
  it("returns null below the sample floor", () => {
    expect(computeScoutWeightDeltas(Array.from({ length: 10 }, () => ({
      replied: true,
      hasWebsite: true,
      local: true,
      reachable: true,
    })))).toBeNull();
  });

  it("nudges website weight when website accounts reply more", () => {
    const samples = [
      ...Array.from({ length: 20 }, () => ({
        replied: true,
        hasWebsite: true,
        local: true,
        reachable: true,
      })),
      ...Array.from({ length: 20 }, () => ({
        replied: false,
        hasWebsite: false,
        local: false,
        reachable: false,
      })),
    ];
    const deltas = computeScoutWeightDeltas(samples);
    expect(deltas?.officialWebsite).toBeGreaterThan(0);
    const sweets = scoutQualityProfileFor("corporate_gifting");
    const next = applyWeightDeltas(sweets.weights, deltas);
    expect(next.officialWebsite).toBeGreaterThan(sweets.weights.officialWebsite);
  });
});

describe("sellerPollution filter", () => {
  it("drops mithai shops in industry mode for sweets separate_modes", () => {
    const sweets = scoutQualityProfileFor("corporate_gifting");
    const kept = applySellerPollutionFilter(
      [
        { name: "Hosur Auto", dataSource: "test" },
        { name: "A2B Mithai Shop", industry: "mithai", dataSource: "test" },
      ],
      sweets,
      "industry",
    );
    expect(kept.map((c) => c.name)).toEqual(["Hosur Auto"]);
  });

  it("keeps mithai shops in business-chip mode", () => {
    const sweets = scoutQualityProfileFor("corporate_gifting");
    const kept = applySellerPollutionFilter(
      [{ name: "A2B Mithai Shop", dataSource: "test" }],
      sweets,
      "business",
    );
    expect(kept).toHaveLength(1);
  });

  it("does not treat a mithai shop as a SaaS lookalike", () => {
    expect(
      looksLikeLookalikeSeller({ name: "A2B Mithai Shop" }, "b2b_saas"),
    ).toBe(false);
  });
});

describe("effectiveGeoPolicy", () => {
  it("uses focus_then_corridor for sweets Focus Area", () => {
    const sweets = scoutQualityProfileFor("corporate_gifting");
    expect(effectiveGeoPolicy(sweets, "focus")).toBe("focus_then_corridor");
    expect(effectiveGeoPolicy(sweets, "interest")).toBe("region_ok");
  });
});
