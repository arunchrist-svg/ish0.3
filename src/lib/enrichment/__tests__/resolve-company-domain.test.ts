import { describe, expect, it } from "vitest";
import { resolveCompanyDomain, extractOfficialWebsiteFromHits } from "@/lib/enrichment/resolve-company-domain";
import { extractCompanyDomain } from "@/lib/company-logo";

describe("resolveCompanyDomain", () => {
  it("resolves SCHUNK Intec India to schunk.com and drops zaubacorp", async () => {
    expect(extractCompanyDomain({ name: "SCHUNK Intec India Pvt Ltd" })).toBe("schunk.com");

    const resolved = await resolveCompanyDomain({
      companyName: "SCHUNK Intec India Pvt Ltd",
      website: "https://www.zaubacorp.com/company/SCHUNK-INTEC-INDIA-PRIVATE-LIMITED/U29253KA2008PTC046123",
      allowExternal: false,
    });

    expect(resolved.domain).toBe("schunk.com");
    expect(resolved.website).toBe("https://www.schunk.com");
    expect(resolved.source).toBe("provided");
  });

  it("maps Automotive Axles slug guesses to autoaxle.com", async () => {
    expect(extractCompanyDomain({ name: "Automotive Axles Limited" })).toBe("autoaxle.com");

    const resolved = await resolveCompanyDomain({
      companyName: "Automotive Axles Limited",
      domain: "automotiveaxles.com",
      website: "https://www.automotiveaxles.com",
      allowExternal: false,
    });

    expect(resolved.domain).toBe("autoaxle.com");
    expect(resolved.website).toBe("https://www.autoaxle.com");
    expect(resolved.source).toBe("provided");
  });

  it("stays empty when no official domain is known and external lookup is off", async () => {
    const resolved = await resolveCompanyDomain({
      companyName: "Unknown Local Workshop LLP",
      website: "https://www.indiamart.com/unknown-local-workshop",
      allowExternal: false,
    });
    expect(resolved.domain).toBeUndefined();
    expect(resolved.website).toBeUndefined();
    expect(resolved.source).toBe("unresolved");
  });

  it("reads an official website out of a Zauba snippet instead of keeping zaubacorp.com", () => {
    const found = extractOfficialWebsiteFromHits(
      [
        {
          title: "COPRAL ENERGY PRIVATE LIMITED",
          url: "https://www.zaubacorp.com/company/COPRAL-ENERGY-PRIVATE-LIMITED/U40100KA2010PTC012345",
          content: "CIN U40100KA2010PTC012345. Website: www.copralenergy.in Email info@copralenergy.in",
        },
      ],
      "COPRAL ENERGY PRIVATE LIMITED",
    );
    expect(found?.domain).toBe("copralenergy.in");
  });

  it("picks aronuniversal.com from a Google-style official site hit", () => {
    const found = extractOfficialWebsiteFromHits(
      [
        {
          title: "ARON Universal",
          url: "https://aronuniversal.com/",
          content:
            "Aron Universal, a trusted fluorescent colors manufacturer since 1974, produces premium fluorescent pigments in Bangalore.",
        },
      ],
      "Aron Universal",
    );
    expect(found?.domain).toBe("aronuniversal.com");
    expect(found?.website).toMatch(/aronuniversal\.com/);
  });

  it("keeps a pasted holding-company website that does not match the legal name", async () => {
    const resolved = await resolveCompanyDomain({
      companyName: "Sansu Automotives Private Limited",
      website: "https://www.familygroup.in",
      allowExternal: false,
    });
    expect(resolved.domain).toBe("familygroup.in");
    expect(resolved.website).toBe("https://www.familygroup.in");
  });
});
