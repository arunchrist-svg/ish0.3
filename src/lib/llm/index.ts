import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { startAgentRun, completeAgentRun } from "@/lib/agents/log-agent-run";
import { ensureGeminiApiKey, geminiModelId, sanitizeModelId } from "@/lib/llm/gemini-env";
import { getOpenRouterChatModel, openrouterModelsToAttempt } from "@/lib/llm/openrouter";
import type { LLMProvider, LLMTier } from "@/lib/llm/tiers";
import {
  getAvailableGeminiKeys,
  getAvailableOpenRouterKeys,
  isLLMQuotaOrAuthError,
  markGeminiKeyRejected,
  markOpenRouterKeyRejected,
  markProviderRejected,
  providersToAttempt,
} from "@/lib/llm/provider-chain";

export type { LLMProvider, LLMTier } from "@/lib/llm/tiers";

export type LLMTraceContext = {
  agent: string;
  tenantId: string;
  workspaceId?: string;
  leadId?: string;
  promptVersion?: string;
};

export function getLLMProvider(): string {
  return "gemini";
}

function getAnthropicModel(tier: LLMTier) {
  const haiku = sanitizeModelId(process.env.ANTHROPIC_MODEL_HAIKU, "claude-haiku-4-5");
  const sonnet = sanitizeModelId(process.env.ANTHROPIC_MODEL_SONNET, "claude-sonnet-4-6");
  const modelId = tier === "fast" ? haiku : sonnet;
  const anthropic = createAnthropic();
  return anthropic(modelId);
}

function getGeminiModel(tier: LLMTier, apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });
  return google(geminiModelId(tier));
}

function getMaxTokens(requested?: number, provider?: LLMProvider): number {
  const base = requested ?? 2048;
  if (provider === "openrouter" || provider === "gemini") return base;
  const envCap = process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
    ? parseInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 10)
    : undefined;
  return envCap ? Math.min(base, envCap) : base;
}

function tiersToAttempt(requested: LLMTier, provider: LLMProvider): LLMTier[] {
  if (provider === "openrouter") return [requested];
  if (provider === "gemini") return [requested === "quality" ? "quality" : "fast"];
  return requested === "quality" ? ["quality", "fast"] : ["fast"];
}

async function generateWithTier(params: {
  provider: LLMProvider;
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
  openrouterModel?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; modelId?: string; latencyMs: number }> {
  const model =
    params.provider === "openrouter"
      ? getOpenRouterChatModel(params.openrouterModel, params.openrouterApiKey)
      : params.provider === "gemini"
        ? getGeminiModel(params.tier, params.geminiApiKey ?? "")
        : getAnthropicModel(params.tier);
  const started = Date.now();
  const result = await generateText({
    model,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: getMaxTokens(params.maxTokens, params.provider),
    maxRetries: params.provider === "openrouter" ? 0 : 1,
  } as Parameters<typeof generateText>[0]);
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } }).usage;
  const inputTokens = usage?.inputTokens ?? usage?.promptTokens;
  const outputTokens = usage?.outputTokens ?? usage?.completionTokens;
  const modelId = (result as { response?: { modelId?: string } }).response?.modelId;
  return { text: result.text, inputTokens, outputTokens, modelId, latencyMs: Date.now() - started };
}

async function generateWithProvider(params: {
  provider: LLMProvider;
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; modelId?: string; latencyMs: number }> {
  if (params.provider === "gemini") {
    const keys = getAvailableGeminiKeys();
    if (!keys.length) throw new Error("GEMINI_API_KEY is missing");
    let lastError: unknown;
    for (const keyEntry of keys) {
      for (const tier of tiersToAttempt(params.tier, "gemini")) {
        try {
          return await generateWithTier({
            ...params,
            tier,
            geminiApiKey: keyEntry.key,
          });
        } catch (error) {
          lastError = error;
          if (isLLMQuotaOrAuthError(error)) {
            console.warn(`[callLLM] Gemini key ${keyEntry.id} unavailable, rotating`);
            markGeminiKeyRejected(keyEntry.id);
            break;
          }
          throw error;
        }
      }
    }
    markProviderRejected("gemini");
    throw lastError ?? new Error("All Gemini keys exhausted");
  }

  if (params.provider === "openrouter") {
    const keys = getAvailableOpenRouterKeys();
    if (!keys.length) throw new Error("OPENROUTER_API_KEY is missing");
    const models = openrouterModelsToAttempt();
    let lastError: unknown;
    for (const keyEntry of keys) {
      for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        try {
          return await generateWithTier({
            ...params,
            openrouterModel: models[modelIndex],
            openrouterApiKey: keyEntry.key,
          });
        } catch (error) {
          lastError = error;
          const hasModelFallback = modelIndex < models.length - 1;
          console.warn(
            "[callLLM] OpenRouter",
            keyEntry.id,
            "model failed",
            models[modelIndex],
            error instanceof Error ? error.message : error,
          );
          if (hasModelFallback && isLLMQuotaOrAuthError(error)) continue;
          if (isLLMQuotaOrAuthError(error)) {
            markOpenRouterKeyRejected(keyEntry.id);
            break;
          }
          throw error;
        }
      }
    }
    markProviderRejected("openrouter");
    throw lastError ?? new Error("All OpenRouter keys exhausted");
  }

  const attemptTiers = tiersToAttempt(params.tier, "anthropic");
  let lastError: unknown;
  for (let i = 0; i < attemptTiers.length; i++) {
    const tier = attemptTiers[i];
    try {
      return await generateWithTier({ ...params, tier });
    } catch (error) {
      lastError = error;
      const hasTierFallback = i < attemptTiers.length - 1;
      if (hasTierFallback && isLLMQuotaOrAuthError(error)) {
        console.warn(`[callLLM] ${tier} tier unavailable, falling back to ${attemptTiers[i + 1]}`);
        continue;
      }
      if (isLLMQuotaOrAuthError(error)) markProviderRejected("anthropic");
      throw error;
    }
  }
  throw lastError ?? new Error("Anthropic call failed");
}

export async function callLLM(params: {
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
  provider?: LLMProvider;
  trace?: LLMTraceContext;
}): Promise<string> {
  const providerOrder = providersToAttempt(params.provider);
  if (!providerOrder.length) {
    throw new Error("No LLM provider configured. Add GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.");
  }

  let runId: string | undefined;
  if (params.trace) {
    runId = await startAgentRun({
      tenantId: params.trace.tenantId,
      workspaceId: params.trace.workspaceId,
      agent: params.trace.agent,
      leadId: params.trace.leadId,
      promptVersion: params.trace.promptVersion,
      tier: params.tier,
    });
  }

  let lastError: unknown;
  for (let i = 0; i < providerOrder.length; i++) {
    const provider = providerOrder[i];
    const nextProvider = providerOrder[i + 1];
    try {
      const result = await generateWithProvider({ ...params, provider });
      if (runId) {
        await completeAgentRun(runId, {
          status: "completed",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          model: result.modelId,
          tier: params.tier,
        });
      }
      if (i > 0) {
        console.warn(`[callLLM] Using ${provider} after earlier provider quota`);
      }
      return result.text;
    } catch (error) {
      lastError = error;
      if (nextProvider && isLLMQuotaOrAuthError(error)) {
        console.warn(`[callLLM] ${provider} unavailable, rotating to ${nextProvider}`);
        continue;
      }
      if (runId) {
        await completeAgentRun(runId, {
          status: "failed",
          tier: params.tier,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  throw lastError ?? new Error("LLM call failed");
}

export function isLLMQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|resource_exhausted|exceeded your current quota/i.test(msg);
}

export function llmErrorHttpStatus(error: unknown): 429 | 500 {
  return isLLMQuotaError(error) ? 429 : 500;
}

export function friendlyLLMError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "AI request failed";
  if (/No LLM provider configured/i.test(msg)) {
    return "Add GEMINI_API_KEY in .env.local to use AI features.";
  }
  if (/GEMINI_API_KEY is missing|generativeai|google/i.test(msg)) {
    if (/quota|rate.?limit|429|resource_exhausted|exceeded your current quota/i.test(msg)) {
      return "Gemini quota reached. Wait a minute or add a backup GEMINI_API_KEY_2.";
    }
    if (/api.?key|unauthorized|401|authentication/i.test(msg)) {
      return "Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.";
    }
  }
  if (/OPENROUTER_API_KEY is missing/i.test(msg)) {
    return "Add OPENROUTER_API_KEY in .env.local to use AI Writer.";
  }
  if (/openrouter/i.test(msg)) {
    if (/quota|rate.?limit|429|too many requests/i.test(msg)) {
      return "OpenRouter models are busy. Wait a minute and try again.";
    }
    if (/api.?key|unauthorized|401|authentication/i.test(msg)) {
      return "OpenRouter API key was rejected. Check OPENROUTER_API_KEY in .env.local.";
    }
  }
  if (/credit|billing|insufficient|402/i.test(msg)) {
    return "Anthropic billing issue. Check credits at console.anthropic.com.";
  }
  if (/quota|rate.?limit|resource_exhausted|exceeded your current quota|too many requests/i.test(msg)) {
    return "LLM rate limit hit. Wait about a minute and try again.";
  }
  if (/api.?key|unauthorized|401|invalid.?x-api-key|authentication/i.test(msg)) {
    return "Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (/Failed after \d+ attempts/i.test(msg)) {
    const last = msg.match(/Last error:\s*(.+)$/i)?.[1] ?? msg;
    return last.length > 180 ? `${last.slice(0, 180)}…` : last;
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

// Legacy helper for OCR paths that set GOOGLE_GENERATIVE_AI_API_KEY globally.
export { ensureGeminiApiKey } from "@/lib/llm/gemini-env";
