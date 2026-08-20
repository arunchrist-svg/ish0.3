import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl, linkedInSlug, normalizeEmail, displayPersonTitle, isBlankPersonField, personLinkedInHref } from "@/lib/utils";

describe("UTILS-UNIT-001 LinkedIn URL normalization", () => {
  it("returns undefined for empty input", () => {
    expect(normalizeLinkedInUrl(null)).toBeUndefined();
    expect(normalizeLinkedInUrl("")).toBeUndefined();
    expect(normalizeLinkedInUrl("   ")).toBeUndefined();
  });

  it("preserves full https URLs", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/john-doe")).toBe(
      "https://www.linkedin.com/in/john-doe",
    );
  });

  it("adds https to linkedin.com paths", () => {
    expect(normalizeLinkedInUrl("linkedin.com/in/jane-smith")).toBe(
      "https://linkedin.com/in/jane-smith",
    );
  });

  it("handles in/ prefix paths", () => {
    expect(normalizeLinkedInUrl("in/arun-krishnan")).toBe(
      "https://www.linkedin.com/in/arun-krishnan",
    );
  });

  it("fixes double https prefix", () => {
    expect(normalizeLinkedInUrl("https://https://linkedin.com/in/test")).toBe(
      "https://linkedin.com/in/test",
    );
  });

  it("extracts LinkedIn slug", () => {
    expect(linkedInSlug("https://www.linkedin.com/in/John-Doe")).toBe("john-doe");
    expect(linkedInSlug("in/test-user")).toBe("test-user");
    expect(linkedInSlug("not-a-linkedin-url")).toBeUndefined();
  });
});

describe("UTILS-UNIT-002 email normalization", () => {
  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("returns undefined for invalid input", () => {
    expect(normalizeEmail("not-an-email")).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });
});

describe("person display fields", () => {
  it("treats dash placeholders as blank", () => {
    expect(isBlankPersonField("—")).toBe(true);
    expect(isBlankPersonField("-")).toBe(true);
    expect(isBlankPersonField("  ")).toBe(true);
    expect(isBlankPersonField("HR")).toBe(false);
  });

  it("shows a readable title when the job title is missing", () => {
    expect(displayPersonTitle("")).toBe("Title not listed");
    expect(displayPersonTitle("Director HR")).toBe("Director HR");
  });

  it("opens a profile URL or falls back to LinkedIn people search", () => {
    expect(
      personLinkedInHref({ linkedIn: "linkedin.com/in/ruchi-rawat", name: "Ruchi Rawat" }),
    ).toEqual({
      href: "https://linkedin.com/in/ruchi-rawat",
      hasProfile: true,
    });
    expect(
      personLinkedInHref({ linkedIn: "", name: "Hari Prasad", companyName: "Acme Foods" }),
    ).toEqual({
      href: "https://www.linkedin.com/search/results/people/?keywords=Hari%20Prasad%20Acme%20Foods",
      hasProfile: false,
    });
  });
});
