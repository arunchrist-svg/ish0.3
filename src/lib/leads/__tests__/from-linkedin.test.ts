import { describe, expect, it, vi, beforeEach } from "vitest";
import { LinkedInProfileIncompleteError, resolveLinkedInProfile } from "@/lib/leads/from-linkedin";

vi.mock("@/lib/enrichment/tavily-client", () => ({
  tavilySearch: vi.fn(),
}));

vi.mock("@/lib/enrichment/discovery-prerequisites", () => ({
  hasTavilyKey: vi.fn(() => true),
}));

vi.mock("@/lib/enrichment/enrich-accurate", () => ({
  enrichContactAccurate: vi.fn(async () => ({ contact: null, message: "no match" })),
}));

import { tavilySearch } from "@/lib/enrichment/tavily-client";
import { enrichContactAccurate } from "@/lib/enrichment/enrich-accurate";

describe("resolveLinkedInProfile", () => {
  beforeEach(() => {
    vi.mocked(tavilySearch).mockReset();
    vi.mocked(enrichContactAccurate).mockReset();
    vi.mocked(enrichContactAccurate).mockResolvedValue({
      contact: null,
      message: "no match",
      source: "none",
      candidates: [],
      attempts: [],
    });
  });

  it("rejects invalid LinkedIn URLs", async () => {
    await expect(resolveLinkedInProfile("https://example.com")).rejects.toThrow(/LinkedIn profile URL/i);
  });

  it("parses name, title, company, and city from Tavily hits", async () => {
    vi.mocked(tavilySearch).mockResolvedValue([
      {
        title: "Meera Iyer | Plant HR Manager at Titan Company Ltd | LinkedIn",
        url: "https://www.linkedin.com/in/meera-iyer",
        content: "Plant HR Manager at Titan Company, Hosur, Tamil Nadu, India.",
      },
    ]);

    const profile = await resolveLinkedInProfile("https://linkedin.com/in/meera-iyer");

    expect(profile.name).toBe("Meera Iyer");
    expect(profile.title).toMatch(/Plant HR Manager/i);
    expect(profile.company).toBe("Titan Company Ltd");
    expect(profile.city).toMatch(/Hosur/i);
    expect(profile.linkedIn).toBe("https://linkedin.com/in/meera-iyer");
  });

  it("merges enrichment contact fields when providers return data", async () => {
    vi.mocked(tavilySearch).mockResolvedValue([
      {
        title: "Asha Rao | HR Director at Acme Auto | LinkedIn",
        url: "https://www.linkedin.com/in/asha-rao",
        content: "HR Director at Acme Auto in Bengaluru.",
      },
    ]);
    vi.mocked(enrichContactAccurate).mockResolvedValue({
      contact: {
        name: "Asha Rao",
        title: "HR Director",
        company: "Acme Auto",
        email: "asha.rao@acmeauto.com",
        phone: "+919876543211",
        linkedinUrl: "https://www.linkedin.com/in/asha-rao",
      },
      providerId: "prospeo",
      confidence: 90,
      source: "provider",
      candidates: [],
      attempts: [],
    });

    const profile = await resolveLinkedInProfile("linkedin.com/in/asha-rao");

    expect(profile.email).toBe("asha.rao@acmeauto.com");
    expect(profile.phone).toBe("9876543211");
    expect(profile.company).toBe("Acme Auto");
  });

  it("throws incomplete error when company cannot be resolved", async () => {
    vi.mocked(tavilySearch).mockResolvedValue([
      {
        title: "Jane Doe | Consultant | LinkedIn",
        url: "https://www.linkedin.com/in/jane-doe",
        content: "Independent consultant helping teams grow.",
      },
    ]);

    await expect(resolveLinkedInProfile("https://linkedin.com/in/jane-doe")).rejects.toBeInstanceOf(
      LinkedInProfileIncompleteError,
    );
  });
});
