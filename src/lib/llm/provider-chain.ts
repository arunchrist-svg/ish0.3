import type { LLMProvider } from "@/lib/llm/tiers";
import { getGeminiKeys } from "@/lib/llm/gemini-keys";
import { getOpenRouterKeys } from "@/lib/llm/openrouter";
import { localLlmEnabled } from "@/lib/llm/local-llm";
import { sanitizeEnvValue } from "@/lib/llm/gemini-env";

/** Chat/extract only. Gemini is reserved for Scout Google Search (`geminiGroundedSearch`). */
export const DEFAULT_LLM_PROVIDER_ORDER: LLMProvider[] = ["local", "openrouter", "anthropic"];

const sessionRejectedGeminiKeys = new Set<string>();
const sessionRejectedOpenRouterKeys = new Set<string>();
let sessionAnthropicRejected = false;
let sessionOpenRouterRejected = false;
let sessionLocalRejected = false;

export function isLLMQuotaOrAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|resource_exhausted|429|exceeded your current quota|too many requests|credit|billing|insufficient|402|api.?key|unauthorized|401|invalid.?x-api-key|authentication/i.test(
    msg,
  );
}

export function isLLMTransportError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  return /econnrefused|enotfound|etimedout|fetch failed|network|socket|aborted|connect/i.test(`${msg} ${cause}`);
}

/** Model slug is dead or not free anymore. Retry another OpenRouter model, do not kill the key. */
export function isLLMModelUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unavailable for free|use this slug instead|model.?not.?found|404|no such model|is not a valid model|does not exist|data policy/i.test(
    msg,
  );
}

/** True when OpenRouter (or any provider) should try the next model in the list. */
export function isLLMModelFallbackError(error: unknown): boolean {
  return isLLMQuotaOrAuthError(error) || isLLMModelUnavailableError(error) || isLLMTransportError(error);
}

export function hasAnthropicKey(): boolean {
  return !!sanitizeEnvValue(process.env.ANTHROPIC_API_KEY);
}

export function isProviderConfigured(provider: LLMProvider): boolean {
  if (provider === "gemini") return getAvailableGeminiKeys().length > 0;
  if (provider === "anthropic") return hasAnthropicKey() && !sessionAnthropicRejected;
  if (provider === "openrouter") return getAvailableOpenRouterKeys().length > 0;
  if (provider === "local") return localLlmEnabled() && !sessionLocalRejected;
  return false;
}

export function getAvailableGeminiKeys() {
  return getGeminiKeys().filter((entry) => !sessionRejectedGeminiKeys.has(entry.id));
}

export function getAvailableOpenRouterKeys() {
  if (sessionOpenRouterRejected) return [];
  return getOpenRouterKeys().filter((entry) => !sessionRejectedOpenRouterKeys.has(entry.id));
}

export function markGeminiKeyRejected(keyId: string): void {
  sessionRejectedGeminiKeys.add(keyId);
}

export function markOpenRouterKeyRejected(keyId: string): void {
  sessionRejectedOpenRouterKeys.add(keyId);
}

export function markProviderRejected(provider: LLMProvider): void {
  if (provider === "anthropic") sessionAnthropicRejected = true;
  if (provider === "openrouter") sessionOpenRouterRejected = true;
  if (provider === "local") sessionLocalRejected = true;
}

/** Reset session rejects (tests). */
export function resetLLMProviderSession(): void {
  sessionRejectedGeminiKeys.clear();
  sessionRejectedOpenRouterKeys.clear();
  sessionAnthropicRejected = false;
  sessionOpenRouterRejected = false;
  sessionLocalRejected = false;
}

export function providersToAttempt(preferred?: LLMProvider): LLMProvider[] {
  const order: LLMProvider[] = [];
  const add = (provider: LLMProvider) => {
    if (isProviderConfigured(provider) && !order.includes(provider)) order.push(provider);
  };

  if (preferred && preferred !== "gemini") add(preferred);
  for (const provider of DEFAULT_LLM_PROVIDER_ORDER) add(provider);
  return order;
}

export function takeProviderSwitchMessage(from: LLMProvider, to: LLMProvider): string {
  const labels: Record<LLMProvider, string> = {
    gemini: "Gemini",
    anthropic: "Claude",
    openrouter: "OpenRouter",
    local: "LM Studio",
  };
  return `${labels[from]} quota reached. Switched to ${labels[to]}.`;
}

