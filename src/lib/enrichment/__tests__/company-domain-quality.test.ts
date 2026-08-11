import { describe, expect, it } from "vitest";
import {
  domainBelongsToCompany,
  isAcceptableCompanyDomain,
  isUnusableCompanyDomain,
  usableStoredDomain,
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
    expect(isAcceptableCompanyDomain("jindalsteel.in", "Hosur Steel Industries")).toBe(false);
    expect(isAcceptableCompanyDomain("jindalsteel.in", "Tata Steel")).toBe(false);
    expect(isAcceptableCompanyDomain("tatasteel.com", "Tata Steel")).toBe(true);
    expect(isAcceptableCompanyDomain("jindalsteel.in", "Jindal Steel")).toBe(true);
    expect(usableStoredDomain("jindalsteel.in", "Hosur Steel Industries")).toBeNull();
    expect(usableStoredDomain("tatasteel.com", "Tata Steel")).toBe("tatasteel.com");
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
