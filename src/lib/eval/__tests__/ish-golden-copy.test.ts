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
    expect(seq1.emailBody).toMatch(/Most corporate festival gifts are forgotten by the next day/);
    expect(seq1.emailBody).toMatch(/crafted fresh every morning with organic milk, ghee, and khova from our own farm/);
    expect(seq1.emailBody).toMatch(/sample box to Nebula Tech as our treat/i);
    expect(seq1.emailBody).toMatch(/What is the best delivery address to ship it to\?/);
    expect(seq1.emailBody).toMatch(/never add preservatives or chemicals/);
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

  it("Sequence 3 is a different thesis from Sequence 1", () => {
    expect(seq3Mfg.emailBodyC).toMatch(/Diwali gifting to employees and clients at SEG Automotive/);
    expect(seq3Mfg.emailBodyC).toMatch(/farm-fresh mithai/);
    expect(seq3Mfg.emailBodyC).toContain("SEG Automotive");
    const baseline = getBaselineEmail({
      sequencePosition: 1,
      contactFirstName: "Kavitha",
      senderFirstName: "Srilaksha",
      brandName: "India Sweet House",
      companyName: "SEG Automotive",
    });
    expect(isNearParaphrase(seq3Mfg.emailBodyC, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(
      false,
    );
  });
});
