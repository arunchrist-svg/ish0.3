import { describe, expect, it } from "vitest";
import {
  buildQueriesForSource,
  getEnabledSources,
  passesPreFilter,
  GIFT_INTEL_SOURCES,
} from "../sources";

describe("gift-intel sources", () => {
  it("builds LinkedIn query with brand and giver-intent phrases", () => {
    const source = GIFT_INTEL_SOURCES.find((s) => s.id === "linkedin_posts")!;
    const queries = buildQueriesForSource(source, "Prestige", "Kitchen Appliances");
    expect(queries[0]).toContain('site:linkedin.com/posts');
    expect(queries[0]).toContain('"Prestige"');
    expect(queries[0]).toContain("corporate gift");
  });

  it("enables only requested tiers", () => {
    const sources = getEnabledSources([1]);
    expect(sources.every((s) => s.tier === 1)).toBe(true);
    expect(sources.some((s) => s.id === "linkedin_posts")).toBe(true);
    expect(sources.some((s) => s.id === "india_business_news")).toBe(false);
  });

  it("passes pre-filter for employer gift language", () => {
    const ok = passesPreFilter(
      {
        url: "https://www.linkedin.com/posts/jane-doe_diwali-123",
        text: "Thank Flipkart HR for the Prestige air fryer Diwali gift from company",
        sourceTier: 1,
      },
      "Prestige",
    );
    expect(ok).toBe(true);
  });

  it("rejects personal purchase language", () => {
    const ok = passesPreFilter(
      {
        url: "https://www.linkedin.com/posts/jane-doe_buy-123",
        text: "I bought a Prestige mixer grinder with discount coupon",
        sourceTier: 1,
      },
      "Prestige",
    );
    expect(ok).toBe(false);
  });

  it("rejects excluded e-commerce domains", () => {
    const ok = passesPreFilter(
      {
        url: "https://www.amazon.in/Prestige-mixer/dp/123",
        text: "Prestige corporate gift Diwali hamper",
        sourceTier: 1,
      },
      "Prestige",
    );
    expect(ok).toBe(false);
  });
});


it("appends city to query when provided", () => {
  const source = GIFT_INTEL_SOURCES.find((s) => s.id === "linkedin_posts")!;
  const queries = buildQueriesForSource(source, "Kanti Sweets", "Sweets", "Bengaluru");
  expect(queries[0]).toContain('"Bengaluru"');
});
