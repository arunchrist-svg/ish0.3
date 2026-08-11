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

  it("keeps Sequence 1/2/3 Email 1 wording with own-dairy selling points", () => {
    expect(e1.subjectA).toBe("Send happiness this Diwali, Vijetha");
    expect(e1.subjectB).toBe("Acme Auto, make someone's Diwali better");
    expect(e1.subjectC).toBe("Happiness, handcrafted");
    expect(e1.emailBody).toMatch(/Most corporate festival gifts are forgotten by the next day/);
    expect(e1.emailBody).toMatch(/something memorable and authentic for your team this year/);
    expect(e1.emailBody).toMatch(/handcraft authentic traditional sweets/);
    expect(e1.emailBody).toMatch(/straight from our own farm to the box with zero compromises/);
    expect(e1.emailBody).toMatch(/no artificial flavors/);
    expect(e1.emailBody).toMatch(/It is just fresh milk, 100% pure ghee, and a taste that stands out/);
    expect(e1.emailBody).toMatch(/tasting is believing/);
    expect(e1.emailBody).toMatch(/sample box to your office on us/);
    expect(e1.emailBody).toMatch(/What is the best address to ship your sample box\?/);
    expect(e1.emailBodyB).toMatch(/employees and clients/);
    expect(e1.emailBodyB).toMatch(/can bring that to Acme Auto/);
    expect(e1.emailBodyB).toMatch(/zero preservatives/);
    expect(e1.emailBodyB).toMatch(/organic milk from our own dairy/);
    expect(e1.emailBodyB).toMatch(/Send me an address and I'll ship a sampler this week/);
    expect(e1.emailBodyC).toMatch(/Diwali gifting to employees and clients/);
    expect(e1.emailBodyC).toMatch(/can bring farm-to-counter mithai/);
    expect(e1.emailBodyC).toMatch(/global export/);
    expect(e1.emailBodyC).toMatch(/Want it sent to Acme Auto this week\?/);
    expect(e1.emailBody).toMatch(/Best,\nSrilaksha\nIndia Sweet House/);
    expect(e1.emailBody).not.toMatch(/Thanks & Regards/);
    expect(e1.emailBody).not.toMatch(/Franchise Owner/);
    expect(e1.emailBody).not.toMatch(/Partnerships/);
  });

  it("keeps the three Email 1 options as different sequences, not paraphrases", () => {
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyB, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBodyB, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
  });

  it("fills E2 with dairy, variety, and hygiene selling points", () => {
    expect(e2.subjectA).toBe("Re: Send happiness this Diwali, Vijetha");
    expect(e2.emailBody).toMatch(/farm-to-counter pipeline/);
    expect(e2.emailBody).toMatch(/organic milk from our own dairy/);
    expect(e2.emailBody).toMatch(/zero preservatives/);
    expect(e2.emailBody).toMatch(/USA and Australia/);
    expect(e2.emailBody).toMatch(/tasting box/);
    expect(e2.emailBody).not.toMatch(/\bfree sampler\b/i);
    expect(e2.emailBodyB).toMatch(/more than 200 traditional/);
    expect(e2.emailBodyB).toMatch(/Jaggery Kaju Katli/);
    expect(e2.emailBodyB).toMatch(/Sugarfree Honey Laddu/);
    expect(e2.emailBodyC).toMatch(/own dairy farm/);
    expect(e2.emailBodyC).toMatch(/chemical preservatives/);
    expect(e2.emailBodyC).toMatch(/USA and Australia/);
  });

  it("fills E3 breakup with a short ISH authenticity line", () => {
    expect(e3.emailBody).toMatch(/I won't email further/);
    expect(e3.emailBody).toMatch(/own organic dairy/);
    expect(e3.emailBody).toMatch(/Wishing you a great Diwali either way/);
    expect(e3.emailBodyB).toMatch(/zero preservatives/);
    expect(e3.emailBodyB).toMatch(/door stays open/);
    expect(e3.emailBodyB).toMatch(/happy Diwali/i);
    expect(e3.emailBodyC).toMatch(/export-grade hygiene/);
    expect(e3.emailBodyC).toMatch(/own dairy/);
    expect(e3.emailBodyC).toMatch(/Happy Diwali in advance/);
  });

  it("strips legal suffixes from company mentions in copy", () => {
    const legal = fillIshDraftVariants({
      ...names,
      companyName: "Kems India Pvt Ltd",
      sequencePosition: 1,
    });
    expect(legal.subjectB).toBe("Kems, make someone's Diwali better");
    expect(legal.emailBodyC).toMatch(/Want it sent to Kems this week\?/);
    expect(legal.emailBodyC).not.toMatch(/Pvt\.?\s*Ltd/i);
    expect(legal.emailBodyC).not.toMatch(/India Pvt/i);
    const e2Legal = fillIshDraftVariants({
      ...names,
      companyName: "Kems India Pvt Ltd",
      sequencePosition: 2,
    });
    expect(e2Legal.emailBody).toContain("Kems");
    expect(e2Legal.emailBody).not.toMatch(/Pvt\.?\s*Ltd/i);
    expect(e2Legal.subjectB).toBe("Re: Kems, make someone's Diwali better");
  });

  it("swaps only the Email 1 CTA for meet_online / meet_in_person", () => {
    const online = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_online" });
    expect(online.emailBody).toMatch(/Most corporate festival gifts are forgotten by the next day/);
    expect(online.emailBody).toMatch(/online walkthrough/);
    expect(online.emailBody).not.toMatch(/sample box to your office on us/);
    const inPerson = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_in_person" });
    expect(inPerson.emailBody).toMatch(/in-person tasting/);
  });
});
