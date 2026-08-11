import { createOpenAI } from "@ai-sdk/openai";
import { sanitizeEnvValue, sanitizeModelId } from "@/lib/llm/gemini-env";

/** Fast free model for AI Writer. Avoid openrouter/free: it queues and can pick slow reasoning models. */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
export const OPENROUTER_FALLBACK_MODELS = [
  "nvidia/nemotron-nano-9b-v2:free",
  "openrouter/free",
] as const;
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function openrouterApiKey(): string | undefined {
  return sanitizeEnvValue(process.env.OPENROUTER_API_KEY);
}

export function hasOpenRouterKey(): boolean {
  return !!openrouterApiKey();
}

export function openrouterModelId(): string {
  return sanitizeModelId(process.env.OPENROUTER_MODEL, DEFAULT_OPENROUTER_MODEL);
}

export function openrouterModelsToAttempt(): string[] {
  const primary = openrouterModelId();
  const preferred = primary === "openrouter/free" ? DEFAULT_OPENROUTER_MODEL : primary;
  return [...new Set([preferred, DEFAULT_OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS])];
}

export function ensureOpenRouterApiKey(): string {
  const key = openrouterApiKey();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it in .env.local to use AI Writer.");
  }
  return key;
}

export function getOpenRouterChatModel(modelId = openrouterModelId()) {
  const apiKey = ensureOpenRouterApiKey();
  const openrouter = createOpenAI({
    name: "openrouter",
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    headers: {
      "HTTP-Referer":
        sanitizeEnvValue(process.env.OPENROUTER_SITE_URL) ??
        sanitizeEnvValue(process.env.NEXT_PUBLIC_APP_URL) ??
        "http://localhost:3002",
      "X-Title": sanitizeEnvValue(process.env.OPENROUTER_SITE_NAME) ?? "ISH Sales Accelerator",
    },
  });
  return openrouter.chat(modelId);
}
