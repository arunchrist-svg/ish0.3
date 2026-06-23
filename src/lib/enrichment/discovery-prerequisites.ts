import type { EnrichmentConfig } from "./config";
import { hasTavilyKeys } from "./tavily-keys";

export function hasTavilyKey(): boolean {
  return hasTavilyKeys();
}

export function hasGeminiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function hasLLMKey(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (provider === "openrouter") return !!process.env.OPENROUTER_API_KEY;
  return hasGeminiKey();
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
      "LLM API key is missing. Directory search will use basic parsing only until an AI key is configured.",
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
  const msg = err instanceof Error ? err.message : String(err);
  if (/quota|429|rate.?limit|resource_exhausted/i.test(msg)) {
    return "LLM API quota exceeded — using directory parsing fallback.";
  }
  if (/api.?key|401|403|unauthorized|invalid/i.test(msg)) {
    return "LLM API key rejected — using directory parsing fallback.";
  }
  return "AI extraction failed — using directory parsing fallback.";
}
