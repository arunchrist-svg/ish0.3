import { describe, expect, it } from "vitest";
import {
  asVariantKey,
  draftBodyOptions,
  draftSubjectOptions,
  followUpThreadSubject,
  isDerivedReSubject,
  isFollowUpSubjectSyncPosition,
  isSequenceFollowUpDraft,
  resolveDraftBody,
  resolveDraftSubject,
  syncFollowUpSubjectsFromEmail1,
} from "@/lib/email/draft-variants";

const draft = {
  subjectA: "Send happiness this Diwali, Vijetha",
  subjectB: "Acme Auto, make someone's Diwali better",
  subjectC: "A taste of Diwali, before you decide",
  emailBody: "Body A text for the first option.",
  emailBodyB: "Body B text for the second option.",
  emailBodyC: "Body C text for the third option.",
  chosenSubjectKey: "B",
  chosenBodyKey: "B",
};

describe("draft copy variants", () => {
  it("lists two subject and two body options", () => {
    expect(draftSubjectOptions(draft).map((s) => s.key)).toEqual(["A", "B"]);
    expect(draftBodyOptions(draft).map((b) => b.key)).toEqual(["A", "B"]);
  });

  it("resolves the chosen subject and body", () => {
    expect(resolveDraftSubject(draft)).toBe(draft.subjectB);
    expect(resolveDraftBody(draft)).toBe(draft.emailBodyB);
  });

  it("falls back to A when a chosen variant is missing", () => {
    expect(resolveDraftSubject({ subjectA: "Only A" }, "C")).toBe("Only A");
    expect(resolveDraftBody({ emailBody: "Only body" }, "B")).toBe("Only body");
  });

  it("hides empty variants and normalizes keys", () => {
    expect(draftSubjectOptions({ subjectA: "One" })).toHaveLength(1);
    expect(asVariantKey("C")).toBe("A");
    expect(asVariantKey("Z")).toBe("A");
    expect(asVariantKey("B")).toBe("B");
  });

  it("treats only Email 2 and 3 as follow-up drafts", () => {
    expect(isSequenceFollowUpDraft(1)).toBe(false);
    expect(isSequenceFollowUpDraft(2)).toBe(true);
    expect(isSequenceFollowUpDraft(3)).toBe(true);
    expect(isSequenceFollowUpDraft(4)).toBe(false);
    expect(isSequenceFollowUpDraft(5)).toBe(false);
    expect(isSequenceFollowUpDraft(null)).toBe(false);
  });

  it("derives follow-up Re: subject from Email 1 / thread root", () => {
    expect(
      followUpThreadSubject({
        threadRootSubject: "Diwali gifting for Acme",
        email1Draft: draft,
      }),
    ).toBe("Re: Diwali gifting for Acme");
    expect(
      followUpThreadSubject({
        email1Draft: draft,
        chosenSubjectKey: "B",
      }),
    ).toBe("Re: Acme Auto, make someone's Diwali better");
  });

  it("detects Re: subjects derived from Email 1", () => {
    expect(isDerivedReSubject("Re: Hello Acme", "Hello Acme")).toBe(true);
    expect(isDerivedReSubject("Re: Hello Acme", "Re: Hello Acme")).toBe(true);
    expect(isDerivedReSubject("Quick check-in", "Hello Acme")).toBe(false);
    expect(isDerivedReSubject("Re: Other", "Hello Acme")).toBe(false);
    expect(isDerivedReSubject(null, "Hello Acme")).toBe(false);
  });

  it("syncs follow-up Re: subjects when Email 1 A/B change", () => {
    const previousEmail1 = {
      subjectA: "A festive sample for STELLANTIS AVTEC POWERTRAIN",
      subjectB: "Festive sweets sample for STELLANTIS AVTEC POWERTRAIN",
    };
    const nextEmail1 = {
      subjectA: "A festive sample for STELLANTIS",
      subjectB: "Festive sweets sample for STELLANTIS",
    };
    const followUp = {
      subjectA: "Re: A festive sample for STELLANTIS AVTEC POWERTRAIN",
      subjectB: "Re: Festive sweets sample for STELLANTIS AVTEC POWERTRAIN",
    };

    expect(
      syncFollowUpSubjectsFromEmail1({ followUp, previousEmail1, nextEmail1 }),
    ).toEqual({
      subjectA: "Re: A festive sample for STELLANTIS",
      subjectB: "Re: Festive sweets sample for STELLANTIS",
    });
  });

  it("does not overwrite a custom follow-up subject", () => {
    expect(
      syncFollowUpSubjectsFromEmail1({
        followUp: { subjectA: "Quick tasting reminder", subjectB: "Re: Old B" },
        previousEmail1: { subjectA: "Old A", subjectB: "Old B" },
        nextEmail1: { subjectA: "New A", subjectB: "New B" },
      }),
    ).toEqual({
      subjectB: "Re: New B",
    });
  });

  it("leaves catalog-style subjects alone when not Re:-based", () => {
    expect(
      syncFollowUpSubjectsFromEmail1({
        followUp: { subjectA: "festive gifting for Acme", subjectB: "festive gifting for Acme" },
        previousEmail1: { subjectA: "A festive sample for Acme", subjectB: "Festive sweets sample for Acme" },
        nextEmail1: { subjectA: "A festive sample for Acme Co", subjectB: "Festive sweets sample for Acme Co" },
      }),
    ).toBeNull();
  });

  it("marks Email 2/3 and If Opened as sync positions", () => {
    expect(isFollowUpSubjectSyncPosition(1)).toBe(false);
    expect(isFollowUpSubjectSyncPosition(2)).toBe(true);
    expect(isFollowUpSubjectSyncPosition(3)).toBe(true);
    expect(isFollowUpSubjectSyncPosition(5)).toBe(true);
    expect(isFollowUpSubjectSyncPosition(4)).toBe(false);
  });
});
