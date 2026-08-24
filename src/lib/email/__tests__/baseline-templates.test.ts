import { describe, expect, it } from "vitest";
import { getBaselineEmail, TRANSFORMATION_RULES } from "@/lib/email/baseline-templates";

const names = {
  contactFirstName: "Vijetha",
  senderFirstName: "Srilaksha",
  brandName: "India Sweet House",
  companyName: "Acme Auto",
};

describe("ISH baseline theses", () => {
  const e1 = getBaselineEmail({ sequencePosition: 1, templateId: "gift_sampling", ...names });
  const e2 = getBaselineEmail({ sequencePosition: 2, ...names });
  const e3 = getBaselineEmail({ sequencePosition: 3, ...names });

  it("gives E1 Sequence 1 from the ISH file", () => {
    expect(e1).toMatch(/shouldn't just be another line item/i);
    expect(e1).toMatch(/value your team at Acme Auto/i);
    expect(e1).toMatch(/To match that standard/i);
    expect(e1).toMatch(/Karma Farm/i);
    expect(e1).toMatch(/100% pure ghee/i);
    expect(e1).toMatch(/best delivery address to ship it to/i);
    expect(e1).toMatch(/Warmly,/);
    expect(e1).not.toMatch(/No worries/i);
    expect(e1).not.toMatch(/India Sweet House offers/i);
  });

  it("gives E2 Sequence 1 follow-up wording", () => {
    expect(e2).toMatch(/more than 200 traditional sweets and namkeens/i);
    expect(e2).toMatch(/known for a wide menu/i);
    expect(e2).toMatch(/India Sweet House/);
    expect(e2).toMatch(/Acme Auto/);
    expect(e2).not.toMatch(/USA|Australia/i);
    expect(e2).toMatch(/sample box/i);
    expect(e2).toMatch(/best address to ship it to/i);
    expect(e2).not.toMatch(/\bfree sampler\b/i);
    expect(e2).not.toMatch(/opened and forgotten/i);
  });

  it("gives E3 last note with ISH authenticity, won't email further, and festival-season close", () => {
    expect(e3).toMatch(/leave it here|filling your inbox/i);
    expect(e3).toMatch(/won't email further/i);
    expect(e3).toMatch(/reply with where to ship it/i);
    expect(e3).toMatch(/Karma Farm/i);
    expect(e3).toMatch(/Wishing you a happy festival season/);
    expect(e3).not.toMatch(/Diwali/i);
    expect(e3).not.toMatch(/custom lids/i);
  });

  it("keeps E1 CTA variants on the same Sequence 1 hook", () => {
    const online = getBaselineEmail({ sequencePosition: 1, templateId: "meet_online", ...names });
    const inPerson = getBaselineEmail({ sequencePosition: 1, templateId: "meet_in_person", ...names });
    expect(online).toMatch(/shouldn't just be another line item/i);
    expect(online).toMatch(/online walkthrough/i);
    expect(inPerson).toMatch(/in-person tasting/i);
    expect(online).not.toMatch(/No worries/i);
  });

  it("asks the writer to stay close to the ISH templates", () => {
    expect(TRANSFORMATION_RULES).toMatch(/90% of the ISH template wording/i);
    expect(TRANSFORMATION_RULES).toMatch(/two different sequences/i);
    expect(TRANSFORMATION_RULES).toMatch(/vendors lock in/i);
    expect(TRANSFORMATION_RULES).toMatch(/specializes in/i);
  });
});
