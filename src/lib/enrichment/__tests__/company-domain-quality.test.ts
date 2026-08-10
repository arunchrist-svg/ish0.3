import { describe, expect, it } from "vitest";
import {
  domainBelongsToCompany,
  isAcceptableCompanyDomain,
  isUnusableCompanyDomain,
} from "@/lib/enrichment/company-domain-quality";
import { resolveAccountDomain } from "@/lib/enrichment/email-permutations";

describe("company domain quality", () => {
  it("rejects news and directory hosts", () => {
    expect(isUnusableCompanyDomain("manufacturingtodayindia.com")).toBe(true);
    expect(isUnusableCompanyDomain("www.tracxn.com")).toBe(true);
    expect(isUnusableCompanyDomain("goto")).toBe(true);
    expect(isUnusableCompanyDomain("pavna.in")).toBe(false);
  });

  it("requires the domain slug to match the company brand", () => {
    expect(domainBelongsToCompany("pavnagroup.com", "Pavna Industries")).toBe(true);
    expect(domainBelongsToCompany("pavna.in", "Pavna Industries")).toBe(true);
    expect(domainBelongsToCompany("manufacturingtodayindia.com", "Pavna Industries")).toBe(false);
    expect(domainBelongsToCompany("psa-avtec.com", "STELLANTIS AVTEC POWERTRAIN INDIA")).toBe(true);
    expect(isAcceptableCompanyDomain("manufacturingtodayindia.com", "Pavna Industries")).toBe(false);
  });

  it("falls back to a company-name domain when the stored host is a publisher", () => {
    expect(
      resolveAccountDomain({
        domain: "manufacturingtodayindia.com",
        website: "https://www.manufacturingtodayindia.com/pavna-industries-expands-footprint",
        companyName: "Pavna Industries",
      }),
    ).toBe("pavnaindustries.com");
  });
});
