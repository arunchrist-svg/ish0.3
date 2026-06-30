import { describe, expect, it } from "vitest";
import { normalizeEmailBody } from "@/lib/email/email-body-format";

describe("normalizeEmailBody", () => {
  it("preserves existing paragraph breaks", () => {
    const body = "Hi Priya,\n\nWould a call work?\n\nArun";
    expect(normalizeEmailBody(body)).toBe(body);
  });

  it("splits single-block outreach into paragraphs", () => {
    const body =
      "Hi Himanshu, as Managing Director you know the season well. India Sweet House crafts mithai hampers for brands like yours. Would you be open to a tasting sample? No worries if timing is off. Srilaksha, Partnerships, India Sweet House.";
    const result = normalizeEmailBody(body);
    expect(result).toContain("\n\n");
    expect(result.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });
});
