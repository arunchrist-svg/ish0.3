import { describe, expect, it } from "vitest";
import {
  brandPresetOptionsForUser,
  campaignModeOptionsForUser,
  defaultPlatformIntentForUser,
  isSweetsOnlyOperator,
  platformIntentOptionsForUser,
} from "@/lib/brand/vertical-catalog";
import { CAMPAIGN_MODE_OPTIONS } from "@/lib/email/brand-presets";

describe("vertical catalog for sweets-only operators", () => {
  it("recognizes srilaksha.ish emails", () => {
    expect(isSweetsOnlyOperator("srilaksha.ish@gmail.com")).toBe(true);
    expect(isSweetsOnlyOperator("Srilaksha.ISH@india.com")).toBe(true);
    expect(isSweetsOnlyOperator("arun@indiasweethouse.com")).toBe(false);
  });

  it("shows only sweets intent, ISH preset, and Diwali campaign", () => {
    const email = "srilaksha.ish@gmail.com";
    expect(platformIntentOptionsForUser(email).map((o) => o.value)).toEqual(["corporate_gifting"]);
    expect(brandPresetOptionsForUser(email).map((o) => o.value)).toEqual(["ish"]);
    expect(campaignModeOptionsForUser(CAMPAIGN_MODE_OPTIONS, email).map((o) => o.value)).toEqual([
      "diwali_gifting",
    ]);
    expect(defaultPlatformIntentForUser(email)).toBe("corporate_gifting");
  });

  it("leaves the full catalog for other users", () => {
    expect(platformIntentOptionsForUser("owner@acme.com").length).toBeGreaterThan(1);
    expect(brandPresetOptionsForUser("owner@acme.com").some((o) => o.value === "prestige")).toBe(true);
  });
});
