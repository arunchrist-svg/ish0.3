import { describe, expect, it } from "vitest";
import { buildEmailHtml } from "@/lib/email/templates";

describe("buildEmailHtml open tracking", () => {
  it("embeds tracking pixel for primary style when App URL is public", () => {
    const html = buildEmailHtml({
      body: "Hello there",
      trackingToken: "tok-primary",
      appUrl: "https://app.example.com",
      emailStyle: "primary",
    });

    expect(html).toContain("/api/track/open?t=tok-primary");
    expect(html).not.toContain("unsubscribe");
  });

  it("embeds tracking pixel for marketing style when App URL is public", () => {
    const html = buildEmailHtml({
      body: "Hello there",
      trackingToken: "tok-mkt",
      appUrl: "https://app.example.com",
      emailStyle: "marketing",
    });

    expect(html).toContain("/api/track/open?t=tok-mkt");
    expect(html).toContain("unsubscribe");
  });

  it("skips pixel on localhost App URL", () => {
    const html = buildEmailHtml({
      body: "Hello there",
      trackingToken: "tok-local",
      appUrl: "http://localhost:3002",
      emailStyle: "primary",
    });

    expect(html).not.toContain("/api/track/open");
  });
});
