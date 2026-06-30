import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import type { ReplyIntentResult } from "@/lib/email/reply-intent";

export const replyPlanSchema = z.object({
  goal: z.string().min(8),
  keyPointsToAddress: z.array(z.string()).min(1).max(4),
  nextCta: z.string().min(8),
  toneNotes: z.string().optional(),
  thingsToAvoid: z.array(z.string()).default([]),
});

export type ReplyPlan = z.infer<typeof replyPlanSchema>;

export function formatReplyPlanForPrompt(plan: ReplyPlan): string {
  return `Reply plan:
- Goal: ${plan.goal}
- Address: ${plan.keyPointsToAddress.join("; ")}
- Next CTA: ${plan.nextCta}
${plan.toneNotes ? `- Tone: ${plan.toneNotes}` : ""}
${plan.thingsToAvoid.length ? `- Avoid: ${plan.thingsToAvoid.join("; ")}` : ""}`;
}

export async function generateReplyPlan(params: {
  contactFirstName: string;
  companyName: string;
  originalEmail: string;
  replyContent: string;
  intent: ReplyIntentResult;
  replyCtaInstruction: string;
  giftingHook?: string | null;
  tenantId: string;
  workspaceId: string;
  leadId: string;
}): Promise<ReplyPlan> {
  const prompt = `Plan a short B2B email reply (not the email itself).

Prospect: ${params.contactFirstName} at ${params.companyName}
Intent: ${params.intent.intent}${params.intent.agreedTo ? ` (agreed: ${params.intent.agreedTo})` : ""}
Gifting context: ${params.giftingHook ?? "corporate gifting"}
Required next CTA: ${params.replyCtaInstruction}

Their reply:
"""
${params.replyContent}
"""

Our original email:
"""
${params.originalEmail}
"""

Output ONLY JSON:
{
  "goal": "one sentence",
  "keyPointsToAddress": ["point 1", "point 2"],
  "nextCta": "exact question or ask to advance",
  "toneNotes": "mirror their tone, stay warm and brief",
  "thingsToAvoid": ["corporate filler", "re-asking what they answered"]
}`;

  const raw = await callLLM({
    tier: tierForAgentStep("reply.plan"),
    system: "You output only valid JSON. No markdown. Never use em dashes.",
    prompt,
    maxTokens: 384,
    trace: {
      agent: "reply-planner",
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      promptVersion: "v1",
    },
  });

  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = replyPlanSchema.safeParse(obj);
    if (parsed.success) return parsed.data;
  } catch {
    /* fallback */
  }

  return {
    goal: "Respond naturally and move to the next step",
    keyPointsToAddress: ["Acknowledge what they said", "Advance one clear next step"],
    nextCta: params.replyCtaInstruction,
    toneNotes: "Conversational, brief, human",
    thingsToAvoid: ["Thank you for your response", "I hope this finds you well", "re-asking answered questions"],
  };
}
