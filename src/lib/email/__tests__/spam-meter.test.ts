import { describe, expect, it } from "vitest";
import { scoreInboxSafety, contentQualityLabel } from "@/lib/email/content-quality-score";

describe("scoreInboxSafety", () => {
  it("scores well with personalization and soft tone", () => {
    const result = scoreInboxSafety(
      "Hi Arun,\n\nI saw TechCorp is expanding in Bangalore. Quick question about Diwali gifting for your team?\n\nHappy to share samples if useful. No pressure if timing is off.\n\nSrilaksha, ISH Gifting",
      "Diwali gifting for TechCorp",
      {
        emailStyle: "primary",
        fromName: "Srilaksha",
        contactFirstName: "Arun",
        sequencePosition: 1,
        account: { name: "TechCorp", industry: "IT", city: "Bangalore", enrichmentSource: "linkedin" },
        contact: { firstName: "Arun" },
      },
    );
    expect(result.contentScore).toBeGreaterThanOrEqual(70);
    expect(contentQualityLabel(result.verdict)).toBeTruthy();
  });

  it("penalizes em dash in body and subject", () => {
    const withDash = scoreInboxSafety(
      "Hi Arun,\n\nQuick note about Diwali gifting for your team \u2014 would a sample help?\n\nSrilaksha\nISH",
      "Diwali gifting \u2014 TechCorp",
      { emailStyle: "primary", contactFirstName: "Arun", sequencePosition: 1 },
    );
    const withoutDash = scoreInboxSafety(
      "Hi Arun,\n\nQuick note about Diwali gifting for your team. Would a sample help?\n\nSrilaksha\nISH",
      "Diwali gifting for TechCorp",
      { emailStyle: "primary", contactFirstName: "Arun", sequencePosition: 1 },
    );
    expect(withDash.contentScore).toBeLessThan(withoutDash.contentScore);
    expect(withDash.factors.some((f) => /em dash/i.test(f.label))).toBe(true);
  });

  it("penalizes dear opener and team sign-off", () => {
    const result = scoreInboxSafety(
      "Dear Arun,\n\nFree offer for your team.\n\nISH Gifting Team",
      "FREE OFFER for India Sweet House",
      { emailStyle: "marketing", hasBulkHeaders: true },
    );
    expect(result.contentScore).toBeLessThan(70);
  });
});
