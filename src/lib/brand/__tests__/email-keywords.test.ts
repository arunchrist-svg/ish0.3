import { describe, expect, it } from "vitest";
import {
  emailKeywordsToInput,
  normalizeEmailKeywords,
  writeupFromSummary,
} from "@/lib/brand/email-keywords";

describe("normalizeEmailKeywords", () => {
  it("caps, trims, and drops empties", () => {
    expect(
      normalizeEmailKeywords([
        "  bulk Diwali hampers ",
        "",
        "custom branded boxes",
        "custom branded boxes",
        "pan-India delivery",
        "festive tasting samples",
        "volume pricing",
        "HR gifting",
        "corporate hampers",
        "seasonal kits",
        "one too many",
      ]),
    ).toEqual([
      "bulk Diwali hampers",
      "custom branded boxes",
      "pan-India delivery",
      "festive tasting samples",
      "volume pricing",
      "HR gifting",
      "corporate hampers",
      "seasonal kits",
    ]);
  });

  it("drops spammy phrases and parses comma strings", () => {
    expect(normalizeEmailKeywords("bulk hampers, free gift, guaranteed ROI, pan-India delivery")).toEqual([
      "bulk hampers",
      "pan-India delivery",
    ]);
  });

  it("ignores overlong phrases", () => {
    expect(normalizeEmailKeywords(["ok theme", "x".repeat(61)])).toEqual(["ok theme"]);
  });
});

describe("writeupFromSummary", () => {
  it("keeps up to three sentences", () => {
    expect(writeupFromSummary("One. Two. Three. Four.")).toBe("One. Two. Three.");
  });
});

describe("emailKeywordsToInput", () => {
  it("joins for the settings field", () => {
    expect(emailKeywordsToInput(["a", "b"])).toBe("a, b");
    expect(emailKeywordsToInput(undefined)).toBe("");
  });
});
