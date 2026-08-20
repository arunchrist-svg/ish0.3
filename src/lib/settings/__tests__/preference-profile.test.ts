import { describe, expect, it } from "vitest";
import {
  applyPreferenceExtract,
  buildPreferenceSummary,
  extractPreferencesFromText,
  isPreferenceReady,
  mapChipToExtract,
  mergePreferenceExtract,
  normalizeOutreachCtaId,
  profileFromExtract,
  resolveDefaultOutreachCta,
  topicsCoveredFromExtract,
  emptyPreferenceProfile,
} from "@/lib/settings/preference-profile";
import type { BrandConfig } from "@/lib/email/config";

const baseBrand: BrandConfig = {
  brandSlug: "custom",
  brandName: "Acme",
  productSummary: "Corporate gifting",
  vertical: "general",
  verticalPackId: "gifting-sweets",
  platformIntent: "corporate_gifting",
  buyerPersonas: ["HR"],
  toneNotes: "",
};

describe("preference-profile", () => {
  it("extracts industries, geo, and CTA from free text", () => {
    const extract = extractPreferencesFromText(
      "Technology companies in Karnataka. First email asks for a demo. We close with a call.",
    );
    expect(extract.industries).toContain("Technology");
    expect(extract.geo?.stateIds).toContain("KA");
    expect(extract.preferredCtaIds).toContain("gift_sampling");
    expect(extract.closePath).toBe("book_call");
  });

  it("merges departments and seniority without cross-contamination", () => {
    const merged = mergePreferenceExtract(
      { departments: ["HR"], seniority: ["Director"] },
      { departments: ["Admin"], seniority: ["VP"] },
    );
    expect(merged.departments).toEqual(["HR", "Admin"]);
    expect(merged.seniority).toEqual(["Director", "VP"]);
  });

  it("requires scout, email, and close before finish", () => {
    expect(isPreferenceReady(["scout", "email", "close"])).toBe(true);
    expect(isPreferenceReady(["scout", "email"])).toBe(false);
    expect(isPreferenceReady(["leads", "email", "close"])).toBe(false);
  });

  it("maps email chips to default CTA", () => {
    const extract = mapChipToExtract("Meet online", baseBrand, "email");
    expect(extract.defaultCtaId).toBe("meet_online");
    expect(topicsCoveredFromExtract(extract)).toContain("email");
  });

  it("applies extract to brand config and geo", () => {
    const extract = mergePreferenceExtract(
      mergePreferenceExtract(
        extractPreferencesFromText("Technology in Karnataka"),
        mapChipToExtract("Meet online", baseBrand, "email"),
      ),
      { closePath: "book_call" },
    );
    extract.defaultCtaId = "meet_online";

    const applied = applyPreferenceExtract(baseBrand, extract);
    expect(applied.brand.defaultOutreachCta).toBe("meet_online");
    expect(applied.brand.websiteInsights?.scoutIndustries).toContain("Technology");
    expect(applied.geo?.stateIds).toContain("KA");
    expect(applied.campaignNotes).toMatch(/Close motion/i);
  });

  it("builds a readable summary from extract", () => {
    const summary = buildPreferenceSummary({
      industries: ["Technology"],
      seniority: ["Director"],
      preferredCtaIds: ["meet_online"],
      closePath: "book_call",
      geo: { entireIndia: false, regionIds: [], stateIds: ["KA"], districtIds: [] },
    });
    expect(summary).toMatch(/scout/i);
    expect(summary).toMatch(/Meet online/i);
  });

  it("stores transcript and topics on profile", () => {
    const profile = profileFromExtract(
      emptyPreferenceProfile(),
      {
        industries: ["Technology"],
        preferredCtaIds: ["meet_online"],
        defaultCtaId: "meet_online",
        closePath: "book_call",
        geo: { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] },
      },
      [
        { role: "assistant", content: "Who should Scout look for?", createdAt: new Date().toISOString() },
        { role: "user", content: "Technology across India", createdAt: new Date().toISOString() },
      ],
    );
    expect(profile.messages).toHaveLength(2);
    expect(profile.topicsCovered).toEqual(expect.arrayContaining(["scout", "email", "close"]));
    expect(profile.summary.length).toBeGreaterThan(10);
  });

  it("normalizes outreach CTA ids", () => {
    expect(normalizeOutreachCtaId("meet online")).toBe("meet_online");
    expect(normalizeOutreachCtaId("send a sample")).toBe("gift_sampling");
  });

  it("resolves default outreach CTA from brand preference", () => {
    expect(resolveDefaultOutreachCta({ ...baseBrand, defaultOutreachCta: "meet_online" })).toBe("meet_online");
    expect(resolveDefaultOutreachCta(baseBrand)).toBe("gift_sampling");
  });
});
