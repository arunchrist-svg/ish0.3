import { sanitizeEnvValue } from "@/lib/llm/gemini-env";

export type GeminiKeyEntry = {
  id: string;
  key: string;
  label: string;
};

function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Collect Gemini keys from env: primary, numbered fallbacks, or comma-separated list. */
export function getGeminiKeys(): GeminiKeyEntry[] {
  const keys: GeminiKeyEntry[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, id: string) => {
    const key = sanitizeEnvValue(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push({ id, key, label: maskKey(key) });
  };

  const list = process.env.GEMINI_API_KEYS;
  if (list) {
    list.split(",").forEach((part, i) => add(part, `gemini-${i + 1}`));
  }

  add(process.env.GEMINI_API_KEY, "gemini-1");
  add(process.env.GEMINI_API_KEY_2, "gemini-2");
  add(process.env.GEMINI_API_KEY_3, "gemini-3");
  add(process.env.GOOGLE_GENERATIVE_AI_API_KEY, "gemini-google");

  return keys;
}

export function hasGeminiKeys(): boolean {
  return getGeminiKeys().length > 0;
}
