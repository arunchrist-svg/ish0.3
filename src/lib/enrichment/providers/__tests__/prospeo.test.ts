import { afterEach, describe, expect, it, vi } from "vitest";
import { prospeoProvider } from "@/lib/enrichment/providers/prospeo";
import { providerChainForEnrichSetting } from "@/lib/enrichment/provider-config";

describe("prospeo enrich provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubKey() {
    vi.stubEnv("PROSPEO_API_KEY", "test-prospeo-key");
  }

  it("finds a verified work email from LinkedIn URL", async () => {
    stubKey();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        person: {
          full_name: "Karthi P",
          current_job_title: "Human Resources Manager",
          linkedin_url: "https://www.linkedin.com/in/karthi-p-autosense",
          email: {
            status: "VERIFIED",
            revealed: true,
            email: "karthi.p@autosense.in",
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prospeoProvider.enrich({
      name: "Karthi P",
      company: "Autosense Private Limited",
      title: "Human Resources Manager",
      linkedinUrl: "https://www.linkedin.com/in/karthi-p-autosense",
      websiteUrl: "https://autosense.in",
    });

    expect(result?.contact.email).toBe("karthi.p@autosense.in");
    expect(result?.providerId).toBe("prospeo");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      only_verified_email: true,
      enrich_mobile: false,
      data: {
        linkedin_url: "https://www.linkedin.com/in/karthi-p-autosense",
        company_website: "autosense.in",
        company_name: "Autosense Private Limited",
      },
    });
  });

  it("returns null when Prospeo has no verified email", async () => {
    stubKey();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          error: false,
          person: {
            email: { status: "UNVERIFIED", revealed: true, email: "guess@autosense.in" },
          },
        }),
      }),
    );

    const result = await prospeoProvider.enrich({
      name: "Karthi P",
      company: "Autosense Private Limited",
      linkedinUrl: "https://www.linkedin.com/in/karthi-p-autosense",
    });
    expect(result).toBeNull();
  });

  it("returns null on NO_MATCH without throwing", async () => {
    stubKey();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: true, error_code: "NO_MATCH" }),
      }),
    );

    const result = await prospeoProvider.enrich({
      name: "Karthi P",
      company: "Autosense Private Limited",
      linkedinUrl: "https://www.linkedin.com/in/karthi-p-autosense",
    });
    expect(result).toBeNull();
  });
});

describe("providerChainForEnrichSetting prospeo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leads with Prospeo when enrich provider is prospeo and key is set", () => {
    vi.stubEnv("PROSPEO_API_KEY", "test-prospeo-key");
    vi.stubEnv("APOLLO_API_KEY", "apollo-key");
    const chain = providerChainForEnrichSetting("prospeo", "paid");
    expect(chain[0]).toBe("prospeo");
    expect(chain).toContain("apollo");
    expect(chain).toContain("website_email");
  });
});
