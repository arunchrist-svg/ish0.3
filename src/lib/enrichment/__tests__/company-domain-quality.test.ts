import { describe, expect, it } from "vitest";
import {
  distinctiveBrandTokens,
  domainBelongsToCompany,
  displayCompanyWebsite,
  isAcceptableCompanyDomain,
  isUnusableCompanyDomain,
  mergeResolvedWebsite,
  persistableCompanyWebsite,
  officialWebsiteForScoutCompany,
  usableStoredDomain,
  parsePastedCompanyWebsite,
  isKeepableContactEmail,
  emailBelongsToCompany,
} from "@/lib/enrichment/company-domain-quality";
import { resolveAccountDomain } from "@/lib/enrichment/email-permutations";

describe("company domain quality", () => {
  it("does not treat Hospital or Bank as distinctive brand tokens", () => {
    expect(distinctiveBrandTokens("Trilife Hospital")).toEqual(["trilife"]);
    expect(distinctiveBrandTokens("HDFC Bank")).toEqual(["hdfc"]);
    expect(distinctiveBrandTokens("Manav Charitable Hospital")).toEqual(["manav", "charitable"]);
  });

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

  it("accepts a pasted company website and rejects directory pages", () => {
    expect(parsePastedCompanyWebsite("https://www.familygroup.in/about")).toEqual({
      domain: "familygroup.in",
      website: "https://www.familygroup.in",
    });
    expect(parsePastedCompanyWebsite("zaubacorp.com")).toEqual({});
    expect(parsePastedCompanyWebsite("https://www.indiamart.com/sansu")).toEqual({});
  });

  it("rejects directory hosts and accepts SCHUNK's official site", () => {
    const schunk = "SCHUNK Intec India Pvt Ltd";
    expect(isUnusableCompanyDomain("zaubacorp.com")).toBe(true);
    expect(isUnusableCompanyDomain("indiamart.com")).toBe(true);
    expect(isUnusableCompanyDomain("justdial.com")).toBe(true);
    expect(isUnusableCompanyDomain("linkedin.com")).toBe(true);
    expect(isAcceptableCompanyDomain("zaubacorp.com", schunk)).toBe(false);
    expect(isAcceptableCompanyDomain("schunk.com", schunk)).toBe(true);
    expect(usableStoredDomain("zaubacorp.com", schunk)).toBeNull();
    expect(usableStoredDomain("schunk.com", schunk)).toBe("schunk.com");
  });

  it("merges overview website from a resolved official domain, not directories", () => {
    const schunk = "SCHUNK Intec India Pvt Ltd";
    expect(
      persistableCompanyWebsite(schunk, {
        domain: "zaubacorp.com",
        website: "https://www.zaubacorp.com/company/SCHUNK-INTEC-INDIA-PRIVATE-LIMITED/U29253KA2008PTC046123",
        source: "tavily",
      }),
    ).toEqual({});
    expect(
      persistableCompanyWebsite(schunk, {
        domain: "schunk.com",
        website: "https://www.schunk.com/in/en/company.html",
        source: "tavily",
      }),
    ).toEqual({ domain: "schunk.com", website: "https://www.schunk.com" });
    expect(
      mergeResolvedWebsite({
        companyName: schunk,
        resolved: { source: "unresolved" },
        existingDomain: "zaubacorp.com",
        existingWebsite: "https://www.zaubacorp.com/company/SCHUNK",
      }),
    ).toEqual({});
    expect(
      mergeResolvedWebsite({
        companyName: schunk,
        resolved: { domain: "schunk.com", website: "https://www.schunk.com", source: "provided" },
        existingDomain: "zaubacorp.com",
      }),
    ).toEqual({ domain: "schunk.com", website: "https://www.schunk.com" });
    expect(
      mergeResolvedWebsite({
        companyName: schunk,
        resolved: { source: "unresolved" },
        existingDomain: "schunk.com",
      }),
    ).toEqual({ domain: "schunk.com", website: "https://www.schunk.com" });
    expect(displayCompanyWebsite("zaubacorp.com", "https://www.zaubacorp.com/x")).toBeUndefined();
    expect(displayCompanyWebsite("schunk.com")).toEqual({
      href: "https://www.schunk.com",
      label: "schunk.com",
    });
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

  it("uses autoaxle.com for Automotive Axles, not the name slug", () => {
    expect(isAcceptableCompanyDomain("autoaxle.com", "Automotive Axles Limited")).toBe(true);
    expect(isAcceptableCompanyDomain("automotiveaxles.com", "Automotive Axles Limited")).toBe(false);
    expect(
      resolveAccountDomain({
        companyName: "Automotive Axles Limited",
      }),
    ).toBe("autoaxle.com");
    expect(
      resolveAccountDomain({
        domain: "automotiveaxles.com",
        website: "https://www.automotiveaxles.com",
        companyName: "Automotive Axles Limited",
      }),
    ).toBe("autoaxle.com");
  });

  it("uses CUMI Murugappa domain for Carborundum Universal, not the name slug", () => {
    expect(isAcceptableCompanyDomain("cumi-murugappa.com", "Carborundum Universal")).toBe(true);
    expect(isAcceptableCompanyDomain("carborundumuniversal.com", "Carborundum Universal")).toBe(false);
    expect(
      resolveAccountDomain({
        companyName: "Carborundum Universal",
      }),
    ).toBe("cumi-murugappa.com");
    expect(
      resolveAccountDomain({
        domain: "carborundumuniversal.com",
        companyName: "Carborundum Universal",
      }),
    ).toBe("cumi-murugappa.com");
  });

  it("strips a website whose slug does not match the scouted company", () => {
    const cleaned = officialWebsiteForScoutCompany({
      name: "Titan Company Ltd",
      domain: "justdial.com",
      website: "https://www.justdial.com/titan",
      fitScore: 60,
    });
    expect(cleaned.domain).toBeUndefined();
    expect(cleaned.website).toBeUndefined();
    const matched = officialWebsiteForScoutCompany({
      name: "Titan Company Ltd",
      domain: "titancompany.in",
      website: "https://www.titancompany.in",
      fitScore: 60,
    });
    expect(matched.domain).toBe("titancompany.in");
  });

  it("keeps personal inboxes even when they do not match the company domain", () => {
    expect(isKeepableContactEmail("abgupta89@gmail.com", "ABHIJIT GUPTA")).toBe(true);
    expect(isKeepableContactEmail("buyer@yahoo.com", "Paris Panini")).toBe(true);
    expect(emailBelongsToCompany("abgupta89@gmail.com", "ABHIJIT GUPTA")).toBe(false);
    expect(isKeepableContactEmail("sandeep.yadav@tatasteel.com", "Tata Steel")).toBe(true);
    expect(isKeepableContactEmail("sandeep.yadav@jindalsteel.in", "Tata Steel")).toBe(false);
  });
});
