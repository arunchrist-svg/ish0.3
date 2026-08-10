import { generateText } from "ai";
import { startAgentRun, completeAgentRun } from "@/lib/agents/log-agent-run";
import { anthropic } from "@ai-sdk/anthropic";
import { sanitizeModelId } from "@/lib/llm/gemini-env";

type LLMTier = "fast" | "quality";

export type LLMTraceContext = {
  agent: string;
  tenantId: string;
  workspaceId?: string;
  leadId?: string;
  promptVersion?: string;
};

export function getLLMProvider(): string {
  return "anthropic";
}

function getModel(tier: LLMTier) {
  const haiku = sanitizeModelId(process.env.ANTHROPIC_MODEL_HAIKU, "claude-haiku-4-5");
  const sonnet = sanitizeModelId(process.env.ANTHROPIC_MODEL_SONNET, "claude-sonnet-4-6");
  return tier === "fast" ? anthropic(haiku) : anthropic(sonnet);
}

function getMaxTokens(requested?: number): number {
  const envCap = process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
    ? parseInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 10)
    : undefined;
  const base = requested ?? 2048;
  return envCap ? Math.min(base, envCap) : base;
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|resource_exhausted|429|exceeded your current quota|too many requests/i.test(msg);
}

function tiersToAttempt(requested: LLMTier): LLMTier[] {
  return requested === "quality" ? ["quality", "fast"] : ["fast"];
}

async function generateWithTier(params: {
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number; modelId?: string; latencyMs: number }> {
  const model = getModel(params.tier);
  const started = Date.now();
  const result = await generateText({
    model,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: getMaxTokens(params.maxTokens),
    maxRetries: 1,
  } as Parameters<typeof generateText>[0]);
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } }).usage;
  const inputTokens = usage?.inputTokens ?? usage?.promptTokens;
  const outputTokens = usage?.outputTokens ?? usage?.completionTokens;
  const modelId = (result as { response?: { modelId?: string } }).response?.modelId;
  return { text: result.text, inputTokens, outputTokens, modelId, latencyMs: Date.now() - started };
}

export async function callLLM(params: {
  tier: LLMTier;
  system: string;
  prompt: string;
  maxTokens?: number;
  trace?: LLMTraceContext;
}): Promise<string> {
  const attemptTiers = tiersToAttempt(params.tier);
  let lastError: unknown;
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

  for (let i = 0; i < attemptTiers.length; i++) {
    const tier = attemptTiers[i];
    try {
      const result = await generateWithTier({ ...params, tier });
      if (runId) {
        await completeAgentRun(runId, {
          status: "completed",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          model: result.modelId,
          tier,
        });
      }
      return result.text;
    } catch (error) {
      lastError = error;
      const hasFallback = i < attemptTiers.length - 1;
      if (hasFallback && isQuotaOrRateLimitError(error)) {
        console.warn(`[callLLM] ${tier} tier quota/rate limit, falling back to ${attemptTiers[i + 1]}`);
        continue;
      }
      if (runId) {
        await completeAgentRun(runId, {
          status: "failed",
          tier,
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
  if (/credit|billing|insufficient|402/i.test(msg)) {
    return "Anthropic billing issue. Check credits at console.anthropic.com.";
  }
  if (/quota|rate.?limit|resource_exhausted|exceeded your current quota|too many requests/i.test(msg)) {
    return "Claude rate limit hit. Wait about a minute and try again.";
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
