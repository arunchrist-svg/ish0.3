import { describe, expect, it } from "vitest";
import { fillIshDraftVariants, ISH_BULK_FIRST_NAME_TOKEN } from "@/lib/email/ish-cold-templates";
import { companyNameForEmail } from "@/lib/email/company-display-name";

const COMPANY_TOKEN = "AcmeBulkRefCo";

describe("bulk template reference fill", () => {
  it("keeps a stable company token through companyNameForEmail + Prasant fill", () => {
    expect(companyNameForEmail(COMPANY_TOKEN)).toBe(COMPANY_TOKEN);

    const e2 = fillIshDraftVariants({
      contactFirstName: ISH_BULK_FIRST_NAME_TOKEN,
      companyName: COMPANY_TOKEN,
      senderFirstName: "Prasant",
      brandName: "India Sweet House",
      sequencePosition: 2,
      templateId: "prasanth_sequence",
    });

    expect(e2.subjectA).toContain(COMPANY_TOKEN);
    expect(e2.emailBody).toContain(COMPANY_TOKEN);
    expect(e2.emailBody).toMatch(new RegExp(`^Hi ${ISH_BULK_FIRST_NAME_TOKEN},`));

    const company = "Infosys";
    const firstName = "Raj";
    const subject = e2.subjectA.split(COMPANY_TOKEN).join(company);
    const body = e2.emailBody
      .split(COMPANY_TOKEN)
      .join(company)
      .split(ISH_BULK_FIRST_NAME_TOKEN)
      .join(firstName);
    expect(subject).toContain("Infosys");
    expect(subject).not.toContain(COMPANY_TOKEN);
    expect(body).toContain("Infosys");
    expect(body).not.toContain(COMPANY_TOKEN);
    expect(body).toMatch(/^Hi Raj,/);
    expect(body).not.toContain("Hi there");
  });

  it("Prasant email 1 is identical across companies (no company token needed)", () => {
    const a = fillIshDraftVariants({
      contactFirstName: ISH_BULK_FIRST_NAME_TOKEN,
      companyName: "Infosys",
      senderFirstName: "Prasant",
      brandName: "India Sweet House",
      sequencePosition: 1,
      templateId: "prasanth_sequence",
    });
    const b = fillIshDraftVariants({
      contactFirstName: ISH_BULK_FIRST_NAME_TOKEN,
      companyName: "Biocon",
      senderFirstName: "Prasant",
      brandName: "India Sweet House",
      sequencePosition: 1,
      templateId: "prasanth_sequence",
    });
    expect(a.subjectA).toBe(b.subjectA);
    expect(a.emailBody).toBe(b.emailBody);
  });
});
