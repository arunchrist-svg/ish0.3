import { describe, expect, it } from "vitest";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { isNearParaphrase, BASELINE_PARAPHRASE_THRESHOLD } from "@/lib/email/email-similarity";

const names = {
  contactFirstName: "Vijetha",
  companyName: "Acme Auto",
  senderFirstName: "Srilaksha",
  brandName: "India Sweet House",
};

describe("ISH cold email templates", () => {
  const e1 = fillIshDraftVariants({ ...names, sequencePosition: 1 });
  const e2 = fillIshDraftVariants({ ...names, sequencePosition: 2 });
  const e3 = fillIshDraftVariants({ ...names, sequencePosition: 3 });

  it("keeps Sequence 1/2/3 Email 1 wording from the ISH file", () => {
    expect(e1.subjectA).toBe("Send happiness this Diwali, Vijetha");
    expect(e1.subjectB).toBe("Acme Auto, make someone's Diwali better");
    expect(e1.subjectC).toBe("Happiness, handcrafted");
    expect(e1.emailBody).toMatch(/Most corporate gifts get opened and forgotten/);
    expect(e1.emailBody).toMatch(/Let us send Acme Auto a taste first/);
    expect(e1.emailBody).toMatch(/Want a sampler box on your desk this week\?/);
    expect(e1.emailBodyB).toMatch(/A good gift doesn't just say "thank you."/);
    expect(e1.emailBodyB).toMatch(/Send me an address and I'll ship a sampler this week/);
    expect(e1.emailBodyC).toMatch(/No fillers\. No mass production/);
    expect(e1.emailBodyC).toMatch(/Want it sent to Acme Auto this week\?/);
    expect(e1.emailBody).toMatch(/Thanks & Regards\nSrilaksha/);
    expect(e1.emailBody).not.toMatch(/Partnerships/);
    const named = fillIshDraftVariants({
      ...names,
      senderFirstName: "Srilasha",
      sequencePosition: 1,
    });
    expect(named.emailBody).toMatch(/Thanks & Regards\nSrilasha/);
  });

  it("keeps the three Email 1 options as different sequences, not paraphrases", () => {
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyB, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBodyB, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
  });

  it("fills E2 and E3 from the matching sequences", () => {
    expect(e2.subjectA).toBe("Re: Send happiness this Diwali, Vijetha");
    expect(e2.emailBody).toMatch(/Following up on my note below/);
    expect(e2.emailBody).toMatch(/ship a free sampler to Acme Auto/);
    expect(e2.emailBodyB).toMatch(/Just circling back/);
    expect(e2.emailBodyC).toMatch(/before Diwali orders lock in/);
    expect(e3.emailBody).toMatch(/I won't email further/);
    expect(e3.emailBody).toMatch(/Wishing you a great Diwali either way/);
    expect(e3.emailBodyC).toMatch(/Happy Diwali in advance/);
  });

  it("swaps only the Email 1 CTA for meet_online / meet_in_person", () => {
    const online = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_online" });
    expect(online.emailBody).toMatch(/opened and remembered/);
    expect(online.emailBody).toMatch(/online walkthrough/);
    expect(online.emailBody).not.toMatch(/Want a sampler box on your desk this week\?/);
    const inPerson = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_in_person" });
    expect(inPerson.emailBody).toMatch(/in-person tasting/);
  });
});
