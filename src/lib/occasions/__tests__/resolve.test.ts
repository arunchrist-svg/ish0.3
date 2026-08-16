import { describe, expect, it } from "vitest";
import { resolveWriteOccasion } from "../resolve";
import { FESTIVE_OCCASION_SENTINEL } from "../catalog";

describe("resolveWriteOccasion", () => {
  it("prefers the Write-time theme over campaign mode", () => {
    expect(
      resolveWriteOccasion({
        selected: "birthday",
        campaignMode: "diwali_gifting",
      }),
    ).toBe("birthday");
  });

  it("uses detected account occasion when selected is account_event", () => {
    expect(
      resolveWriteOccasion({
        selected: "account_event",
        overview: {
          detectedOccasions: [
            { type: "store_opening", label: "New store, Whitefield", timeframe: "2026-08" },
          ],
        },
        campaignMode: "year_round",
      }),
    ).toBe("store_opening");
  });

  it("maps year_round campaign to empanelment when nothing else is set", () => {
    expect(resolveWriteOccasion({ campaignMode: "year_round" })).toBe("empanelment");
  });

  it("maps diwali campaign to festive", () => {
    expect(resolveWriteOccasion({ campaignMode: "diwali_gifting" })).toBe(FESTIVE_OCCASION_SENTINEL);
  });
});
