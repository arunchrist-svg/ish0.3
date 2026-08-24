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

/** Follow-ups (Email 2/3) stay on Email 1's subject / thread, with no A/B picker. */
export function isSequenceFollowUpDraft(sequencePosition?: number | null): boolean {
  return sequencePosition != null && sequencePosition > 1;
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
