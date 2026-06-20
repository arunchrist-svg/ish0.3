import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

type LLMTier = "fast" | "quality";

function getModel(tier: LLMTier) {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "anthropic") {
    return tier === "fast"
      ? anthropic("claude-haiku-4-5")
      : anthropic("claude-sonnet-4-5");
  }
  return tier === "fast"
    ? google("gemini-2.0-flash")
    : google("gemini-2.5-flash");
}

export async function callLLM(params: {
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const model = getModel(params.tier);
  const { text } = await generateText({
    model,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxTokens ?? 2048,
  } as Parameters<typeof generateText>[0]);
  return text;
}
