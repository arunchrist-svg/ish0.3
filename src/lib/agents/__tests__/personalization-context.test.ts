import { describe, expect, it } from "vitest";
import { buildPersonalizationContext } from "@/lib/agents/personalization-context";

describe("buildPersonalizationContext", () => {
  it("maps manufacturing HR to plant daily work and Diwali dynamics", () => {
    const ctx = buildPersonalizationContext({
      industry: "Automotive manufacturing",
      city: "Bengaluru",
      accountName: "SEG Automotive",
      contactTitle: "HR Manager",
      intelNotes: "Runs Diwali boxes for plant plus office",
      overview: {
        sector: "Auto components",
        nextGiftingCalendarCycle: "Diwali 2026 vendor lock in September",
        corporateMilestones: ["New plant line"],
      },
      campaignMode: "diwali_gifting",
      buyerPersonas: ["HR Director", "Admin Head"],
      decisionChain: ["Himanshu Monga"],
    });

    expect(ctx.industry).toMatch(/Automotive/i);
    expect(ctx.marketDynamics).toMatch(/Diwali/i);
    expect(ctx.companyProfile).toContain("SEG Automotive");
    expect(ctx.recipientRoles).toMatch(/HR/i);
    expect(ctx.roleDailyWork).toMatch(/festival|shop-floor|culture/i);
  });

  it("maps Hosur manufacturing HR to shop-floor plant dynamics", () => {
    const ctx = buildPersonalizationContext({
      industry: "Manufacturing",
      city: "Hosur",
      accountName: "Acme Auto Components",
      contactTitle: "HR Manager",
      campaignMode: "diwali_gifting",
    });
    expect(ctx.marketDynamics).toMatch(/Hosur/i);
    expect(ctx.roleDailyWork).toMatch(/shop-floor/i);
    expect(ctx.recipientRoles).toMatch(/HR/i);
  });

  it("uses detected store opening instead of Diwali dynamics", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Reliance Retail",
      city: "Bengaluru",
      campaignMode: "diwali_gifting",
      overview: {
        detectedOccasions: [{ type: "store_opening", label: "New Trend store, Whitefield", timeframe: "2026-08" }],
      },
    });
    expect(ctx.marketDynamics).toMatch(/Whitefield|store/i);
    expect(ctx.companyProfile).toMatch(/Detected occasions/i);
  });

  it("flags upcoming store openings in dynamics", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Reliance Retail",
      city: "Bengaluru",
      campaignMode: "year_round",
      overview: {
        detectedOccasions: [
          {
            type: "store_opening",
            label: "Trend store, Phoenix Mall",
            timeframe: "2026-10",
            timing: "upcoming",
            signalType: "hiring",
          },
        ],
      },
    });
    expect(ctx.marketDynamics).toMatch(/upcoming/i);
    expect(ctx.companyProfile).toMatch(/upcoming/i);
    expect(ctx.marketDynamics.toLowerCase()).not.toMatch(/diwali corporate gifting window/);
  });

  it("uses year_round campaign when no occasion is set", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Acme",
      campaignMode: "year_round",
    });
    expect(ctx.marketDynamics).toMatch(/Year-round programs|empanelment|Vendor empanelment/i);
    expect(ctx.marketDynamics.toLowerCase()).not.toMatch(/diwali corporate gifting window/);
  });

  it("uses honest fallbacks when overview and title are missing", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Unknown Co",
    });
    expect(ctx.industry).toBe("Corporate");
    expect(ctx.recipientRoles).toMatch(/unknown role/i);
    expect(ctx.companyProfile).toMatch(/unknown/i);
    expect(ctx.marketDynamics).toMatch(/festive gifting/i);
  });

  it("includes seller ICP so sweets emails target employee gifting buyers", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Bosch",
      campaignMode: "diwali_gifting",
      icpSummary: "Companies that gift sweets to employees",
    });
    expect(ctx.marketDynamics).toMatch(/gift sweets to employees/i);
  });
});
