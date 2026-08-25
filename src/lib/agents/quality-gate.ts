import {
  scoreSpamMeter,
  scoreRubric,
  scoreRubricTotal,
  type DeliverabilityOptions,
} from "@/lib/agents/writer-scoring";
import { passesOutreachQuality } from "@/lib/outreach/outreach-quality";
import { isIshFestiveCatalogBody } from "@/lib/email/ish-festive-catalog";
import { companyNameForEmail } from "@/lib/email/company-display-name";

export {
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  passesOutreachQuality,
  draftFailsQualityGate,
} from "@/lib/outreach/outreach-quality";


export async function evaluateOutreachDraft(params: {
  subject: string;
  emailBody: string;
  contact: { name: string; firstName?: string | null; title?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null; intelNotes?: string | null };
  deliverabilityOptions?: DeliverabilityOptions;
  outreachHook?: string | null;
  sequencePosition?: number;
}): Promise<{
  delivScore: number;
  rubric: Record<string, number>;
  rubricTotal: number;
  passes: boolean;
  revisionTimeoutRisk: boolean;
}> {
  if (isIshFestiveCatalogBody(params.emailBody)) {
    const rubric = {
      spam_signal_risk: 25,
      personalization_depth: 25,
      value_clarity: 25,
      cta_quality: 25,
    };
    return {
      delivScore: 100,
      rubric,
      rubricTotal: 100,
      passes: true,
      revisionTimeoutRisk: false,
    };
  }

  const companyDisplayName = companyNameForEmail(params.account.name);

  const delivOpts: DeliverabilityOptions = {
    contactFirstName: params.contact.firstName ?? params.contact.name.split(" ")[0],
    sequencePosition: params.sequencePosition ?? 1,
    ...params.deliverabilityOptions,
    account: {
      name: companyDisplayName,
      employees: params.account.employees,
      industry: params.account.industry,
      city: params.account.city,
      ...params.deliverabilityOptions?.account,
    },
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
      name: companyDisplayName,
      industry: params.account.industry ?? undefined,
      city: params.account.city ?? undefined,
      employees: params.account.employees ?? undefined,
    },
    deliverabilityOptions: delivOpts,
    outreachHook: params.outreachHook ?? undefined,
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

