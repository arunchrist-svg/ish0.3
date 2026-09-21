import { describe, expect, it } from "vitest";
import { detectAutomatedReply } from "@/lib/email/detect-automated-reply";

describe("detectAutomatedReply", () => {
  it("flags Auto-Submitted header", () => {
    expect(
      detectAutomatedReply({
        subject: "Re: Diwali gifts",
        text: "Thanks",
        headers: { "Auto-Submitted": "auto-replied" },
      }),
    ).toEqual({ automated: true, reason: "header_auto_submitted" });
  });

  it("allows Auto-Submitted: no", () => {
    expect(
      detectAutomatedReply({
        subject: "Re: Diwali gifts",
        text: "Can we talk next week?",
        headers: { "Auto-Submitted": "no" },
      }).automated,
    ).toBe(false);
  });

  it("flags OOO subject", () => {
    expect(
      detectAutomatedReply({
        subject: "Out of Office: back Monday",
        text: "I am away until Monday.",
      }),
    ).toMatchObject({ automated: true, reason: "ooo_subject" });
  });

  it("flags automatic reply body", () => {
    expect(
      detectAutomatedReply({
        subject: "Re: Gifting",
        text: "This is an automated response. I will reply when I return.",
      }).automated,
    ).toBe(true);
  });

  it("flags Undelivered Mail Returned to Sender", () => {
    expect(
      detectAutomatedReply({
        subject: "Undelivered Mail Returned to Sender",
        text: "This message was created automatically by mail delivery software. A message that you sent could not be delivered to one or more recipients.",
      }),
    ).toMatchObject({ automated: true });
  });

  it("flags maternity leave auto-reply body", () => {
    expect(
      detectAutomatedReply({
        subject: "Re: Corporate gifting",
        text: "Thank you for your email. I am currently on maternity leave and will return in a few months.",
      }),
    ).toMatchObject({ automated: true, reason: "leave_body" });
  });

  it("flags OOO leave of absence subject", () => {
    expect(
      detectAutomatedReply({
        subject: "Out of Office: Leave of Absence",
        text: "I am on leave until next quarter.",
      }).automated,
    ).toBe(true);
  });

  it("treats a normal human reply as human", () => {
    expect(
      detectAutomatedReply({
        subject: "Re: Corporate gifting for Diwali",
        text: "Thanks for reaching out. Could you share pricing for 200 boxes?",
        headers: [{ name: "In-Reply-To", value: "<abc@mail>" }],
      }),
    ).toEqual({ automated: false });
  });
});
