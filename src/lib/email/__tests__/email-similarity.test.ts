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

Most corporate hampers get opened and forgotten. Ours get opened and remembered: pure-ghee mithai, handcrafted, the taste of an actual festival.

Don't take our word for it. Let us send Acme Auto a taste first.

Want a sampler box on your desk this week?

Thanks & Regards
Srilaksha`;

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
