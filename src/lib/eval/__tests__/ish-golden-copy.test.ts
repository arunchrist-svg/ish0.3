import { describe, expect, it } from "vitest";
import { looksLikeLlmJsonDump } from "@/lib/agents/schemas/writer-output";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { getBaselineEmail } from "@/lib/email/baseline-templates";
import { BASELINE_PARAPHRASE_THRESHOLD, isNearParaphrase } from "@/lib/email/email-similarity";

const seq1 = fillIshDraftVariants({
  contactFirstName: "Abhimanyu",
  companyName: "Nebula Tech",
  senderFirstName: "Srilaksha",
  brandName: "India Sweet House",
  sequencePosition: 1,
});

const seq3Mfg = fillIshDraftVariants({
  contactFirstName: "Kavitha",
  companyName: "SEG Automotive",
  senderFirstName: "Srilaksha",
  brandName: "India Sweet House",
  sequencePosition: 1,
});

describe("ISH golden copy shape", () => {
  it("Sequence 1 stays on the ISH file wording", () => {
    expect(looksLikeLlmJsonDump(seq1.emailBody)).toBe(false);
    expect(seq1.emailBody).toContain("\n\n");
    expect(seq1.emailBody).toMatch(/shouldn't just be another line item/);
    expect(seq1.emailBody).toMatch(/value your team at Nebula Tech/);
    expect(seq1.emailBody).toMatch(/Karma Farm/);
    expect(seq1.emailBody).toMatch(/best delivery address to ship it to/);
    expect(seq1.emailBody).not.toMatch(/No worries/i);
    expect(seq1.emailBody).not.toMatch(/\boffers\b|\bspecializes in\b/i);
    expect(seq1.emailBody).not.toMatch(/\b\d{2,}\s*(employees|staff|headcount)\b/i);

    const baseline = getBaselineEmail({
      sequencePosition: 1,
      contactFirstName: "Abhimanyu",
      senderFirstName: "Srilaksha",
      brandName: "India Sweet House",
      companyName: "Nebula Tech",
    });
    expect(isNearParaphrase(seq1.emailBody, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(true);
  });

  it("Option B is a different ISH story from Option A", () => {
    expect(seq3Mfg.emailBodyB).toMatch(/same care we use at home|evaluate the quality yourself/);
    expect(seq3Mfg.emailBodyB).toContain("SEG Automotive");
    expect(seq3Mfg.emailBodyB).not.toMatch(/Manikya/);
    expect(seq3Mfg.emailBody).toMatch(/home-style warmth/);
    expect(seq3Mfg.emailBodyB).not.toMatch(/home-style warmth/);
  });
});
