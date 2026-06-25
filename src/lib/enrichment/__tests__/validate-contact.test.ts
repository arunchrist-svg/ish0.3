import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  sanitizeEmail,
  isValidIndianPhone,
  sanitizePhone,
  isGenericCompanyEmail,
  pickBestEmail,
  pickBestPhone,
} from "@/lib/enrichment/validate-contact";

describe("ENRICH-UNIT-001 email validation", () => {
  it("accepts valid corporate emails", () => {
    expect(isValidEmail("priya.sharma@testcorp.in")).toBe(true);
    expect(sanitizeEmail("Priya.Sharma@TestCorp.IN")).toBe("priya.sharma@testcorp.in");
  });

  it("rejects blocked domains and file-like TLDs", () => {
    expect(isValidEmail("user@example.com")).toBe(false);
    expect(isValidEmail("logo@company.png")).toBe(false);
    expect(isValidEmail("bad@localhost")).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(sanitizeEmail("garbage")).toBeUndefined();
    expect(sanitizeEmail(null)).toBeUndefined();
  });

  it("identifies generic company emails", () => {
    expect(isGenericCompanyEmail("info@company.com")).toBe(true);
    expect(isGenericCompanyEmail("priya.sharma@company.com")).toBe(false);
  });

  it("picks best email preferring personal over generic", () => {
    expect(pickBestEmail(["info@co.com", "john@co.com"])).toBe("john@co.com");
    expect(pickBestEmail(["info@co.com"])).toBe("info@co.com");
    expect(pickBestEmail(["invalid", "also-bad"])).toBeUndefined();
  });
});

describe("ENRICH-UNIT-002 Indian phone validation", () => {
  it("accepts valid 10-digit mobile numbers", () => {
    expect(isValidIndianPhone("9845012345")).toBe(true);
    expect(isValidIndianPhone("+91 98450 12345")).toBe(true);
    expect(sanitizePhone("09845012345")).toBe("9845012345");
  });

  it("rejects invalid phone numbers", () => {
    expect(isValidIndianPhone("1234567890")).toBe(false);
    expect(isValidIndianPhone("5845012345")).toBe(false);
    expect(sanitizePhone("123")).toBeUndefined();
  });

  it("picks first valid phone", () => {
    expect(pickBestPhone(["invalid", "9845012345"])).toBe("9845012345");
  });
});
