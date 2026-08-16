import { describe, expect, it } from "vitest";
import { resolveCompanyDomain } from "@/lib/enrichment/resolve-company-domain";
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
});
