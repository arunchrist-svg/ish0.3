import type { LLMTier } from "@/lib/llm/tiers";

/** Maps agent steps to LLM tiers. Quality only where prose matters. */
export const AGENT_LLM_TIER: Record<string, LLMTier> = {
  "intent.classify": "fast",
  "reply.plan": "quality",
  "reply.write": "quality",
  "reply.critic": "fast",
  "search.parseQuery": "fast",
  "search.verifyMatch": "quality",
  "search.extract": "quality",
  "writer.plan": "quality",
  "writer.write": "quality",
  "writer.revise": "quality",
};

export function tierForAgentStep(step: string): LLMTier {
  return AGENT_LLM_TIER[step] ?? "fast";
}

export const WORKFLOW_LLM_CALL_CAPS = {
  reply: 5,
  search: 4,
} as const;
