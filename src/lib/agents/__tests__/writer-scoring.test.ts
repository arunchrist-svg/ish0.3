import { describe, expect, it } from "vitest";
import {
  scoreDeliverability,
  getDeliverabilityIssues,
  scoreRubric,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_DIMENSIONS,
} from "@/lib/agents/writer-scoring";

const GOOD_BODY = `Hi Priya,

I noticed Test Corp India has been investing in employee engagement across Bangalore.

We help IT companies with premium Diwali gifting for teams of 500+. Would a 15-minute call next week work to explore options for your team?

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

  it("penalizes very short and very long emails", async () => {
    const short = await scoreDeliverability("Hi there", "Hello");
    const long = await scoreDeliverability("word ".repeat(250), "Subject");
    expect(short).toBeLessThan(await scoreDeliverability(GOOD_BODY, "Diwali gifting"));
    expect(long).toBeLessThan(await scoreDeliverability(GOOD_BODY, "Diwali gifting"));
  });

  it("reports deliverability issues", async () => {
    const issues = await getDeliverabilityIssues("A very short email.");
    expect(issues).toContain("no CTA question");
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
  });

  it("scores generic email lower on personalisation", async () => {
    const generic = await scoreRubric({
      subjectA: "Hello",
      emailBody: "We offer gifting services. Please reply.",
      contact: { name: "Priya Sharma", firstName: "Priya" },
      account: { name: "Test Corp India" },
    });
    const tailored = await scoreRubric({
      subjectA: "Diwali gifting for Test Corp India",
      emailBody: GOOD_BODY,
      contact: { name: "Priya Sharma", firstName: "Priya", title: "HR Director" },
      account: { name: "Test Corp India", industry: "IT", employees: "500" },
    });
    expect(tailored.personalisation).toBeGreaterThan(generic.personalisation);
  });
});
