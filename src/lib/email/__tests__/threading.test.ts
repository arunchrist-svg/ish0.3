import { describe, expect, it } from "vitest";
import {
  appendReference,
  buildReferencesChain,
  normalizeReplySubject,
  stripReplyPrefix,
  buildThreadHeaders,
} from "@/lib/email/threading";

describe("threading", () => {
  it("strips multiple Re: prefixes", () => {
    expect(stripReplyPrefix("Re: Re: Diwali gifting")).toBe("Diwali gifting");
  });

  it("normalizes reply subject with single Re:", () => {
    expect(normalizeReplySubject("Diwali gifting for TechCorp")).toBe("Re: Diwali gifting for TechCorp");
    expect(normalizeReplySubject("Re: Diwali gifting for TechCorp")).toBe("Re: Diwali gifting for TechCorp");
  });

  it("builds references chain without duplicates", () => {
    const a = "<a@test.com>";
    const b = "<b@test.com>";
    expect(buildReferencesChain(a, b, a)).toBe(`${a} ${b}`);
  });

  it("appendReference skips empty ids", () => {
    expect(appendReference("<a@test.com>", "")).toBe("<a@test.com>");
    expect(appendReference("<a@test.com>", "<b@test.com>")).toBe("<a@test.com> <b@test.com>");
  });

  it("buildThreadHeaders sets In-Reply-To and References", () => {
    const headers = buildThreadHeaders({
      inReplyTo: "<in@test.com>",
      referencesChain: "<root@test.com> <in@test.com>",
    });
    expect(headers["In-Reply-To"]).toBe("<in@test.com>");
    expect(headers["References"]).toContain("<root@test.com>");
  });
});
