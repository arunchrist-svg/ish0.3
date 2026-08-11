import { describe, expect, it } from "vitest";
import { companyNameForEmail } from "@/lib/email/company-display-name";

describe("companyNameForEmail", () => {
  it("strips India Pvt Ltd and other legal suffixes", () => {
    expect(companyNameForEmail("Seg Automotive India Pvt Ltd")).toBe("Seg Automotive");
    expect(companyNameForEmail("ACME Food Pvt. Ltd.")).toBe("ACME Food");
    expect(companyNameForEmail("Kems Private Limited")).toBe("Kems");
    expect(companyNameForEmail("Bosch Limited")).toBe("Bosch");
  });

  it("keeps India Sweet House intact", () => {
    expect(companyNameForEmail("India Sweet House")).toBe("India Sweet House");
  });

  it("falls back when empty", () => {
    expect(companyNameForEmail("")).toBe("your team");
    expect(companyNameForEmail("   ")).toBe("your team");
  });
});
