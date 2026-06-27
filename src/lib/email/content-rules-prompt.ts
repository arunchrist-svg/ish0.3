import type { EmailStyle } from "@/lib/email/config";

export type AntiSpamPromptContext = {
  sequencePosition: number;
  senderFirstName: string;
  brandName: string;
  emailStyle?: EmailStyle;
  hasVerifiedEmployeeCount?: boolean;
};

/** LLM instructions aligned with content-rules.ts scorer (rules A–H). */
export function getAntiSpamWritingRules(ctx: AntiSpamPromptContext): string {
  const lines = [
    "CONTENT QUALITY (avoid spam-filter triggers):",
    `- After "Hi {firstName}," add ONE specific, sourced detail (title, verified hook, or intel) in the same breath — not a standalone greeting line`,
    `- Sign off: "${ctx.senderFirstName}", your role (e.g. Partnerships), then "${ctx.brandName}" — never first name + company only`,
    '- Always include a soft exit before the sign-off (e.g. "No worries if not relevant" or "Happy to pass if timing is off")',
    "- Never: Dear, em dashes (—), FREE, urgent, guarantee, act now, click here, generic team sign-offs",
    "- Never use em dashes (—) in subject or body. Use commas, periods, or line breaks instead.",
    "- One question CTA; keep under 120 words",
    '- "Happy to coordinate" or "happy to help" is NOT a soft exit',
  ];

  if (ctx.sequencePosition === 1) {
    lines.push(
      "- EMAIL #1: Do NOT ask for address, phone, headcount, budget, team size, quantities, or delivery/shipping details",
      "- EMAIL #1: Do NOT ask to coordinate delivery, confirm quantities, or ship a sample before they reply",
      ctx.hasVerifiedEmployeeCount
        ? "- You may reference the employee count from Company context only; do not invent other stats"
        : "- Do NOT state specific employee/headcount numbers (e.g. '120-person team'); say 'your team' instead",
      "- EMAIL #1: No per-person pricing or bulk quotes; save for later after they reply",
      "- Vary subject structure; do not use only '[Holiday] gifts for [Company]' pattern",
    );
  }

  if (ctx.emailStyle === "marketing") {
    lines.push("- Marketing mode: include unsubscribe/compliance footer language if pitching commercially");
  }

  return lines.join("\n");
}

export function getRevisionInstruction(issues: string): string {
  return `Previous draft failed content quality check. Fix ALL of these:\n${issues}\nRewrite to pass while keeping warmth and personalisation.`;
}
