import { describe, expect, it } from "vitest";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";

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

  it("keeps Option 1 and Option 3 Email 1 wording", () => {
    const withLocation = fillIshDraftVariants({
      ...names,
      sequencePosition: 1,
      fromLocation: "Kasturinagar",
    });
    expect(withLocation.subjectA).toBe("A festive sample for Acme Auto");
    expect(withLocation.subjectB).toBe("Festive sweets sample for Acme Auto");
    expect(withLocation.subjectC).toBe("");
    expect(withLocation.emailBody).toMatch(/shouldn't just be another line item/);
    expect(withLocation.emailBody).toMatch(/value your team at Acme Auto/);
    expect(withLocation.emailBody).toMatch(/To match that standard/);
    expect(withLocation.emailBody).toMatch(/100% pure ghee/);
    expect(withLocation.emailBody).toMatch(/Karma Farm/);
    expect(withLocation.emailBody).toMatch(/zero varak/);
    expect(withLocation.emailBody).toMatch(/no chemicals/);
    expect(withLocation.emailBody).toMatch(/as our treat/);
    expect(withLocation.emailBody).toMatch(/best delivery address to ship it to/);
    expect(withLocation.emailBody).not.toMatch(/₹165|Manikya|net weight/i);
    expect(withLocation.emailBodyB).toMatch(/shouldn't just be another line item/);
    expect(withLocation.emailBodyB).toMatch(/same care we use at home/);
    expect(withLocation.emailBodyB).toMatch(/100% pure ghee/);
    expect(withLocation.emailBodyB).toMatch(/skipping varak and chemicals/);
    expect(withLocation.emailBodyB).toMatch(/evaluate the quality yourself/);
    expect(withLocation.emailBodyB).toMatch(/best delivery address to send it to/);
    expect(withLocation.emailBodyC).toBe("");
    expect(withLocation.emailBody).toMatch(/Warmly,\nSrilaksha\nIndia Sweet House, Kasturinagar/);
    expect(withLocation.emailBody).not.toMatch(/Thanks & Regards/);
    expect(withLocation.emailBody).not.toMatch(/Franchise Owner/);
    expect(withLocation.emailBody).not.toMatch(/Partnerships/);
  });

  it("uses From name and omits location when Settings leave location blank", () => {
    const draft = fillIshDraftVariants({
      contactFirstName: "Arun",
      companyName: "Moneyview",
      senderFirstName: "Prasanth",
      brandName: "India Sweet House",
      sequencePosition: 1,
    });
    expect(draft.emailBody).toMatch(/Warmly,\nPrasanth\nIndia Sweet House$/);
    expect(draft.emailBody).not.toMatch(/Kasturinagar/);
  });

  it("appends From phone and email under Warmly when set", () => {
    const withPhone = fillIshDraftVariants({
      ...names,
      sequencePosition: 1,
      fromLocation: "Kasturinagar",
      senderPhone: "+91 98765 43210",
      fromAddress: "srilaksha@indiasweethouse.in",
    });
    expect(withPhone.emailBody).toMatch(
      /Warmly,\nSrilaksha\nIndia Sweet House, Kasturinagar\n\n\+91 98765 43210 \| srilaksha@indiasweethouse\.in/,
    );
    expect(withPhone.emailBodyB).toMatch(/\+91 98765 43210 \| srilaksha@indiasweethouse\.in/);
  });

  it("names the company in every Email 1, 2, and 3 option", () => {
    for (const body of [e1.emailBody, e1.emailBodyB, e2.emailBody, e2.emailBodyB, e3.emailBody, e3.emailBodyB]) {
      expect(body).toContain("Acme Auto");
    }
  });

  it("keeps Option A and B sharing the opener but differing in the ISH story", () => {
    expect(e1.emailBody).toMatch(/every sweet the exact same way/);
    expect(e1.emailBody).toMatch(/home-style warmth/);
    expect(e1.emailBodyB).toMatch(/same care we use at home/);
    expect(e1.emailBodyB).toMatch(/warm, personal, and truly special/);
    expect(e1.emailBody).not.toMatch(/same care we use at home/);
    expect(e1.emailBodyB).not.toMatch(/home-style warmth/);
  });

  it("fills E2 Option A with 200+ menu proof and ship-to CTA", () => {
    expect(e2.subjectA).toBe("Re: A festive sample for Acme Auto");
    expect(e2.emailBody).toMatch(/known for a wide menu/);
    expect(e2.emailBody).toMatch(/more than 200 traditional sweets and namkeens/);
    expect(e2.emailBody).toMatch(/Jaggery Kaju Katli/);
    expect(e2.emailBody).toMatch(/Sugarfree Honey Laddu/);
    expect(e2.emailBody).toMatch(/Acme Auto/);
    expect(e2.emailBody).not.toMatch(/USA|Australia/);
    expect(e2.emailBody).toMatch(/sample box/);
    expect(e2.emailBody).toMatch(/best address to ship it to/);
    expect(e2.emailBody).not.toMatch(/\bfree sampler\b/i);
    expect(e2.emailBodyB).toMatch(/ownership of the dairy|Karma Farm/);
    expect(e2.emailBodyB).toMatch(/votes on/);
    expect(e2.emailBodyB).toMatch(/delivery address/);
    expect(e2.emailBodyB).not.toMatch(/e-gift coupons|Kanaka|Manikya/i);
    expect(e2.emailBodyC).toBe("");
  });

  it("uses the full festive catalogue for Email 2/3 when prior email was opened", () => {
    const openedE2 = fillIshDraftVariants({ ...names, sequencePosition: 2, inboxOpened: true });
    expect(openedE2.emailBody).toMatch(/Every festive gift carries a message/);
    expect(openedE2.emailBody).toMatch(/nine gifting ranges/);
    expect(openedE2.emailBody).toMatch(/Karma Farm/);
    expect(openedE2.emailBody).toMatch(/Manikya & Neelam/);
    expect(openedE2.emailBody).toMatch(/e-gift coupons/);
    expect(openedE2.emailBody).toMatch(/flat minimum 10%/);
    expect(openedE2.emailBody).toMatch(/2026 catalogue/);
    expect(openedE2.emailBody).toMatch(/Warmly,/);
    expect(openedE2.emailBody).not.toMatch(/—/);
    expect(openedE2.emailBodyB).toMatch(/nine gifting ranges/);

    const openedE3 = fillIshDraftVariants({ ...names, sequencePosition: 3, inboxOpened: true });
    expect(openedE3.emailBody).toMatch(/nine gifting ranges/);
    expect(openedE3.emailBody).not.toMatch(/I won't email further/);
  });

  it("keeps short Email 2 when not opened", () => {
    expect(e2.emailBody).not.toMatch(/nine gifting ranges/);
  });

  it("fills E3 breakup with a short ISH authenticity line", () => {
    expect(e3.emailBody).toMatch(/I won't email further/);
    expect(e3.emailBody).toMatch(/Karma Farm/);
    expect(e3.emailBody).toMatch(/sample box/);
    expect(e3.emailBody).toMatch(/reply with where to ship it/);
    expect(e3.emailBody).toMatch(/Wishing you a happy festival season/);
    expect(e3.emailBody).not.toMatch(/Diwali/);
    expect(e3.emailBodyB).toMatch(/here/);
    expect(e3.emailBodyB).toMatch(/Karma Farm/);
    expect(e3.emailBodyB).not.toMatch(/Moti box|coupons/i);
    expect(e3.emailBodyB).toMatch(/where to ship it at Acme Auto/);
    expect(e3.emailBodyB).toMatch(/Wishing Acme Auto a happy festival season/);
    expect(e3.emailBodyB).not.toMatch(/Diwali/);
    expect(e3.emailBodyC).toBe("");
  });

  it("strips legal suffixes from company mentions in copy", () => {
    const legal = fillIshDraftVariants({
      ...names,
      companyName: "Kems India Pvt Ltd",
      sequencePosition: 1,
    });
    expect(legal.subjectB).toBe("Festive sweets sample for Kems");
    expect(legal.emailBody).toMatch(/value your team at Kems/);
    expect(legal.emailBody).toMatch(/delivery address to ship it to/);
    expect(legal.emailBodyB).toMatch(/delivery address to send it to/);
    expect(legal.emailBodyB).not.toMatch(/Pvt\.?\s*Ltd/i);
    expect(legal.emailBodyB).not.toMatch(/India Pvt/i);
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
    expect(online.emailBody).toMatch(/shouldn't just be another line item/);
    expect(online.emailBody).toMatch(/online walkthrough/);
    expect(online.emailBody).not.toMatch(/best delivery address to ship it to/);
    const inPerson = fillIshDraftVariants({ ...names, sequencePosition: 1, templateId: "meet_in_person" });
    expect(inPerson.emailBody).toMatch(/in-person tasting/);
    expect(inPerson.emailBody).not.toMatch(/best delivery address to ship it to/);
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
