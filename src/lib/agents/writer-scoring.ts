export const RUBRIC_DIMENSIONS = ["personalisation", "clarity", "cta_strength", "deliverability"] as const;
export const DELIVERABILITY_PASS_THRESHOLD = 70;

export async function scoreDeliverability(body: string, subject: string): Promise<number> {
  let score = 100;
  const spamWords = ["free", "urgent", "guarantee", "100%", "act now", "limited time", "winner", "click here", "buy now"];
  const lower = (body + " " + subject).toLowerCase();

  for (const w of spamWords) {
    if (lower.includes(w)) score -= 10;
  }

  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 200) score -= 15;
  if (wordCount < 30) score -= 20;

  if (!body.includes("?")) score -= 5;
  if (!body.toLowerCase().includes("call") && !body.toLowerCase().includes("meet")) score -= 5;
  if (subject.length > 80) score -= 10;
  if (subject.toLowerCase().includes("free") || subject.toLowerCase().includes("offer")) score -= 10;

  return Math.max(0, score);
}

export async function getDeliverabilityIssues(body: string): Promise<string> {
  const issues: string[] = [];
  const lower = body.toLowerCase();
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 200) issues.push("too long (>200 words)");
  if (!lower.includes("?")) issues.push("no CTA question");
  if (!lower.includes("call") && !lower.includes("meet")) issues.push("no call-to-action");
  return issues.join("; ") || "generic tone";
}

export async function scoreRubric(params: {
  subjectA: string;
  emailBody: string;
  contact: { name: string; title?: string | null; firstName?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null };
}): Promise<Record<(typeof RUBRIC_DIMENSIONS)[number], number>> {
  const { subjectA, emailBody, contact, account } = params;
  const lower = emailBody.toLowerCase();

  const personalisation =
    (lower.includes(account.name.toLowerCase()) ? 8 : 0) +
    (contact.firstName && lower.includes(contact.firstName.toLowerCase()) ? 8 : 0) +
    (account.industry && lower.includes(account.industry.toLowerCase()) ? 5 : 0) +
    (account.employees ? 4 : 0);

  const clarity =
    (emailBody.trim().split(/\s+/).length <= 150 ? 15 : 8) +
    (emailBody.split("\n\n").length >= 2 ? 5 : 0) +
    5;

  const cta_strength =
    (lower.includes("schedule") || lower.includes("call") ? 10 : 0) +
    (lower.includes("15") || lower.includes("minutes") ? 8 : 0) +
    (lower.includes("?") ? 7 : 0);

  const deliverability = Math.round((await scoreDeliverability(emailBody, subjectA)) / 4);

  return {
    personalisation: Math.min(25, personalisation),
    clarity: Math.min(25, clarity),
    cta_strength: Math.min(25, cta_strength),
    deliverability: Math.min(25, deliverability),
  };
}

export function deliverabilityVerdict(score: number): string {
  if (score >= 80) return "PASS";
  if (score >= DELIVERABILITY_PASS_THRESHOLD) return "MARGINAL";
  return "FAIL";
}
