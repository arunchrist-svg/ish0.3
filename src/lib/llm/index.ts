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

function isQuotaOrRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|resource_exhausted|429|exceeded your current quota|too many requests/i.test(msg);
}

function tiersToAttempt(requested: LLMTier): LLMTier[] {
  return requested === "quality" ? ["quality", "fast"] : ["fast"];
}

async function generateWithTier(params: {
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
    maxRetries: 1,
  } as Parameters<typeof generateText>[0]);
  return text;
}

export async function callLLM(params: {
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const attemptTiers = tiersToAttempt(params.tier);
  let lastError: unknown;

  for (let i = 0; i < attemptTiers.length; i++) {
    const tier = attemptTiers[i];
    try {
      return await generateWithTier({ ...params, tier });
    } catch (error) {
      lastError = error;
      const hasFallback = i < attemptTiers.length - 1;
      if (hasFallback && isQuotaOrRateLimitError(error)) {
        console.warn(`[callLLM] ${tier} tier quota/rate limit — falling back to ${attemptTiers[i + 1]}`);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("LLM call failed");
}

export function friendlyLLMError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "AI request failed";
  if (/quota|rate.?limit|resource_exhausted|exceeded your current quota/i.test(msg)) {
    return "Gemini API quota exceeded. Wait about a minute and try again, or switch to a paid API plan.";
  }
  if (/Failed after \d+ attempts/i.test(msg)) {
    const last = msg.match(/Last error:\s*(.+)$/i)?.[1] ?? msg;
    if (/quota|rate.?limit/i.test(last)) {
      return "Gemini API quota exceeded. Wait about a minute and try again.";
    }
    return last.length > 180 ? `${last.slice(0, 180)}…` : last;
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
