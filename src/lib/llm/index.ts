import { generateText } from "ai";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

type LLMTier = "fast" | "quality";

function getModel(tier: LLMTier) {
  const provider = process.env.LLM_PROVIDER ?? "gemini";

  if (provider === "anthropic") {
    const haiku  = process.env.ANTHROPIC_MODEL_HAIKU  ?? "claude-haiku-4-5";
    const sonnet = process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-5";
    return tier === "fast" ? anthropic(haiku) : anthropic(sonnet);
  }

  // Gemini: flash-lite for fast, flash for quality
  const flash     = process.env.GEMINI_MODEL_FLASH      ?? "gemini-2.5-flash";
  const flashLite = process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash";
  return tier === "fast" ? google(flashLite) : google(flash);
}

function getMaxTokens(requested?: number): number {
  const envCap = process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
    ? parseInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 10)
    : undefined;
  const base = requested ?? 2048;
  return envCap ? Math.min(base, envCap) : base;
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
    maxOutputTokens: getMaxTokens(params.maxTokens),
  } as Parameters<typeof generateText>[0]);
  return text;
}
