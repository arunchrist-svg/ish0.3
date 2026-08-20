import { createOpenAI } from "@ai-sdk/openai";
import { sanitizeEnvValue, sanitizeModelId } from "@/lib/llm/gemini-env";

/** Fast free model for AI Writer. Avoid openrouter/free: it queues and can pick slow reasoning models. */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
export const OPENROUTER_FALLBACK_MODELS = [
  "nvidia/nemotron-nano-9b-v2:free",
  "openrouter/free",
] as const;
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterKeyEntry = {
  id: string;
  key: string;
  label: string;
};

function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Collect OpenRouter keys from env: primary, numbered fallbacks, or comma-separated list. */
export function getOpenRouterKeys(): OpenRouterKeyEntry[] {
  const keys: OpenRouterKeyEntry[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, id: string) => {
    const key = sanitizeEnvValue(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push({ id, key, label: maskKey(key) });
  };

  const list = process.env.OPENROUTER_API_KEYS;
  if (list) {
    list.split(",").forEach((part, i) => add(part, `openrouter-${i + 1}`));
  }

  add(process.env.OPENROUTER_API_KEY, "openrouter-1");
  add(process.env.OPENROUTER_API_KEY_2, "openrouter-2");
  add(process.env.OPENROUTER_API_KEY_3, "openrouter-3");

  return keys;
}

export function openrouterApiKey(): string | undefined {
  return getOpenRouterKeys()[0]?.key;
}

export function hasOpenRouterKey(): boolean {
  return getOpenRouterKeys().length > 0;
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

export function getOpenRouterChatModel(modelId = openrouterModelId(), apiKey = ensureOpenRouterApiKey()) {
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
