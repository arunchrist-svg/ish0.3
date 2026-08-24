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

A festive gift shouldn't just be another line item. It's a real reflection of how much you value your team at Acme Auto.

To match that standard, India Sweet House makes every sweet the exact same way we would for our own family. Because we use 100% pure ghee and fresh dairy straight from our own Karma Farm, everything is handcrafted with clean ingredients, zero varak, and no chemicals so every box carries that genuine, home-style warmth.

I'd love to send a sample box over to your office as our treat so you can try it out firsthand. What is the best delivery address to ship it to?

Warmly,
Srilaksha
India Sweet House, Kasturinagar`;

describe("email similarity", () => {
  it("flags a light BASE_TEXT noun swap as a near paraphrase", () => {
    expect(isNearParaphrase(VIJETHA_NOUN_SWAP, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(
      true,
    );
  });

  it("treats Option B body as a different middle story from Option A", () => {
    const copy = fillIshDraftVariants({ ...names, sequencePosition: 1 });
    expect(copy.emailBodyB).toMatch(/same care we use at home/);
    expect(copy.emailBody).toMatch(/home-style warmth/);
    expect(copy.emailBodyB).not.toMatch(/home-style warmth/);
  });

  it("treats identical E1 and E2 bodies as a sequence clone", () => {
    expect(isNearParaphrase(baseline, baseline)).toBe(true);
  });
});
