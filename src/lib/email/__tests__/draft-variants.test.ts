import { describe, expect, it } from "vitest";
import {
  asVariantKey,
  draftBodyOptions,
  draftSubjectOptions,
  followUpThreadSubject,
  isSequenceFollowUpDraft,
  resolveDraftBody,
  resolveDraftSubject,
} from "@/lib/email/draft-variants";

const draft = {
  subjectA: "Send happiness this Diwali, Vijetha",
  subjectB: "Acme Auto, make someone's Diwali better",
  subjectC: "A taste of Diwali, before you decide",
  emailBody: "Body A text for the first option.",
  emailBodyB: "Body B text for the second option.",
  emailBodyC: "Body C text for the third option.",
  chosenSubjectKey: "B",
  chosenBodyKey: "C",
};

describe("draft copy variants", () => {
  it("lists three subject and three body options", () => {
    expect(draftSubjectOptions(draft).map((s) => s.key)).toEqual(["A", "B", "C"]);
    expect(draftBodyOptions(draft).map((b) => b.key)).toEqual(["A", "B", "C"]);
  });

  it("resolves the chosen subject and body", () => {
    expect(resolveDraftSubject(draft)).toBe(draft.subjectB);
    expect(resolveDraftBody(draft)).toBe(draft.emailBodyC);
  });

  it("falls back to A when a chosen variant is missing", () => {
    expect(resolveDraftSubject({ subjectA: "Only A" }, "C")).toBe("Only A");
    expect(resolveDraftBody({ emailBody: "Only body" }, "B")).toBe("Only body");
  });

  it("hides empty variants and normalizes keys", () => {
    expect(draftSubjectOptions({ subjectA: "One" })).toHaveLength(1);
    expect(asVariantKey("C")).toBe("C");
    expect(asVariantKey("Z")).toBe("A");
  });

  it("treats sequence positions after 1 as follow-up drafts", () => {
    expect(isSequenceFollowUpDraft(1)).toBe(false);
    expect(isSequenceFollowUpDraft(2)).toBe(true);
    expect(isSequenceFollowUpDraft(3)).toBe(true);
    expect(isSequenceFollowUpDraft(null)).toBe(false);
  });

  it("locks follow-up subject to Email 1 / thread root", () => {
    expect(
      followUpThreadSubject({
        threadRootSubject: "Diwali gifting for Acme",
        email1Draft: draft,
      }),
    ).toBe("Re: Diwali gifting for Acme");
    expect(
      followUpThreadSubject({
        email1Draft: draft,
        chosenSubjectKey: "C",
      }),
    ).toBe("Re: A taste of Diwali, before you decide");
  });
});
