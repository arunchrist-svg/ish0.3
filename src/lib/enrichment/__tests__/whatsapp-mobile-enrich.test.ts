import { afterEach, describe, expect, it, vi } from "vitest";
import {
  providerChainForEnrichSetting,
  shouldStopOnPersonalEmail,
  withZintlrPhoneProvider,
} from "@/lib/enrichment/provider-config";
import { shouldSkipProviderEnrichment } from "@/lib/enrichment/enrich-lead";
import { resolveSavedWhatsAppPhone } from "@/lib/enrichment/validate-contact";
import { needsEnrichment } from "@/lib/leads/import/import-leads";

describe("WhatsApp mobile enrich chain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("appends Zintlr after free web sources when keys are set", () => {
    vi.stubEnv("ZINTLR_ACCESS_TOKEN", "token");
    vi.stubEnv("ZINTLR_SECRET_KEY", "secret");
    expect(withZintlrPhoneProvider(["website_email", "web_snippets", "ai_research", "google_places"])).toEqual([
      "website_email",
      "web_snippets",
      "ai_research",
      "zintlr",
      "google_places",
    ]);
    expect(providerChainForEnrichSetting("website_email", "free")).toContain("zintlr");
  });

  it("places Zintlr right after paid email finders for email-first unlock", () => {
    vi.stubEnv("ZINTLR_ACCESS_TOKEN", "token");
    vi.stubEnv("ZINTLR_SECRET_KEY", "secret");
    vi.stubEnv("PROSPEO_API_KEY", "pk");
    vi.stubEnv("APOLLO_API_KEY", "apollo");
    const chain = providerChainForEnrichSetting("prospeo", "paid");
    const prospeoIdx = chain.indexOf("prospeo");
    const zintlrIdx = chain.indexOf("zintlr");
    expect(zintlrIdx).toBeGreaterThan(prospeoIdx);
    expect(zintlrIdx).toBeLessThan(chain.indexOf("website_email"));
  });

  it("does not add Zintlr when enrich provider is none", () => {
    vi.stubEnv("ZINTLR_ACCESS_TOKEN", "token");
    vi.stubEnv("ZINTLR_SECRET_KEY", "secret");
    expect(providerChainForEnrichSetting("none", "free")).toEqual([]);
  });

  it("does not stop on personal email when no WhatsApp mobile exists yet", () => {
    expect(
      shouldStopOnPersonalEmail({
        stopOnPersonalEmail: true,
        email: "priya.sharma@testcorp.in",
        score: 40,
        phone: undefined,
        candidatePhones: [],
      }),
    ).toBe(false);
  });

  it("stops on personal email once a WhatsApp mobile is present", () => {
    expect(
      shouldStopOnPersonalEmail({
        stopOnPersonalEmail: true,
        email: "priya.sharma@testcorp.in",
        score: 40,
        phone: "9845012345",
      }),
    ).toBe(true);
  });
});

describe("shouldSkipProviderEnrichment", () => {
  it("skips providers when a keepable email is already present (phone optional)", () => {
    expect(
      shouldSkipProviderEnrichment({
        existingEmail: "priya.sharma@gmail.com",
        companyName: "Test Corp",
        mode: "free",
      }),
    ).toBe(true);
  });

  it("skips providers when a keepable email and mobile are already present", () => {
    expect(
      shouldSkipProviderEnrichment({
        existingEmail: "priya.sharma@gmail.com",
        existingPhone: "9845012345",
        companyName: "Test Corp",
        mode: "free",
      }),
    ).toBe(true);
  });

  it("still runs providers when email is missing", () => {
    expect(
      shouldSkipProviderEnrichment({
        existingPhone: "9845012345",
        companyName: "Test Corp",
        mode: "free",
      }),
    ).toBe(false);
  });
});

describe("resolveSavedWhatsAppPhone", () => {
  it("keeps a Zintlr mobile even when email is not auto-accepted", () => {
    expect(resolveSavedWhatsAppPhone(undefined, "+91 98450 12345")).toBe("9845012345");
  });

  it("falls back to a sanitized scout mobile", () => {
    expect(resolveSavedWhatsAppPhone("09845012345", "2222334455")).toBe("9845012345");
  });
});

describe("import needsEnrichment phone gate", () => {
  const complete = {
    email: "priya.sharma@testcorp.in",
    emailStatus: "verified",
    phone: "9845012345",
    title: "HR Director",
    linkedIn: "https://www.linkedin.com/in/priya",
    domain: "testcorp.in",
    website: "https://testcorp.in",
  };

  it("does not re-enrich a complete row with a WhatsApp mobile", () => {
    expect(needsEnrichment(complete)).toBe(false);
  });

  it("still enriches when the only phone is a landline", () => {
    expect(needsEnrichment({ ...complete, phone: "2222334455" })).toBe(true);
  });
});
