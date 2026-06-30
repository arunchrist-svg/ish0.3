import { describe, expect, it } from "vitest";
import { pickOriginalEmailContext } from "@/lib/email/reply-context";

describe("pickOriginalEmailContext", () => {
  it("uses sent Email 1 body, not Email 3 draft", () => {
    const result = pickOriginalEmailContext({
      sentScheduleRows: [
        {
          sequenceDay: 0,
          emailKind: "initial",
          bodySnippet: "Email 1 sent: Would you like a tasting sample?",
          draftLeadOutreachId: "draft-1",
        },
      ],
      outreachRows: [
        {
          id: "draft-1",
          sequencePosition: 1,
          emailBody: "Email 1 draft body",
          templateVariant: "gift_sampling",
          subjectA: "Diwali gifts for Acme",
        },
        {
          id: "draft-3",
          sequencePosition: 3,
          emailBody: "Email 3 final reminder body",
          templateVariant: "final_reminder",
          subjectA: "Last note",
        },
      ],
    });

    expect(result.emailBody).toBe("Email 1 sent: Would you like a tasting sample?");
    expect(result.templateVariant).toBe("gift_sampling");
    expect(result.subjectA).toBe("Diwali gifts for Acme");
  });

  it("falls back to sequencePosition 1 outreach when no schedule row", () => {
    const result = pickOriginalEmailContext({
      sentScheduleRows: [],
      outreachRows: [
        {
          sequencePosition: 1,
          emailBody: "Email 1 only",
          templateVariant: "gift_sampling",
        },
        {
          sequencePosition: 3,
          emailBody: "Email 3",
          templateVariant: "final_reminder",
        },
      ],
    });

    expect(result.emailBody).toBe("Email 1 only");
    expect(result.templateVariant).toBe("gift_sampling");
  });
});
