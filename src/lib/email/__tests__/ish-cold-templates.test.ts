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
    expect(e1.subjectA).toBe("Sample box for festive tasting, Vijetha");
    expect(e1.subjectB).toBe("Festive sweets sample for Acme Auto");
    expect(e1.subjectC).toBe("A tasting box for your team");
    expect(e1.emailBody).toMatch(/Most corporate festival gifts are forgotten by the next day/);
    expect(e1.emailBody).toMatch(/for the team at Acme Auto this year/);
    expect(e1.emailBody).toMatch(/crafted fresh every morning with organic milk, ghee, and khova from our own farm/);
    expect(e1.emailBody).toMatch(/We never add preservatives or chemicals/);
    expect(e1.emailBody).not.toMatch(/no artificial flavors/);
    expect(e1.emailBody).not.toMatch(/100% pure ghee/);
    expect(e1.emailBody).toMatch(/tasting is believing/);
    expect(e1.emailBody).toMatch(/sample box to Acme Auto as our treat/);
    expect(e1.emailBody).toMatch(/What is the best delivery address to ship it to\?/);
    expect(e1.emailBodyB).toMatch(/employees and clients/);
    expect(e1.emailBodyB).toMatch(/can bring that to Acme Auto/);
    expect(e1.emailBodyB).toMatch(/We never add preservatives or chemicals/);
    expect(e1.emailBodyB).toMatch(/organic milk from our own farm/);
    expect(e1.emailBodyB).toMatch(/ship a sampler to Acme Auto this week/);
    expect(e1.emailBodyC).toMatch(/Diwali gifting to employees and clients at Acme Auto/);
    expect(e1.emailBodyC).toMatch(/farm-fresh mithai/);
    expect(e1.emailBodyC).toMatch(/Production is highly hygienic/);
    expect(e1.emailBodyC).not.toMatch(/USA|Australia/);
    expect(e1.emailBodyC).toMatch(/Want it sent to Acme Auto this week\?/);
    expect(e1.emailBody).toMatch(/Best,\nSrilaksha\nIndia Sweet House/);
    expect(e1.emailBody).not.toMatch(/Thanks & Regards/);
    expect(e1.emailBody).not.toMatch(/Franchise Owner/);
    expect(e1.emailBody).not.toMatch(/Partnerships/);
  });

  it("names the company in every Email 1, 2, and 3 option", () => {
    for (const body of [e1.emailBody, e1.emailBodyB, e1.emailBodyC, e2.emailBody, e2.emailBodyB, e2.emailBodyC, e3.emailBody, e3.emailBodyB, e3.emailBodyC]) {
      expect(body).toContain("Acme Auto");
    }
  });

  it("keeps the three Email 1 options as different sequences, not paraphrases", () => {
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyB, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBody, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
    expect(isNearParaphrase(e1.emailBodyB, e1.emailBodyC, BASELINE_PARAPHRASE_THRESHOLD, "hook")).toBe(false);
  });

  it("fills E2 with dairy, variety, and hygiene selling points", () => {
    expect(e2.subjectA).toBe("Re: Sample box for festive tasting, Vijetha");
    expect(e2.emailBody).toMatch(/for Diwali at Acme Auto/);
    expect(e2.emailBody).toMatch(/organic milk/);
    expect(e2.emailBody).toMatch(/never add preservatives or chemicals/);
    expect(e2.emailBody).not.toMatch(/USA|Australia/);
    expect(e2.emailBody).not.toMatch(/export-grade|farm-to-counter|zero preservatives/);
    expect(e2.emailBody).toMatch(/That is how the team at Acme Auto can relish authentic traditional sweets this season/);
    expect(e2.emailBody).toMatch(/tasting box/);
    expect(e2.emailBody).not.toMatch(/\bfree sampler\b/i);
    expect(e2.emailBodyB).toMatch(/more than 200 traditional/);
    expect(e2.emailBodyB).toMatch(/Jaggery Kaju Katli/);
    expect(e2.emailBodyB).toMatch(/Sugarfree Honey Laddu/);
    expect(e2.emailBodyC).toMatch(/own dairy farm/);
    expect(e2.emailBodyC).toMatch(/never adds preservatives or chemicals/);
    expect(e2.emailBodyC).not.toMatch(/USA|Australia/);
  });

  it("fills E3 breakup with a short ISH authenticity line", () => {
    expect(e3.emailBody).toMatch(/I won't email further/);
    expect(e3.emailBody).toMatch(/organic milk from our own farm/);
    expect(e3.emailBody).toMatch(/tasting box for Acme Auto/);
    expect(e3.emailBody).toMatch(/Wishing you a happy festival season/);
    expect(e3.emailBody).not.toMatch(/Diwali/);
    expect(e3.emailBodyB).toMatch(/here for Acme Auto/);
    expect(e3.emailBodyB).toMatch(/never add preservatives or chemicals/);
    expect(e3.emailBodyB).toMatch(/door stays open/);
    expect(e3.emailBodyB).toMatch(/Wishing Acme Auto a happy festival season/);
    expect(e3.emailBodyB).not.toMatch(/Diwali/);
    expect(e3.emailBodyC).toMatch(/hygienic production/);
    expect(e3.emailBodyC).not.toMatch(/USA|Australia/);
    expect(e3.emailBodyC).not.toMatch(/export-grade/);
    expect(e3.emailBodyC).toMatch(/own farm/);
    expect(e3.emailBodyC).toMatch(/Wishing the team at Acme Auto a happy festival season/);
    expect(e3.emailBodyC).not.toMatch(/Diwali/);
  });

  it("strips legal suffixes from company mentions in copy", () => {
    const legal = fillIshDraftVariants({
      ...names,
      companyName: "Kems India Pvt Ltd",
      sequencePosition: 1,
    });
    expect(legal.subjectB).toBe("Festive sweets sample for Kems");
    expect(legal.emailBody).toMatch(/team at Kems this year/);
    expect(legal.emailBody).toMatch(/sample box to Kems as our treat/);
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
    expect(e2Legal.subjectB).toBe("Re: Festive sweets sample for Kems");
  });

  it("swaps only the Email 1 CTA for meet_online / meet_in_person", () => {
    const online = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_online" });
    expect(online.emailBody).toMatch(/Most corporate festival gifts are forgotten by the next day/);
    expect(online.emailBody).toMatch(/online walkthrough/);
    expect(online.emailBody).not.toMatch(/sample box to Acme Auto as our treat/);
    const inPerson = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_in_person" });
    expect(inPerson.emailBody).toMatch(/in-person tasting/);
  });

  it("uses store opening copy without Diwali subjects", () => {
    const opening = fillIshDraftVariants({ ...names, sequencePosition: 1, occasionId: "store_opening" });
    expect(opening.subjectA).toMatch(/store coming up|store launch/i);
    expect(opening.subjectA.toLowerCase()).not.toMatch(/diwali|festive tasting/);
    expect(opening.subjectB.toLowerCase()).not.toMatch(/diwali|festive/);
    expect(opening.emailBody).toMatch(/coming up|store and office openings|inauguration/i);
    expect(opening.emailBody.toLowerCase()).not.toContain("diwali");
  });

  it("uses upcoming opening copy when timing is upcoming", () => {
    const opening = fillIshDraftVariants({
      ...names,
      sequencePosition: 1,
      occasionId: "store_opening",
      occasionTiming: "upcoming",
    });
    expect(opening.subjectA).toMatch(/coming up/i);
    expect(opening.emailBody).toMatch(/inauguration mithai/i);
    expect(opening.emailBody.toLowerCase()).not.toContain("diwali");
  });

  it("uses birthday and pantry copy without festive subjects", () => {
    const birthday = fillIshDraftVariants({ ...names, sequencePosition: 1, occasionId: "birthday" });
    expect(birthday.subjectA).toMatch(/monthly birthdays/i);
    expect(birthday.subjectA.toLowerCase()).not.toMatch(/diwali|festive/);
    const pantry = fillIshDraftVariants({ ...names, sequencePosition: 1, occasionId: "pantry" });
    expect(pantry.subjectA).toMatch(/office pantry/i);
    expect(pantry.emailBody.toLowerCase()).not.toContain("diwali");
  });
});
