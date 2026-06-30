import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import {
  classifyReplyIntent,
  type ReplyIntentResult,
  type AgreedTo,
} from "@/lib/email/reply-intent";

const intentSchema = z.object({
  intent: z.enum(["affirmative", "negative", "question", "scheduling", "other"]),
  confidence: z.number().min(0).max(1),
  agreedTo: z.enum(["sample", "call", "visit"]).nullable().optional(),
});

export async function classifyReplyIntentAsync(
  text: string,
  priorCta: string | null | undefined,
  trace?: { tenantId: string; workspaceId?: string; leadId?: string },
): Promise<ReplyIntentResult & { confidence: number }> {
  const regexResult = classifyReplyIntent(text, priorCta);

  if (!text.trim() || text.trim().length > 500) {
    return { ...regexResult, confidence: text.trim() ? 0.7 : 1 };
  }

  try {
    const raw = await callLLM({
      tier: tierForAgentStep("intent.classify"),
      system: "Classify sales email replies. Output only JSON.",
      prompt: `Classify this prospect reply.

Prior CTA they may be answering: ${priorCta ?? "unknown"}

Reply:
"""
${text.trim()}
"""

Output JSON: { "intent": "affirmative|negative|question|scheduling|other", "confidence": 0.0-1.0, "agreedTo": "sample|call|visit|null" }`,
      maxTokens: 128,
      trace: trace
        ? { agent: "reply-intent", tenantId: trace.tenantId, workspaceId: trace.workspaceId, leadId: trace.leadId, promptVersion: "v1" }
        : undefined,
    });

    const obj = parseJsonObjectFromLLM(raw);
    const parsed = intentSchema.safeParse(obj);
    if (parsed.success && parsed.data.confidence >= 0.6) {
      return {
        intent: parsed.data.intent,
        agreedTo: (parsed.data.agreedTo ?? null) as AgreedTo,
        confidence: parsed.data.confidence,
      };
    }
  } catch {
    /* regex fallback */
  }

  return { ...regexResult, confidence: 0.65 };
}
