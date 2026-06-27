import {
  scoreContentQuality,
  type ContentFactor,
  type ContentQualityResult,
} from "@/lib/email/content-quality-score";
import type { ContentRuleContext } from "@/lib/email/content-rules";
import type { EmailStyle } from "@/lib/email/config";

export const RUBRIC_DIMENSIONS = ["personalisation", "clarity", "cta_strength", "deliverability"] as const;
export const DELIVERABILITY_PASS_THRESHOLD = 80;
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
    contact: options?.contact ?? (options?.contactFirstName ? { firstName: options.contactFirstName } : undefined),
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

export async function scoreRubric(params: {
  subjectA: string;
  emailBody: string;
  contact: { name: string; title?: string | null; firstName?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null };
  deliverabilityOptions?: DeliverabilityOptions;
}): Promise<Record<(typeof RUBRIC_DIMENSIONS)[number], number>> {
  const { subjectA, emailBody, contact, account } = params;
  const lower = emailBody.toLowerCase();

  const personalisation =
    (lower.includes(account.name.toLowerCase()) ? 8 : 0) +
    (contact.firstName && lower.includes(contact.firstName.toLowerCase()) ? 8 : 0) +
    (account.industry && lower.includes(account.industry.toLowerCase()) ? 5 : 0);

  const clarity =
    (emailBody.trim().split(/\s+/).length <= 150 ? 15 : 8) +
    (emailBody.split("\n\n").length >= 2 ? 5 : 0) +
    5;

  const cta_strength =
    (lower.includes("schedule") || lower.includes("call") ? 10 : 0) +
    (lower.includes("15") || lower.includes("minutes") ? 8 : 0) +
    (lower.includes("?") ? 7 : 0);

  const deliverability = Math.round(
    (await scoreDeliverability(emailBody, subjectA, {
      ...params.deliverabilityOptions,
      contactFirstName: contact.firstName ?? contact.name.split(" ")[0],
      account: {
        name: account.name,
        industry: account.industry,
        city: account.city,
        employees: account.employees,
      },
      contact: { firstName: contact.firstName ?? contact.name.split(" ")[0], title: contact.title },
    })) / 4,
  );

  return {
    personalisation: Math.min(25, personalisation),
    clarity: Math.min(25, clarity),
    cta_strength: Math.min(25, cta_strength),
    deliverability: Math.min(25, deliverability),
  };
}

export function deliverabilityVerdict(score: number): string {
  if (score >= INBOX_SAFE_THRESHOLD) return "PASS";
  if (score >= DELIVERABILITY_PASS_THRESHOLD) return "MARGINAL";
  return "FAIL";
}

export type { ContentFactor as SpamFactor, ContentQualityResult as SpamMeterResult };
