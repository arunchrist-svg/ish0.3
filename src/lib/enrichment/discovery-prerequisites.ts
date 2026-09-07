import {
  configUsesTavilyForCompanies,
  hasApolloKey,
  isAgenticSearchProvider,
  resolveAgenticDataStack,
  type EnrichmentConfig,
} from "./config";
import { friendlyLLMError } from "@/lib/llm";
import { hasGeminiKeys } from "@/lib/llm/gemini-keys";
import { hasAnthropicKey } from "@/lib/llm/provider-chain";
import { hasOpenRouterKey } from "@/lib/llm/openrouter";
import { hasTavilyKeys } from "./tavily-keys";

export function hasTavilyKey(): boolean {
  return hasTavilyKeys();
}

export function hasGeminiKey(): boolean {
  return hasGeminiKeys();
}

export function hasLLMKey(): boolean {
  return hasAnthropicKey() || hasGeminiKey() || hasOpenRouterKey();
}

export function checkDiscoveryPrerequisites(cfg: EnrichmentConfig): string[] {
  const errors: string[] = [];

  if (isAgenticSearchProvider(cfg.searchProvider)) {
    const stack = resolveAgenticDataStack(cfg.agenticDataStack);
    if (stack === "places_apollo") {
      if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
        errors.push(
          "Agentic Places + Apollo needs GOOGLE_PLACES_API_KEY. Add it, or switch Agentic data stack to Directories.",
        );
      }
      if (cfg.peopleSearchProvider !== "none" && !hasApolloKey()) {
        errors.push(
          "Agentic Places + Apollo needs APOLLO_API_KEY for people search. Add it, turn People search Off, or switch to Directories.",
        );
      }
      return errors;
    }
  }

  const needsTavily = configUsesTavilyForCompanies(cfg);

  if (needsTavily && !hasTavilyKey()) {
    errors.push(
      cfg.searchProvider === "agentic_ai"
        ? "Agentic Directories uses Tavily to search Indian directories. Add a Tavily key, switch Agentic data stack to Places + Apollo, or use Google Places company search."
        : cfg.searchProvider === "india_directories"
          ? "India Directories uses Tavily to search Indian directory sites. Add a Tavily key or switch Company search to Google Places."
          : "TAVILY_API_KEY is missing. Add it in .env.local or Settings to discover companies.",
    );
  }

  if (needsTavily && !hasLLMKey()) {
    errors.push(
      "GEMINI_API_KEY is missing. Directory search will use basic parsing only until Gemini is configured.",
    );
  }

  if (cfg.searchProvider === "apollo" && !hasApolloKey()) {
    errors.push("APOLLO_API_KEY is missing. Switch Data Mode to Free or add your Apollo key.");
  }

  if (cfg.searchProvider === "google_places" && !process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    errors.push("GOOGLE_PLACES_API_KEY is missing. Switch search provider or add a Google Places key.");
  }

  return errors;
}

export function llmErrorMessage(err: unknown): string {
  const detail = friendlyLLMError(err);
  if (/unavailable for free|use this slug instead|Backup AI model was unavailable/i.test(detail)) {
    return "Backup AI model was unavailable; used directory parsing.";
  }
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
