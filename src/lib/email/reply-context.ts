export type OriginalEmailContext = {
  emailBody: string;
  templateVariant: string | null;
  subjectA: string | null;
};

type ScheduleRow = {
  bodySnippet?: string | null;
  emailKind?: string | null;
  sequenceDay?: number | null;
  draftLeadOutreachId?: string | null;
};

type OutreachRow = {
  id?: string;
  sequencePosition?: number | null;
  emailBody?: string | null;
  templateVariant?: string | null;
  subjectA?: string | null;
};

/** Pick the sent Email 1 body and template, not the latest draft in the sequence. */
export function pickOriginalEmailContext(params: {
  sentScheduleRows: ScheduleRow[];
  outreachRows: OutreachRow[];
  fallbackBody?: string;
}): OriginalEmailContext {
  const { sentScheduleRows, outreachRows, fallbackBody } = params;

  const initialSchedule = sentScheduleRows.find(
    (r) => r.sequenceDay === 0 || r.emailKind === "initial",
  );

  const email1Outreach =
    (initialSchedule?.draftLeadOutreachId
      ? outreachRows.find((o) => o.id === initialSchedule.draftLeadOutreachId)
      : undefined) ?? outreachRows.find((o) => o.sequencePosition === 1);

  const emailBody =
    initialSchedule?.bodySnippet?.trim() ||
    email1Outreach?.emailBody?.trim() ||
    fallbackBody ||
    "We reached out about Diwali corporate gifting.";

  return {
    emailBody,
    templateVariant: email1Outreach?.templateVariant ?? null,
    subjectA: email1Outreach?.subjectA ?? null,
  };
}
