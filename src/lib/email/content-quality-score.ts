import type { EmailStyle } from "@/lib/email/config";
import { applyContentRules, type ContentRuleContext, type ContentRuleHit } from "@/lib/email/content-rules";
import { looksLikeLlmJsonDump } from "@/lib/agents/schemas/writer-output";
import { isNearParaphrase, BASELINE_PARAPHRASE_THRESHOLD } from "@/lib/email/email-similarity";
import { isIshFestiveCatalogBody } from "@/lib/email/ish-festive-catalog";

export type ContentFactor = { label: string; delta: number; ruleId?: string };
export type ContentQualityVerdict = "SAFE" | "CAUTION" | "RISK";

export type ContentQualityResult = {
  contentScore: number;
  inboxScore: number;
  verdict: ContentQualityVerdict;
  factors: ContentFactor[];
  ruleHits: ContentRuleHit[];
};

export type ContentQualityOptions = ContentRuleContext & {
  emailStyle?: EmailStyle;
  fromName?: string;
  contactFirstName?: string;
  hasMarketingFooter?: boolean;
  hasBulkHeaders?: boolean;
  baselineBody?: string;
};

const SPAM_WORDS = [
  "free",
  "urgent",
  "guarantee",
  "guaranteed",
  "100%",
  "act now",
  "limited time",
  "winner",
  "click here",
  "buy now",
  "free offer",
  "special offer",
  "no pressure",
  "complimentary",
  "excited to",
  "we're offering",
  "we are offering",
  "limited offer",
  "opt-out",
  "view in browser",
];

const GENERIC_SUBJECTS = ["following up", "quick question", "checking in", "just checking in"];

const FILLER_CLOSINGS = ["looking forward to hearing from you", "looking forward to your reply"];

function verdictFromScore(score: number): ContentQualityVerdict {
  if (score >= 80) return "SAFE";
  if (score >= 60) return "CAUTION";
  return "RISK";
}

function openingLine(body: string): string {
  const firstBlock = body.trim().split(/\n\n+/)[0] ?? body.trim();
  const lines = firstBlock.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] ?? "";
  return lines[1] ?? lines[0] ?? "";
}

export function scoreContentQuality(
  body: string,
  subject: string,
  options?: ContentQualityOptions,
): ContentQualityResult {
  const factors: ContentFactor[] = [];
  let score = 100;
  const lower = (body + " " + subject).toLowerCase();
  const subjectLower = subject.trim().toLowerCase();
  const emailStyle = options?.emailStyle ?? "primary";
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const isCatalog = isIshFestiveCatalogBody(body);

  if (isCatalog) {
    return {
      contentScore: 100,
      inboxScore: 100,
      verdict: "SAFE",
      factors: [{ label: "festive catalogue after open", delta: 0 }],
      ruleHits: [],
    };
  }

  if (looksLikeLlmJsonDump(body) || /^```/m.test(body.trim())) {
    score -= 80;
    factors.push({ label: "draft is incomplete LLM JSON, not an email", delta: -80 });
  } else if (wordCount > 0 && wordCount < 20) {
    score -= 40;
    factors.push({ label: "email body is incomplete", delta: -40 });
  }

  const hook = options?.outreachHook?.trim();
  if (hook && hook.length >= 24 && body.toLowerCase().includes(hook.toLowerCase())) {
    score -= 12;
    factors.push({ label: "hook copied verbatim", delta: -12 });
  }

  if (/\boffers\b|\bspecializes in\b/i.test(body)) {
    score -= 12;
    factors.push({ label: "brand catalog dump", delta: -12 });
  }

  if (/vendors?\s+lock\s+in/i.test(body)) {
    score -= 15;
    factors.push({ label: "vendors lock-in urgency", delta: -15 });
  }

  if (
    options?.baselineBody &&
    isNearParaphrase(body, options.baselineBody, BASELINE_PARAPHRASE_THRESHOLD, "hook")
  ) {
    score -= 15;
    factors.push({ label: "near-baseline paraphrase", delta: -15 });
  }

  if (emailStyle === "marketing") {
    score -= 15;
    factors.push({ label: "marketing email style", delta: -15 });
  } else {
    factors.push({ label: "primary inbox style", delta: 0 });
  }

  if (options?.hasBulkHeaders) {
    score -= 12;
    factors.push({ label: "bulk unsubscribe headers", delta: -12 });
  }

  if (options?.hasMarketingFooter || lower.includes("you received this email because")) {
    score -= 10;
    factors.push({ label: "marketing compliance footer", delta: -10 });
  }

  if (/^dear\s/m.test(body.trim().toLowerCase()) || lower.includes("\ndear ")) {
    score -= 8;
    factors.push({ label: '"Dear" opener (use Hi)', delta: -8 });
  }

  const firstName = options?.contactFirstName?.trim() ?? options?.contact?.firstName?.trim();
  if (firstName && !body.toLowerCase().includes(`hi ${firstName.toLowerCase()}`)) {
    score -= 5;
    factors.push({ label: "missing Hi + first name greeting", delta: -5 });
  }

  if (lower.includes("gifting team") || lower.includes("sales team")) {
    score -= 10;
    factors.push({ label: "generic team sign-off", delta: -10 });
  }

  for (const w of SPAM_WORDS) {
    if (lower.includes(w)) {
      score -= 8;
      factors.push({ label: `spam trigger: "${w}"`, delta: -8 });
    }
  }

  for (const phrase of GENERIC_SUBJECTS) {
    if (subjectLower === phrase || subjectLower.startsWith(`${phrase} `) || subjectLower.includes(phrase)) {
      score -= 12;
      factors.push({ label: `generic subject: "${phrase}"`, delta: -12 });
      break;
    }
  }

  for (const phrase of FILLER_CLOSINGS) {
    if (lower.includes(phrase)) {
      score -= 8;
      factors.push({ label: `filler closing: "${phrase}"`, delta: -8 });
    }
  }

  const questionCount = (body.match(/\?/g) ?? []).length;
  if (questionCount > 1) {
    score -= 10;
    factors.push({ label: "multiple questions in one email", delta: -10 });
  }

  const opener = openingLine(body);
  const companyName = options?.account?.name?.trim();
  if (/^i\s/i.test(opener) || (companyName && new RegExp(`^${companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(opener))) {
    score -= 8;
    factors.push({ label: 'opening line starts with "I" or company name', delta: -8 });
  }

  if (subject.length > 50) {
    score -= 5;
    factors.push({ label: "subject line over 50 characters", delta: -5 });
  }

  if (wordCount > 150) {
    score -= 10;
    factors.push({ label: "too long (>150 words)", delta: -10 });
  } else if (wordCount <= 120) {
    factors.push({ label: "concise length", delta: 4 });
    score += 4;
  }

  if (!body.includes("?")) {
    score -= 5;
    factors.push({ label: "no question CTA", delta: -5 });
  }

  if (body.includes("—") || subject.includes("—")) {
    score -= 10;
    factors.push({ label: "em dash in copy", delta: -10 });
  }

  if (subject.includes(" - ")) {
    score -= 5;
    factors.push({ label: "brand suffix in subject", delta: -5 });
  }

  const ruleHits = applyContentRules(body, subject, {
    sequencePosition: options?.sequencePosition,
    account: options?.account,
    contact: options?.contact ?? (firstName ? { firstName } : undefined),
    fromName: options?.fromName,
    emailStyle: options?.emailStyle,
    outreachHook: options?.outreachHook,
    recentSubjects: options?.recentSubjects,
  });

  for (const hit of ruleHits) {
    score += hit.delta;
    factors.push({ label: hit.label, delta: hit.delta, ruleId: hit.id });
  }

  const contentScore = Math.max(0, Math.min(100, score));
  return {
    contentScore,
    inboxScore: contentScore,
    verdict: verdictFromScore(contentScore),
    factors,
    ruleHits,
  };
}

export function contentQualityLabel(verdict: ContentQualityVerdict): string {
  if (verdict === "SAFE") return "Looks Good";
  if (verdict === "CAUTION") return "Review";
  return "High Risk Copy";
}

export function spamMeterLabel(verdict: ContentQualityVerdict): string {
  return contentQualityLabel(verdict);
}

export function scoreInboxSafety(
  body: string,
  subject: string,
  options?: ContentQualityOptions,
) {
  return scoreContentQuality(body, subject, options);
}
