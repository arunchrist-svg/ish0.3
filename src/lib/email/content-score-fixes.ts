import type { ContentFactor } from "@/lib/email/content-quality-score";
import { getRevisionInstruction } from "@/lib/email/content-rules-prompt";

const FIX_TIPS: [RegExp | string, string][] = [
  [/em dash/i, "Remove em dashes. Use a comma, period, or new paragraph instead"],
  [/dear.*opener/i, 'Open with "Hi {firstName}," instead of "Dear Dr. …"'],
  [/generic team sign/i, "Sign with your first name and company. Avoid \"ISH Gifting Team\""],
  [/missing hi.*first name/i, 'Greet with "Hi {firstName}," in the first line'],
  [/no question cta/i, "End with one soft question (e.g. \"Would a sample box help?\")"],
  [/too long/i, "Shorten to under 120 words. One idea per paragraph"],
  [/long subject/i, "Keep the subject under 50 characters. Drop brand suffixes"],
  [/brand suffix in subject/i, "Remove em dashes and company suffixes from the subject"],
  [/spam trigger/i, "Remove salesy words (free, urgent, guarantee, act now, click here)"],
  [/marketing email style/i, "Use primary inbox tone. No bulk/marketing footer language"],
  [/marketing compliance footer/i, "Remove newsletter-style footer lines"],
  [/personal\/business info before any reply/i, "Do not ask for address, phone, budget, or headcount in email #1"],
  [/Do not cite employee counts/i, "Remove employee counts and numeric company stats. Say \"your team\" instead"],
  [/specific detail.*opener/i, "Add one sourced detail in the opening paragraph — not just Hi + name on its own line"],
  [/soft exit/i, 'Add a no-pressure line (e.g. "No worries if not relevant" or "Happy to pass if timing is off") — not "happy to coordinate"'],
  [/sign.?off/i, "Sign off with first name, role (e.g. Partnerships), then company"],
  [/subject.*pattern/i, "Vary the subject. Avoid only \"[Holiday] gifts for [Company]\""],
];

export function getNegativeFactors(factors: ContentFactor[]): ContentFactor[] {
  return [...factors].filter((f) => f.delta < 0).sort((a, b) => a.delta - b.delta);
}

export function factorToFixTip(label: string): string {
  for (const [pattern, tip] of FIX_TIPS) {
    if (typeof pattern === "string") {
      if (label.toLowerCase().includes(pattern.toLowerCase())) return tip;
    } else if (pattern.test(label)) {
      return tip;
    }
  }
  return `Fix: ${label}`;
}

export function getContentScoreFixTips(factors: ContentFactor[]): { issue: string; fix: string }[] {
  return getNegativeFactors(factors).map((f) => ({
    issue: f.label,
    fix: factorToFixTip(f.label),
  }));
}

export function isContentScoreImproveRequest(message: string): boolean {
  return /content score|spamless|spam score|inbox score|raise content|improve content|deliverability score|make content/i.test(
    message,
  );
}

export function buildContentScoreImproveMessage(
  factors: ContentFactor[],
  currentScore: number,
): string {
  const negatives = getNegativeFactors(factors);
  if (negatives.length === 0) {
    return (
      `Make Content score higher (currently ${currentScore}/100). ` +
      "Polish the opener with one specific detail, use a soft question CTA, keep under 120 words, " +
      "and sign with first name + company. No generic team sign-off."
    );
  }
  const issues = negatives.map((f) => f.label).join("; ");
  return `Make Content score higher (currently ${currentScore}/100). ${getRevisionInstruction(issues)}`;
}
