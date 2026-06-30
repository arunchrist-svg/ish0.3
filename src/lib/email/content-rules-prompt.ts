import type { EmailStyle } from "@/lib/email/config";

export type AntiSpamPromptContext = {
  sequencePosition: number;
  senderFirstName: string;
  brandName: string;
  emailStyle?: EmailStyle;
  isReplyDraft?: boolean;
};

const NO_COMPANY_STATS_RULE =
  "Never cite numeric company stats in the email: no employee count, headcount, team size, revenue, funding, or similar figures (e.g. '100 employees', '500-person team'). Say 'your team' instead.";

/** LLM instructions aligned with content-rules.ts scorer and cold-email-review skill. */
export function getAntiSpamWritingRules(ctx: AntiSpamPromptContext): string {
  const lines = [
    "CONTENT QUALITY (avoid spam-filter triggers):",
    `- After "Hi {firstName}," add ONE specific, sourced detail (title, verified hook, or intel) in the same breath, not a standalone greeting line`,
    `- Sign off: "${ctx.senderFirstName}", your role (e.g. Partnerships), then "${ctx.brandName}", never first name + company only`,
    '- Always include a soft exit before the sign-off (e.g. "No worries if not relevant" or "Happy to pass if timing is off")',
    "- Never: Dear, em dashes, FREE, urgent, guarantee, act now, click here, no pressure, complimentary, generic team sign-offs",
    "- Never use em dashes in subject or body. Use commas, periods, or line breaks instead.",
    "- One question CTA; keep under 120 words",
    '- "Happy to coordinate" or "happy to help" is NOT a soft exit',
    `- ${NO_COMPANY_STATS_RULE}`,
    "REWRITE RULES:",
    "- Max 3 sentences in the pitch body for emails 1 and 2 (excluding greeting and sign-off)",
    "- Subject: specific + curiosity-inducing, under 50 characters, never generic (no Following up, Quick question, Checking in)",
    "- Opening line after greeting: never start with I or the company name",
    "- One CTA only per email",
  ];

  if (ctx.sequencePosition === 1) {
    lines.push(
      "- EMAIL #1: Hook + single soft CTA. No pitch dump.",
      "- EMAIL #1: Do NOT ask for address, phone, headcount, budget, team size, quantities, or delivery/shipping details",
      "- EMAIL #1: Do NOT ask to coordinate delivery, confirm quantities, or ship a sample before they reply",
      "- EMAIL #1: No per-person pricing or bulk quotes; save for later after they reply",
      "- Vary subject structure; do not use only '[Holiday] gifts for [Company]' pattern",
    );
  }

  if (ctx.sequencePosition === 2) {
    lines.push(
      "- EMAIL #2: Add NEW value not in Email 1 (new angle, proof point, or real urgency). Never say just following up or checking in.",
    );
  }

  if (ctx.sequencePosition === 3) {
    lines.push(
      "- EMAIL #3 (breakup): Short, no-pressure, human. Leave the door open. No pitch dump.",
    );
  }

  if (ctx.sequencePosition >= 4 || ctx.isReplyDraft) {
    lines.push(
      "- REPLY STAGE: They already replied to our outreach. Advance to the next step.",
      "- REPLY STAGE: You MAY ask for address, phone, delivery details, or scheduling as needed.",
      "- REPLY STAGE: Do NOT repeat a question they already answered affirmatively.",
      "- REPLY STAGE: Thank them briefly before asking for logistics or next steps.",
    );
  }

  if (ctx.emailStyle === "marketing") {
    lines.push("- Marketing mode: include unsubscribe/compliance footer language if pitching commercially");
  }

  return lines.join("\n");
}

export function getRevisionInstruction(issues: string): string {
  return `Previous draft failed content quality check. Fix ALL of these:\n${issues}\nRewrite to pass while keeping friendly, professional tone (not salesy) and personalization.`;
}


export function getStyleOnlyRevisionInstruction(deliverabilityIssues: string): string {
  if (!deliverabilityIssues || deliverabilityIssues === "generic tone") {
    return "Apply only the user's stylistic request. Do not add new facts, job titles, research hooks, or intel. Keep paragraph breaks (blank lines between sections).";
  }
  return `Fix only these deliverability issues without adding new personalization or facts:\n${deliverabilityIssues}\nKeep the user's requested tone change. Preserve paragraph breaks.`;
}
