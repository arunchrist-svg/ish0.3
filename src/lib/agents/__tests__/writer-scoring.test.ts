import { describe, expect, it } from "vitest";
import {
  scoreDeliverability,
  getDeliverabilityIssues,
  scoreRubric,
  scoreRubricTotal,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_DIMENSIONS,
  RUBRIC_PASS_THRESHOLD,
} from "@/lib/agents/writer-scoring";

const GOOD_BODY = `Hi Priya,

I noticed Test Corp India has been investing in employee engagement across Bangalore.

We help IT companies with premium Diwali gifting for teams of 500+. Would a 15-minute call next week work to explore options for your team?

No worries if the timing is off.

Best regards`;

describe("AGENT-UNIT-001 deliverability scoring", () => {
  it("scores clean email highly", async () => {
    const score = await scoreDeliverability(GOOD_BODY, "Diwali gifting for Test Corp");
    expect(score).toBeGreaterThanOrEqual(DELIVERABILITY_PASS_THRESHOLD);
    expect(deliverabilityVerdict(score)).toMatch(/PASS|MARGINAL/);
  });

  it("penalizes spam trigger words", async () => {
    const spammy = "Act now for a FREE guarantee! Click here to buy now with 100% urgent offer!";
    const score = await scoreDeliverability(spammy, "FREE OFFER");
    expect(score).toBeLessThan(DELIVERABILITY_PASS_THRESHOLD);
    expect(deliverabilityVerdict(score)).toBe("FAIL");
  });

  it("penalizes generic subject lines", async () => {
    const score = await scoreDeliverability(GOOD_BODY, "Quick question");
    expect(score).toBeLessThan(await scoreDeliverability(GOOD_BODY, "Diwali gifting for Test Corp"));
  });

  it("penalizes filler closings", async () => {
    const withFiller = `${GOOD_BODY}\n\nLooking forward to hearing from you.`;
    const score = await scoreDeliverability(withFiller, "Diwali gifting for Test Corp");
    expect(score).toBeLessThan(await scoreDeliverability(GOOD_BODY, "Diwali gifting for Test Corp"));
  });

  it("penalizes very long emails", async () => {
    const long = await scoreDeliverability("word ".repeat(250), "Subject");
    const good = await scoreDeliverability(GOOD_BODY, "Diwali gifting");
    expect(long).toBeLessThan(good);
  });

  it("reports deliverability issues", async () => {
    const issues = await getDeliverabilityIssues("A very short email.");
    expect(issues).toContain("no question CTA");
  });
});

describe("AGENT-UNIT-002 rubric scoring", () => {
  it("scores personalised email across all dimensions", async () => {
    const rubric = await scoreRubric({
      subjectA: "Diwali gifting for Test Corp India",
      emailBody: GOOD_BODY,
      contact: { name: "Priya Sharma", firstName: "Priya", title: "HR Director" },
      account: { name: "Test Corp India", industry: "IT", city: "Bangalore", employees: "500" },
    });

    for (const dim of RUBRIC_DIMENSIONS) {
      expect(rubric[dim]).toBeGreaterThan(0);
      expect(rubric[dim]).toBeLessThanOrEqual(25);
    }
    expect(scoreRubricTotal(rubric)).toBeGreaterThan(70);
  });

  it("scores generic email lower on personalization_depth", async () => {
    const generic = await scoreRubric({
      subjectA: "Hello",
      emailBody: "We offer gifting services. Please reply?",
      contact: { name: "Priya Sharma", firstName: "Priya" },
      account: { name: "Test Corp India" },
    });
    const tailored = await scoreRubric({
      subjectA: "Diwali gifting for Test Corp India",
      emailBody: GOOD_BODY,
      contact: { name: "Priya Sharma", firstName: "Priya", title: "HR Director" },
      account: { name: "Test Corp India", industry: "IT", employees: "500" },
    });
    expect(tailored.personalization_depth).toBeGreaterThan(generic.personalization_depth);
  });

  it("penalizes follow-up-only email 2 copy", async () => {
    const followUpOnly = await scoreDeliverability(
      "Hi Priya,\n\nJust following up on my last note. Did you get a chance to read it?\n\nThanks",
      "Following up",
      { sequencePosition: 2, contactFirstName: "Priya", account: { name: "Test Corp" } },
    );
    expect(followUpOnly).toBeLessThan(DELIVERABILITY_PASS_THRESHOLD);
  });
});

describe("reply draft scoring", () => {
  it("penalizes re-asking sample question after affirmative reply", async () => {
    const priorCta = "Would you be open to receiving a complimentary Diwali tasting sample?";
    const reAskBody = `Hi contact,

Thanks for your response. Would you be open to receiving a complimentary Diwali tasting sample?

Sri`;

    const addressBody = `Hi contact,

Great, thanks. To send the tasting box, could you share your office delivery address and a phone number for the courier?

Sri`;

    const reAskRubric = await scoreRubric({
      subjectA: "Re: Diwali gifts",
      emailBody: reAskBody,
      contact: { name: "contact", firstName: "contact" },
      account: { name: "Acme", city: "Hosur" },
      deliverabilityOptions: {
        sequencePosition: 4,
        isReplyDraft: true,
        replyIntent: "affirmative",
        priorCta,
      },
    });

    const addressRubric = await scoreRubric({
      subjectA: "Re: Diwali gifts",
      emailBody: addressBody,
      contact: { name: "contact", firstName: "contact" },
      account: { name: "Acme", city: "Hosur" },
      deliverabilityOptions: {
        sequencePosition: 4,
        isReplyDraft: true,
        replyIntent: "affirmative",
        priorCta,
      },
    });

    expect(addressRubric.cta_quality).toBeGreaterThan(reAskRubric.cta_quality);
  });
});
