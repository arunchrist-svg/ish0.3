import { normalizeReplySubject } from "@/lib/email/threading";

export type VariantKey = "A" | "B";

export type DraftCopyFields = {
  subjectA?: string | null;
  subjectB?: string | null;
  subjectC?: string | null;
  emailBody?: string | null;
  emailBodyB?: string | null;
  emailBodyC?: string | null;
  chosenSubjectKey?: string | null;
  chosenBodyKey?: string | null;
};

export function asVariantKey(value?: string | null): VariantKey {
  if (value === "B") return "B";
  return "A";
}

export function draftSubjectOptions(draft: DraftCopyFields): { key: VariantKey; value: string }[] {
  return (
    [
      { key: "A" as const, value: draft.subjectA?.trim() ?? "" },
      { key: "B" as const, value: draft.subjectB?.trim() ?? "" },
    ] as const
  ).filter((row) => row.value.length > 0);
}

export function draftBodyOptions(draft: DraftCopyFields): { key: VariantKey; value: string }[] {
  return (
    [
      { key: "A" as const, value: draft.emailBody?.trim() ?? "" },
      { key: "B" as const, value: draft.emailBodyB?.trim() ?? "" },
    ] as const
  ).filter((row) => row.value.length > 0);
}

export function resolveDraftSubject(draft: DraftCopyFields, key?: string | null): string {
  const k = asVariantKey(key ?? draft.chosenSubjectKey);
  if (k === "B") return (draft.subjectB || draft.subjectA || "").trim();
  return (draft.subjectA || "").trim();
}

export function resolveDraftBody(draft: DraftCopyFields, key?: string | null): string {
  const k = asVariantKey(key ?? draft.chosenBodyKey);
  if (k === "B") return (draft.emailBodyB || draft.emailBody || "").trim();
  return (draft.emailBody || "").trim();
}

/** Email 2/3 in the cold sequence (not reply or If Opened). */
export function isSequenceFollowUpDraft(sequencePosition?: number | null): boolean {
  return sequencePosition === 2 || sequencePosition === 3;
}

export function followUpThreadSubject(params: {
  threadRootSubject?: string | null;
  email1Draft?: DraftCopyFields | null;
  chosenSubjectKey?: string | null;
}): string {
  if (params.threadRootSubject?.trim()) {
    return normalizeReplySubject(params.threadRootSubject);
  }
  const email1Subject = params.email1Draft
    ? resolveDraftSubject(params.email1Draft, params.chosenSubjectKey)
    : "";
  return email1Subject ? normalizeReplySubject(email1Subject) : "";
}

/** True when follow-up subject is the auto Re: form of the given Email 1 subject. */
export function isDerivedReSubject(
  followUpSubject?: string | null,
  email1Subject?: string | null,
): boolean {
  const followUp = followUpSubject?.trim();
  const email1 = email1Subject?.trim();
  if (!followUp || !email1) return false;
  return normalizeReplySubject(followUp) === normalizeReplySubject(email1);
}

export type FollowUpSubjectSync = {
  subjectA?: string | null;
  subjectB?: string | null;
};

/**
 * When Email 1 subject A/B changes, update follow-up subjects that still match
 * Re: {previous E1 A/B}. Custom follow-up subjects are left alone.
 */
export function syncFollowUpSubjectsFromEmail1(params: {
  followUp: DraftCopyFields;
  previousEmail1: DraftCopyFields;
  nextEmail1: DraftCopyFields;
}): FollowUpSubjectSync | null {
  const prevA = params.previousEmail1.subjectA?.trim() ?? "";
  const nextA = params.nextEmail1.subjectA?.trim() ?? "";
  const prevB = params.previousEmail1.subjectB?.trim() ?? "";
  const nextB = params.nextEmail1.subjectB?.trim() ?? "";

  const updates: FollowUpSubjectSync = {};

  if (nextA && prevA !== nextA && isDerivedReSubject(params.followUp.subjectA, prevA)) {
    updates.subjectA = normalizeReplySubject(nextA);
  }

  if (prevB !== nextB) {
    if (nextB && isDerivedReSubject(params.followUp.subjectB, prevB)) {
      updates.subjectB = normalizeReplySubject(nextB);
    } else if (!nextB && isDerivedReSubject(params.followUp.subjectB, prevB)) {
      // E1 B cleared: clear matching Re: B rather than leaving a stale thread subject.
      updates.subjectB = null;
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

/** Positions that may store Re: Email 1 subjects (Email 2/3 + If Opened when Re-based). */
export function isFollowUpSubjectSyncPosition(sequencePosition?: number | null): boolean {
  return sequencePosition === 2 || sequencePosition === 3 || sequencePosition === 5;
}
