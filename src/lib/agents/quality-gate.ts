import {
  scoreSpamMeter,
  scoreRubric,
  scoreRubricTotal,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  type DeliverabilityOptions,
} from "@/lib/agents/writer-scoring";

export { DELIVERABILITY_PASS_THRESHOLD, RUBRIC_PASS_THRESHOLD };

export function passesOutreachQuality(delivScore: number, rubricTotal: number): boolean {
  return delivScore >= DELIVERABILITY_PASS_THRESHOLD && rubricTotal >= RUBRIC_PASS_THRESHOLD;
}

export async function evaluateOutreachDraft(params: {
  subject: string;
  emailBody: string;
  contact: { name: string; firstName?: string | null; title?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null; intelNotes?: string | null };
  deliverabilityOptions?: DeliverabilityOptions;
  giftingHook?: string | null;
  sequencePosition?: number;
}): Promise<{
  delivScore: number;
  rubric: Record<string, number>;
  rubricTotal: number;
  passes: boolean;
  revisionTimeoutRisk: boolean;
}> {
  const delivOpts: DeliverabilityOptions = {
    contactFirstName: params.contact.firstName ?? params.contact.name.split(" ")[0],
    sequencePosition: params.sequencePosition ?? 1,
    ...params.deliverabilityOptions,
  };

  const spamResult = scoreSpamMeter(params.emailBody, params.subject, delivOpts);
  const delivScore = spamResult.inboxScore;

  const rubric = await scoreRubric({
    subjectA: params.subject,
    emailBody: params.emailBody,
    contact: {
      name: params.contact.name,
      firstName: params.contact.firstName ?? undefined,
      title: params.contact.title ?? undefined,
    },
    account: {
      name: params.account.name,
      industry: params.account.industry ?? undefined,
      city: params.account.city ?? undefined,
      employees: params.account.employees ?? undefined,
    },
    deliverabilityOptions: delivOpts,
    giftingHook: params.giftingHook ?? undefined,
    intelNotes: params.account.intelNotes ?? undefined,
  });

  const rubricTotal = scoreRubricTotal(rubric);
  const passes = passesOutreachQuality(delivScore, rubricTotal);

  return {
    delivScore,
    rubric,
    rubricTotal,
    passes,
    revisionTimeoutRisk: !passes,
  };
}

export function draftFailsQualityGate(outreach: {
  revisionTimeout?: boolean | null;
  deliverabilityScore?: number | null;
  rubricTotal?: number | null;
}): boolean {
  if (outreach.revisionTimeout) return true;
  if (outreach.deliverabilityScore == null || outreach.rubricTotal == null) return false;
  return !passesOutreachQuality(outreach.deliverabilityScore, outreach.rubricTotal);
}
