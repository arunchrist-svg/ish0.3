import { describe, expect, it } from "vitest";
import {
  getOutreachTemplate,
  getOutreachTemplatesForBrand,
  getReplyCtaInstruction,
  packIdFromBrand,
} from "@/lib/email/outreach-templates";

describe("getReplyCtaInstruction", () => {
  it("asks for address after affirmative gift_sampling reply", () => {
    const instruction = getReplyCtaInstruction("gift_sampling", "affirmative");
    expect(instruction).toMatch(/address/i);
    expect(instruction).toMatch(/Do NOT re-ask/i);
  });

  it("does not ask for address on negative reply", () => {
    const instruction = getReplyCtaInstruction("gift_sampling", "negative");
    expect(instruction).toMatch(/not interested|declined/i);
    expect(instruction).not.toMatch(/Do NOT re-ask/i);
  });
});

describe("brand outreach templates", () => {
  it("uses sweets CTAs for corporate gifting setup", () => {
    expect(packIdFromBrand({ platformIntent: "corporate_gifting", verticalPackId: "gifting-sweets" })).toBe(
      "gifting-sweets",
    );
    const templates = getOutreachTemplatesForBrand({
      platformIntent: "corporate_gifting",
      verticalPackId: "gifting-sweets",
      brandSlug: "ish",
    });
    expect(templates[0]?.label).toMatch(/gift sampling|mithai|tasting/i);
    expect(templates.some((t) => /demo or trial/i.test(t.label))).toBe(false);
    expect(getOutreachTemplate("gift_sampling", "gifting-sweets").ctaInstruction).toMatch(/tasting|Diwali|sample/i);
  });

  it("falls back to intent when pack id is missing", () => {
    expect(packIdFromBrand({ platformIntent: "corporate_gifting", brandSlug: "custom" })).toBe("gifting-sweets");
  });
});
