import { describe, expect, it } from "vitest";
import {
  formatCompanyDisplayName,
  formatPersonDisplayName,
  needsLetterCasingFix,
  titleCaseToken,
} from "@/lib/leads/display-name-format";

describe("needsLetterCasingFix", () => {
  it("flags all caps and all lowercase", () => {
    expect(needsLetterCasingFix("RENUKA M")).toBe(true);
    expect(needsLetterCasingFix("jose antonio")).toBe(true);
    expect(needsLetterCasingFix("Renuka M")).toBe(false);
    expect(needsLetterCasingFix("C O.")).toBe(true);
  });
});

describe("formatPersonDisplayName", () => {
  it("title-cases all-caps and lowercase names", () => {
    expect(formatPersonDisplayName("RENUKA M")).toBe("Renuka M");
    expect(formatPersonDisplayName("jose antonio")).toBe("Jose Antonio");
    expect(formatPersonDisplayName("C O.")).toBe("C O.");
  });

  it("leaves mixed-case names alone", () => {
    expect(formatPersonDisplayName("McDonald")).toBe("McDonald");
    expect(formatPersonDisplayName("Nandkishor Joshi")).toBe("Nandkishor Joshi");
  });
});

describe("formatCompanyDisplayName", () => {
  it("title-cases all-caps legal names", () => {
    expect(formatCompanyDisplayName("QUALIFOUR AUTO PRODUCTS INDIA PRIVATE LIMITED")).toBe(
      "Qualifour Auto Products India Private Limited",
    );
    expect(formatCompanyDisplayName("NASH INDUSTRIES PVT LTD")).toBe("Nash Industries PVT LTD");
  });

  it("leaves mixed-case companies alone", () => {
    expect(formatCompanyDisplayName("Seg Automotive India Pvt Ltd")).toBe(
      "Seg Automotive India Pvt Ltd",
    );
  });
});

describe("titleCaseToken", () => {
  it("handles initials and hyphenated parts", () => {
    expect(titleCaseToken("c.")).toBe("C.");
    expect(titleCaseToken("anne-marie")).toBe("Anne-Marie");
  });
});
