import { describe, expect, it } from "vitest";
import { getBaselineEmail } from "@/lib/email/baseline-templates";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { BASELINE_PARAPHRASE_THRESHOLD, isNearParaphrase } from "@/lib/email/email-similarity";

const names = {
  contactFirstName: "Vijetha",
  senderFirstName: "Srilaksha",
  brandName: "India Sweet House",
  companyName: "Acme Auto",
};

const baseline = getBaselineEmail({
  sequencePosition: 1,
  templateId: "gift_sampling",
  ...names,
});

const VIJETHA_NOUN_SWAP = `Hi Vijetha,

Most corporate festival gifts are forgotten by the next day. We wanted to offer something memorable and authentic for your team this year.

At India Sweet House, we handcraft authentic traditional sweets. We go straight from our own farm to the box with zero compromises. There are no artificial flavors and no preservatives. It is just fresh milk, 100% pure ghee, and a taste that stands out.

Since tasting is believing, I would love to send a sample box to your office on us. What is the best address to ship your sample box?

Best,
Srilaksha
India Sweet House`;

describe("email similarity", () => {
  it("flags a light BASE_TEXT noun swap as a near paraphrase", () => {
    expect(isNearParaphrase(VIJETHA_NOUN_SWAP, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(
      true,
    );
  });

  it("treats Sequence 2 and Sequence 3 as distinct from Sequence 1", () => {
    const copy = fillIshDraftVariants({ ...names, sequencePosition: 1 });
    expect(isNearParaphrase(copy.emailBodyB, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(copy.emailBodyC, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
  });

  it("treats identical E1 and E2 bodies as a sequence clone", () => {
    expect(isNearParaphrase(baseline, baseline)).toBe(true);
  });
});
