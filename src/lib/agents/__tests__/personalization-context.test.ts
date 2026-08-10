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

  it("uses honest fallbacks when overview and title are missing", () => {
    const ctx = buildPersonalizationContext({
      accountName: "Unknown Co",
    });
    expect(ctx.industry).toBe("Corporate");
    expect(ctx.recipientRoles).toMatch(/unknown role/i);
    expect(ctx.companyProfile).toMatch(/unknown/i);
    expect(ctx.marketDynamics).toMatch(/festive gifting/i);
  });
});
