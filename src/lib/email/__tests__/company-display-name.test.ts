import { describe, expect, it } from "vitest";
import {
  companyNameForEmail,
  isUsableCompanyNameForEmail,
  scrubLegalEntityCopy,
} from "@/lib/email/company-display-name";

describe("companyNameForEmail", () => {
  it("strips India Pvt Ltd and other legal suffixes", () => {
    expect(companyNameForEmail("Seg Automotive India Pvt Ltd")).toBe("Seg Automotive");
    expect(companyNameForEmail("ACME Food Pvt. Ltd.")).toBe("ACME Food");
    expect(companyNameForEmail("Kems Private Limited")).toBe("Kems");
    expect(companyNameForEmail("Bosch Limited")).toBe("Bosch");
  });

  it("shortens MV Pvt Ltd to MV", () => {
    expect(companyNameForEmail("MV Pvt Ltd")).toBe("MV");
    expect(companyNameForEmail("Moneyview Private Limited")).toBe("Moneyview");
  });

  it("keeps India Sweet House intact", () => {
    expect(companyNameForEmail("India Sweet House")).toBe("India Sweet House");
  });

  it("falls back when empty or unusable", () => {
    expect(companyNameForEmail("")).toBe("your team");
    expect(companyNameForEmail("   ")).toBe("your team");
    expect(companyNameForEmail("HR")).toBe("your team");
    expect(companyNameForEmail("Careers")).toBe("your team");
    expect(companyNameForEmail("Pvt Ltd")).toBe("your team");
  });
});

describe("isUsableCompanyNameForEmail", () => {
  it("accepts real trading names", () => {
    expect(isUsableCompanyNameForEmail("MV Pvt Ltd")).toBe(true);
    expect(isUsableCompanyNameForEmail("Seg Automotive")).toBe(true);
  });

  it("rejects junk and non-company strings", () => {
    expect(isUsableCompanyNameForEmail("")).toBe(false);
    expect(isUsableCompanyNameForEmail("Admin")).toBe(false);
    expect(isUsableCompanyNameForEmail("Untitled")).toBe(false);
  });
});

describe("scrubLegalEntityCopy", () => {
  it("replaces short company plus legal suffix with short name", () => {
    expect(scrubLegalEntityCopy("A sample for MV Pvt Ltd this week", "MV")).toBe(
      "A sample for MV this week",
    );
    expect(
      scrubLegalEntityCopy("Gifting at Moneyview Private Limited works", "Moneyview"),
    ).toBe("Gifting at Moneyview works");
  });

  it("strips leftover Pvt Ltd phrases without breaking limited time", () => {
    expect(scrubLegalEntityCopy("We have limited time for Pvt Ltd reviews", "MV")).toMatch(
      /limited time/,
    );
    expect(scrubLegalEntityCopy("We have limited time for Pvt Ltd reviews", "MV")).not.toMatch(
      /Pvt\.?\s*Ltd/i,
    );
  });
});
