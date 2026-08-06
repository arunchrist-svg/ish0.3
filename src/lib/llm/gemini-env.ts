export function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/^["']|["']$/g, "");
}

export function sanitizeModelId(value: string | undefined, fallback: string): string {
  return sanitizeEnvValue(value) ?? fallback;
}

export function ensureGeminiApiKey(): void {
  const geminiKey = sanitizeEnvValue(process.env.GEMINI_API_KEY);
  if (!sanitizeEnvValue(process.env.GOOGLE_GENERATIVE_AI_API_KEY) && geminiKey) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = geminiKey;
  }
}

/** @deprecated Use ensureGeminiApiKey */
export const ensureGeminiApiKeyForOcr = ensureGeminiApiKey;

export function geminiModelId(tier: "fast" | "quality"): string {
  if (tier === "fast") {
    return sanitizeModelId(process.env.GEMINI_MODEL_FLASH_LITE, "gemini-2.5-flash-lite");
  }
  return sanitizeModelId(process.env.GEMINI_MODEL_FLASH, "gemini-2.5-flash");
}
