import type { EnrichmentConfig } from "./config";
import { friendlyLLMError } from "@/lib/llm";
import { hasTavilyKeys } from "./tavily-keys";

export function hasTavilyKey(): boolean {
  return hasTavilyKeys();
}

export function hasGeminiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function hasLLMKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function checkDiscoveryPrerequisites(cfg: EnrichmentConfig): string[] {
  const errors: string[] = [];
  const needsTavily =
    cfg.searchProvider === "india_directories" ||
    cfg.searchProvider === "tavily_ai" ||
    cfg.fallbackToAI;

  if (needsTavily && !hasTavilyKey()) {
    errors.push("TAVILY_API_KEY is missing. Add it in .env.local or Settings to discover companies.");
  }

  if (
    (cfg.searchProvider === "india_directories" || cfg.searchProvider === "tavily_ai" || cfg.fallbackToAI) &&
    !hasLLMKey()
  ) {
    errors.push(
      "ANTHROPIC_API_KEY is missing. Directory search will use basic parsing only until Claude is configured.",
    );
  }

  if (cfg.searchProvider === "apollo" && !process.env.APOLLO_API_KEY) {
    errors.push("APOLLO_API_KEY is missing. Switch Data Mode to Free or add your Apollo key.");
  }

  if (cfg.searchProvider === "google_places" && !process.env.GOOGLE_PLACES_API_KEY) {
    errors.push("GOOGLE_PLACES_API_KEY is missing. Switch search provider or add a Google Places key.");
  }

  return errors;
}

export function llmErrorMessage(err: unknown): string {
  const detail = friendlyLLMError(err);
  if (/quota|rate.?limit|resource_exhausted|billing/i.test(detail)) {
    return "LLM API quota exceeded — using directory parsing fallback.";
  }
  if (/api.?key|unauthorized|401|403|rejected/i.test(detail)) {
    return "LLM API key rejected — using directory parsing fallback.";
  }
  if (/AI extraction failed|directory parsing fallback/i.test(detail)) {
    return detail;
  }
  return `${detail} — using directory parsing fallback.`;
}
