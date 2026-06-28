import {
  scoreContentQuality,
  type ContentFactor,
  type ContentQualityResult,
} from "@/lib/email/content-quality-score";
import type { ContentRuleContext } from "@/lib/email/content-rules";
import type { EmailStyle } from "@/lib/email/config";

export const RUBRIC_DIMENSIONS = [
  "spam_signal_risk",
  "personalization_depth",
  "value_clarity",
  "cta_quality",
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
export type RubricScores = Record<RubricDimension, number>;

export const DELIVERABILITY_PASS_THRESHOLD = 80;
export const RUBRIC_PASS_THRESHOLD = 80;
export const INBOX_SAFE_THRESHOLD = 80;

export type DeliverabilityOptions = ContentRuleContext & {
  emailStyle?: EmailStyle;
  fromName?: string;
  contactFirstName?: string;
};

function buildScoreOptions(body: string, options?: DeliverabilityOptions) {
  return {
    ...options,
    emailStyle: options?.emailStyle ?? "primary",
    fromName: options?.fromName,
    contactFirstName: options?.contactFirstName,
    contact:
      options?.contact ??
      (options?.contactFirstName ? { firstName: options.contactFirstName } : undefined),
    hasMarketingFooter: body.toLowerCase().includes("you received this email because"),
    hasBulkHeaders: options?.emailStyle === "marketing",
  };
}

export async function scoreDeliverability(
  body: string,
  subject: string,
  options?: DeliverabilityOptions,
): Promise<number> {
  return scoreContentQuality(body, subject, buildScoreOptions(body, options)).contentScore;
}

export function scoreSpamMeter(
  body: string,
  subject: string,
  options?: DeliverabilityOptions,
): ContentQualityResult {
  return scoreContentQuality(body, subject, buildScoreOptions(body, options));
}

export async function getDeliverabilityIssues(
  body: string,
  subject = "",
  options?: DeliverabilityOptions,
): Promise<string> {
  const result = scoreContentQuality(body, subject, buildScoreOptions(body, options));
  const negatives = result.factors.filter((f) => f.delta < 0).map((f) => f.label);
  return negatives.join("; ") || "generic tone";
}

function pitchSentenceCount(body: string): number {
  const parts = body.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const pitchParts = parts.length > 2 ? parts.slice(1, -1) : parts.slice(1);
  const pitch = pitchParts.join(" ");
  if (!pitch) return 0;
  return pitch.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
}

function countQuestions(body: string): number {
  return (body.match(/\?/g) ?? []).length;
}

export async function scoreRubric(params: {
  subjectA: string;
  emailBody: string;
  contact: { name: string; title?: string | null; firstName?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null };
  deliverabilityOptions?: DeliverabilityOptions;
  giftingHook?: string | null;
  intelNotes?: string | null;
}): Promise<RubricScores> {
  const { subjectA, emailBody, contact, account } = params;
  const lower = emailBody.toLowerCase();
  const sequencePosition = params.deliverabilityOptions?.sequencePosition ?? 1;

  const contentResult = scoreContentQuality(
    emailBody,
    subjectA,
    buildScoreOptions(emailBody, {
      ...params.deliverabilityOptions,
      contactFirstName: contact.firstName ?? contact.name.split(" ")[0],
      account: {
        name: account.name,
        industry: account.industry,
        city: account.city,
        employees: account.employees,
        enrichmentSource: params.deliverabilityOptions?.account?.enrichmentSource,
      },
      contact: { firstName: contact.firstName ?? contact.name.split(" ")[0], title: contact.title },
      giftingHook: params.giftingHook ?? params.deliverabilityOptions?.giftingHook,
    }),
  );

  const spam_signal_risk = Math.min(25, Math.round(contentResult.contentScore / 4));

  let personalization_depth = 0;
  const firstName = contact.firstName ?? contact.name.split(" ")[0];
  if (firstName && lower.includes(firstName.toLowerCase())) personalization_depth += 3;
  if (lower.includes(account.name.toLowerCase())) personalization_depth += 2;

  const hook = params.giftingHook ?? params.deliverabilityOptions?.giftingHook;
  const intel = params.intelNotes?.trim();
  if (account.industry && lower.includes(account.industry.toLowerCase())) personalization_depth += 4;
  if (account.city && lower.includes(account.city.toLowerCase())) personalization_depth += 3;
  if (contact.title && lower.includes(contact.title.toLowerCase().slice(0, 12))) {
    personalization_depth += 4;
  }
  if (hook && lower.includes(hook.toLowerCase().slice(0, Math.min(20, hook.length)))) {
    personalization_depth += 8;
  }
  if (intel && lower.includes(intel.toLowerCase().slice(0, Math.min(24, intel.length)))) {
    personalization_depth += 6;
  }
  if (personalization_depth >= 18 && hook) personalization_depth = Math.min(25, personalization_depth + 3);

  let value_clarity = 0;
  const wordCount = emailBody.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 120) value_clarity += 10;
  else if (wordCount <= 150) value_clarity += 6;
  if (emailBody.split("\n\n").length >= 2) value_clarity += 4;
  if (!/we offer|our services|gifting services/i.test(emailBody)) value_clarity += 6;
  if (/diwali|hamper|gift|mithai|corporate/i.test(lower)) value_clarity += 5;

  let cta_quality = 0;
  const questions = countQuestions(emailBody);
  if (questions === 1) cta_quality += 15;
  else if (questions === 0) cta_quality += 0;
  else cta_quality += 5;

  const hardAsk = /30.?min|schedule a call|book a meeting|calendar link/i.test(lower);
  if (sequencePosition === 1 && hardAsk) cta_quality -= 8;
  else if (hardAsk) cta_quality += 4;

  if (/15.?min|10.?min|quick call|open to/i.test(lower)) cta_quality += 6;
  if (/no worries|timing is off|not relevant|when the time is right/i.test(lower)) cta_quality += 4;

  if (sequencePosition <= 2 && pitchSentenceCount(emailBody) > 3) {
    value_clarity = Math.max(0, value_clarity - 8);
  }

  return {
    spam_signal_risk,
    personalization_depth: Math.min(25, personalization_depth),
    value_clarity: Math.min(25, value_clarity),
    cta_quality: Math.max(0, Math.min(25, cta_quality)),
  };
}

export function scoreRubricTotal(rubric: RubricScores): number {
  return RUBRIC_DIMENSIONS.reduce((sum, dim) => sum + rubric[dim], 0);
}

const RUBRIC_ISSUE_THRESHOLD = 18;

export function getRubricIssues(rubric: RubricScores, sequencePosition = 1): string[] {
  const issues: string[] = [];

  if (rubric.spam_signal_risk < RUBRIC_ISSUE_THRESHOLD) {
    issues.push("reduce spam signals (generic subject, trigger words, filler closings, or weak sender identity)");
  }
  if (rubric.personalization_depth < RUBRIC_ISSUE_THRESHOLD) {
    issues.push("add researched personalization (specific hook, role, intel, or industry detail beyond name and company)");
  }
  if (rubric.value_clarity < RUBRIC_ISSUE_THRESHOLD) {
    issues.push("clarify value in under 10 seconds (specific offer, credibility, concise pitch; max 3 sentences for emails 1-2)");
  }
  if (rubric.cta_quality < RUBRIC_ISSUE_THRESHOLD) {
    if (sequencePosition === 1) {
      issues.push("use one low-friction soft CTA (no hard meeting ask in email 1)");
    } else {
      issues.push("use one clear, stage-appropriate CTA only");
    }
  }

  return issues;
}

export async function getCombinedRevisionIssues(
  body: string,
  subject: string,
  rubricParams: Parameters<typeof scoreRubric>[0],
): Promise<string> {
  const deliverabilityIssues = await getDeliverabilityIssues(
    body,
    subject,
    rubricParams.deliverabilityOptions,
  );
  const rubric = await scoreRubric(rubricParams);
  const rubricIssues = getRubricIssues(
    rubric,
    rubricParams.deliverabilityOptions?.sequencePosition ?? 1,
  );

  const parts = [deliverabilityIssues, ...rubricIssues].filter(Boolean);
  return parts.join("; ");
}

export function deliverabilityVerdict(score: number): string {
  if (score >= INBOX_SAFE_THRESHOLD) return "PASS";
  if (score >= DELIVERABILITY_PASS_THRESHOLD) return "MARGINAL";
  return "FAIL";
}

export type { ContentFactor as SpamFactor, ContentQualityResult as SpamMeterResult };
