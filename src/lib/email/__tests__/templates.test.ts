import { describe, expect, it } from "vitest";
import { appendEmailSignature, buildEmailHtml } from "@/lib/email/templates";

describe("appendEmailSignature", () => {
  it("appends signature after body", () => {
    expect(appendEmailSignature("Hi there", "Arun\nISH")).toBe("Hi there\n\nArun\nISH");
  });

  it("skips empty signature", () => {
    expect(appendEmailSignature("Hi there", "  ")).toBe("Hi there");
  });

  it("does not double-append when signature already present", () => {
    const body = "Hi there\n\nArun\nISH";
    expect(appendEmailSignature(body, "Arun\nISH")).toBe(body);
  });
});

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

  it("defaults to primary layout (no unsubscribe footer)", () => {
    const html = buildEmailHtml({
      body: "Hello there",
      appUrl: "https://app.example.com",
    });
    expect(html).not.toContain("unsubscribe");
    expect(html).not.toContain("You received this email because");
  });

  it("includes Settings signature in the sent HTML body", () => {
    const html = buildEmailHtml({
      body: "Hello there",
      appUrl: "https://app.example.com",
      emailStyle: "primary",
      signature: "Arun\nIndia Sweet House",
    });
    expect(html).toContain("Arun<br/>India Sweet House");
  });
});
