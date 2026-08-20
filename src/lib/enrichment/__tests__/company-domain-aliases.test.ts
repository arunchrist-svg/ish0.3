import { describe, expect, it } from "vitest";
import {
  brandDomainSlugs,
  companyDomainAliases,
  pickBestOrganizationMatch,
} from "@/lib/enrichment/company-domain-aliases";
import { extractCompanyDomain, getCompanyLogoSources } from "@/lib/company-logo";

describe("companyDomainAliases", () => {
  it("keeps the Apollo domain first and adds common Titan aliases", () => {
    const aliases = companyDomainAliases({
      companyName: "Titan Company",
      domain: "titancompany.in",
    });
    expect(aliases[0]).toBe("titancompany.in");
    expect(aliases).toContain("titan.co.in");
    expect(aliases).toContain("titan.in");
  });

  it("builds brand slugs with and without Company", () => {
    const slugs = brandDomainSlugs("Titan Company Ltd");
    expect(slugs).toContain("titan");
    expect(slugs).toContain("titancompany");
  });
});

describe("pickBestOrganizationMatch", () => {
  it("prefers the larger Apollo org over a tiny name collision", () => {
    const match = pickBestOrganizationMatch(
      [
        { name: "Titan Company", domain: "titancompany.in", employees: "50" },
        { name: "Titan Company Limited", domain: "titan.co.in", employees: "8500" },
      ],
      "Titan Company",
    );
    expect(match?.domain).toBe("titan.co.in");
  });

  it("accepts titancompany.in when it is the only usable org", () => {
    const match = pickBestOrganizationMatch(
      [{ name: "Titan Company Limited", domain: "titancompany.in", employees: "8500" }],
      "Titan Company",
    );
    expect(match?.domain).toBe("titancompany.in");
  });
});

describe("Titan logo domain", () => {
  it("uses titancompany.in from name fallback and resolved domain", () => {
    expect(extractCompanyDomain({ name: "Titan Company" })).toBe("titancompany.in");
    expect(extractCompanyDomain({ name: "Titan Company", domain: "titancompany.in" })).toBe(
      "titancompany.in",
    );
    expect(getCompanyLogoSources({ name: "Titan Company" })[0]).toBe(
      "https://www.google.com/s2/favicons?domain=titancompany.in&sz=128",
    );
  });

  it("maps Automotive Axles to autoaxle.com and drops the slug guess", () => {
    expect(extractCompanyDomain({ name: "Automotive Axles Limited" })).toBe("autoaxle.com");
    const aliases = companyDomainAliases({
      companyName: "Automotive Axles Limited",
      domain: "automotiveaxles.com",
    });
    expect(aliases[0]).toBe("autoaxle.com");
    expect(aliases).not.toContain("automotiveaxles.com");
    expect(getCompanyLogoSources({ name: "Automotive Axles Limited" })[0]).toBe(
      "https://www.google.com/s2/favicons?domain=autoaxle.com&sz=128",
    );
  });

  it("maps SCHUNK Intec India to schunk.com", () => {
    expect(extractCompanyDomain({ name: "SCHUNK Intec India Pvt Ltd" })).toBe("schunk.com");
    expect(getCompanyLogoSources({ name: "SCHUNK Intec India Pvt Ltd" })[0]).toBe(
      "https://www.google.com/s2/favicons?domain=schunk.com&sz=128",
    );
  });

  it("tries the known Titan domain before a dead alias like titan.co.in", () => {
    const sources = getCompanyLogoSources({ name: "Titan Company", domain: "titan.co.in" });
    expect(sources[0]).toBe("https://www.google.com/s2/favicons?domain=titancompany.in&sz=128");
    expect(sources).toContain("https://www.google.com/s2/favicons?domain=titan.co.in&sz=128");
  });

  it("looks up TEREX from the company name", () => {
    expect(extractCompanyDomain({ name: "TEREX INDIA PRIVATE LIMITED" })).toBe("terex.com");
    const sources = getCompanyLogoSources({ name: "Copral Energy" }, { includeLookup: true });
    expect(sources.some((src) => src.startsWith("/api/company-logo?"))).toBe(true);
  });
});
