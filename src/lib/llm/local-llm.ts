import { createOpenAI } from "@ai-sdk/openai";
import { sanitizeEnvValue, sanitizeModelId } from "@/lib/llm/gemini-env";

export const DEFAULT_LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_LOCAL_MODEL = "local-model";

function truthyFlag(raw: string | undefined): boolean | null {
  const value = sanitizeEnvValue(raw)?.toLowerCase();
  if (!value) return null;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return null;
}

/** LM Studio (or any OpenAI-compatible local server) for chat/extract. Not Google Search. */
export function localLlmEnabled(): boolean {
  const flag = truthyFlag(process.env.LOCAL_LLM_ENABLED);
  if (flag === false) return false;
  if (sanitizeEnvValue(process.env.LOCAL_LLM_BASE_URL)) return true;
  return flag === true;
}

export function localLlmBaseUrl(): string {
  const raw = sanitizeEnvValue(process.env.LOCAL_LLM_BASE_URL) ?? DEFAULT_LOCAL_LLM_BASE_URL;
  return raw.replace(/\/+$/, "");
}

export function localLlmApiKey(): string {
  return sanitizeEnvValue(process.env.LOCAL_LLM_API_KEY) || "lm-studio";
}

export function localLlmConfiguredModel(): string | undefined {
  return sanitizeEnvValue(process.env.LOCAL_LLM_MODEL);
}

let discoveredModelId: string | null = null;

export function resetLocalLlmModelCache(): void {
  discoveredModelId = null;
}

export async function resolveLocalLlmModelId(): Promise<string> {
  const configured = localLlmConfiguredModel();
  if (configured) return sanitizeModelId(configured, DEFAULT_LOCAL_MODEL);
  if (discoveredModelId) return discoveredModelId;

  const url = `${localLlmBaseUrl()}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${localLlmApiKey()}` },
    });
    if (!res.ok) throw new Error(`Local LLM models ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const id = data.data?.find((row) => row.id?.trim())?.id?.trim();
    if (!id) throw new Error("LM Studio has no model loaded. Load a chat model and Start Server.");
    discoveredModelId = id;
    return id;
  } finally {
    clearTimeout(timer);
  }
}

export function getLocalChatModel(modelId: string) {
  const openai = createOpenAI({
    name: "lm-studio",
    apiKey: localLlmApiKey(),
    baseURL: localLlmBaseUrl(),
  });
  return openai.chat(modelId);
}
