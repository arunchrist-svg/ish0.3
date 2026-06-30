import { describe, expect, it } from "vitest";
import { bodyChangeRatio, detectEditIntent, isStyleOnlyEdit, mentionsSubject } from "@/lib/email/edit-intent";

describe("detectEditIntent", () => {
  it("detects surgical intent for section-specific fixes", () => {
    expect(detectEditIntent("fix the second paragraph")).toBe("surgical");
    expect(detectEditIntent("change this line to mention Diwali")).toBe("surgical");
    expect(detectEditIntent("update the opening only")).toBe("surgical");
  });

  it("detects surgical intent for quoted text changes", () => {
    expect(detectEditIntent("change 'Would a call work' to 'Would Thursday work'")).toBe("surgical");
  });

  it("detects global intent for broad rewrite prompts", () => {
    expect(detectEditIntent("Make it shorter")).toBe("global");
    expect(detectEditIntent("More formal tone")).toBe("global");
    expect(detectEditIntent("Make Content score higher")).toBe("global");
    expect(detectEditIntent("rewrite the whole email")).toBe("global");
  });

  it("defaults ambiguous messages to surgical", () => {
    expect(detectEditIntent("mention Bangalore")).toBe("surgical");
  });
});

describe("mentionsSubject", () => {
  it("detects subject-related instructions", () => {
    expect(mentionsSubject("fix the subject line")).toBe(true);
    expect(mentionsSubject("change the greeting")).toBe(true);
    expect(mentionsSubject("fix the second paragraph")).toBe(false);
  });
});

describe("bodyChangeRatio", () => {
  it("returns 0 for identical text", () => {
    const body = "Hi Priya,\n\nWould a call work this week?\n\nArun";
    expect(bodyChangeRatio(body, body)).toBe(0);
  });

  it("returns low ratio for one-word change", () => {
    const before = "Hi Priya,\n\nWould a call work this week?\n\nArun";
    const after = "Hi Priya,\n\nWould Thursday work this week?\n\nArun";
    expect(bodyChangeRatio(before, after)).toBeLessThan(0.25);
  });

  it("returns high ratio for full rewrite", () => {
    const before = "Hi Priya,\n\nWould a call work this week?\n\nArun";
    const after = "Hello there,\n\nI wanted to reach out about our premium gift hampers for your team.\n\nBest";
    expect(bodyChangeRatio(before, after)).toBeGreaterThan(0.5);
  });
});

describe("isStyleOnlyEdit", () => {
  it("detects quick style prompts", () => {
    expect(isStyleOnlyEdit("More formal tone")).toBe(true);
    expect(isStyleOnlyEdit("Make it shorter")).toBe(true);
    expect(isStyleOnlyEdit("Stronger CTA")).toBe(true);
    expect(isStyleOnlyEdit("Fix the subject lines")).toBe(true);
  });

  it("does not treat content score as style-only", () => {
    expect(isStyleOnlyEdit("Make Content score higher")).toBe(false);
  });
});
