export type VariantKey = "A" | "B" | "C";

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
  if (value === "B" || value === "C") return value;
  return "A";
}

export function draftSubjectOptions(draft: DraftCopyFields): { key: VariantKey; value: string }[] {
  return (
    [
      { key: "A" as const, value: draft.subjectA?.trim() ?? "" },
      { key: "B" as const, value: draft.subjectB?.trim() ?? "" },
      { key: "C" as const, value: draft.subjectC?.trim() ?? "" },
    ] as const
  ).filter((row) => row.value.length > 0);
}

export function draftBodyOptions(draft: DraftCopyFields): { key: VariantKey; value: string }[] {
  return (
    [
      { key: "A" as const, value: draft.emailBody?.trim() ?? "" },
      { key: "B" as const, value: draft.emailBodyB?.trim() ?? "" },
      { key: "C" as const, value: draft.emailBodyC?.trim() ?? "" },
    ] as const
  ).filter((row) => row.value.length > 0);
}

export function resolveDraftSubject(draft: DraftCopyFields, key?: string | null): string {
  const k = asVariantKey(key ?? draft.chosenSubjectKey);
  if (k === "B") return (draft.subjectB || draft.subjectA || "").trim();
  if (k === "C") return (draft.subjectC || draft.subjectA || "").trim();
  return (draft.subjectA || "").trim();
}

export function resolveDraftBody(draft: DraftCopyFields, key?: string | null): string {
  const k = asVariantKey(key ?? draft.chosenBodyKey);
  if (k === "B") return (draft.emailBodyB || draft.emailBody || "").trim();
  if (k === "C") return (draft.emailBodyC || draft.emailBody || "").trim();
  return (draft.emailBody || "").trim();
}
