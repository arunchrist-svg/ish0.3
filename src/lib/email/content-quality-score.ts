import type { EmailStyle } from "@/lib/email/config";
import { applyContentRules, type ContentRuleContext, type ContentRuleHit } from "@/lib/email/content-rules";

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
};

const SPAM_WORDS = [
  "free", "urgent", "guarantee", "100%", "act now", "limited time", "winner",
  "click here", "buy now", "free offer", "special offer",
];

function verdictFromScore(score: number): ContentQualityVerdict {
  if (score >= 80) return "SAFE";
  if (score >= 60) return "CAUTION";
  return "RISK";
}

export function scoreContentQuality(
  body: string,
  subject: string,
  options?: ContentQualityOptions,
): ContentQualityResult {
  const factors: ContentFactor[] = [];
  let score = 100;
  const lower = (body + " " + subject).toLowerCase();
  const emailStyle = options?.emailStyle ?? "primary";
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

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

  if (subject.length > 60) {
    score -= 8;
    factors.push({ label: "long subject line", delta: -8 });
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
    giftingHook: options?.giftingHook,
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
