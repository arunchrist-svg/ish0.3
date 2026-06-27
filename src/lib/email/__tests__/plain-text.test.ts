import { describe, expect, it } from "vitest";
import { htmlToPlainText, isPublicAppUrl } from "@/lib/email/plain-text";

describe("htmlToPlainText", () => {
  it("strips tags and preserves paragraph breaks", () => {
    const plain = htmlToPlainText("<p>Hello</p><p>World</p>");
    expect(plain).toContain("Hello");
    expect(plain).toContain("World");
  });
});

describe("isPublicAppUrl", () => {
  it("rejects localhost", () => {
    expect(isPublicAppUrl("http://localhost:3002")).toBe(false);
    expect(isPublicAppUrl("http://127.0.0.1:3002")).toBe(false);
  });

  it("accepts deployed https urls", () => {
    expect(isPublicAppUrl("https://ish-sales.example.com")).toBe(true);
  });
});
