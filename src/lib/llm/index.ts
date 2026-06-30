import { generateText } from "ai";
import { startAgentRun, completeAgentRun } from "@/lib/agents/log-agent-run";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

type LLMTier = "fast" | "quality";

export type LLMTraceContext = {
  agent: string;
  tenantId: string;
  workspaceId?: string;
  leadId?: string;
  promptVersion?: string;
};

let openRouterClient: ReturnType<typeof createOpenAI> | null = null;


function getOpenRouterSiteUrl(): string {
  if (process.env.OPENROUTER_SITE_URL) return process.env.OPENROUTER_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3002";
}

function getOpenRouterClient() {
  if (!openRouterClient) {
    openRouterClient = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer": getOpenRouterSiteUrl(),
        "X-Title": process.env.OPENROUTER_SITE_NAME ?? "ISH Sales Accelerator",
      },
    });
  }
  return openRouterClient;
}

function getModel(tier: LLMTier) {
  const provider = process.env.LLM_PROVIDER ?? "gemini";

  if (provider === "anthropic") {
    const haiku  = process.env.ANTHROPIC_MODEL_HAIKU  ?? "claude-haiku-4-5";
    const sonnet = process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-5";
    return tier === "fast" ? anthropic(haiku) : anthropic(sonnet);
  }

  if (provider === "openrouter") {
    const fast    = process.env.OPENROUTER_MODEL_FAST    ?? "openai/gpt-4o-mini";
    const quality = process.env.OPENROUTER_MODEL_QUALITY ?? "openai/gpt-4o";
    const client  = getOpenRouterClient();
    return tier === "fast" ? client(fast) : client(quality);
  }

  const flash     = process.env.GEMINI_MODEL_FLASH      ?? "gemini-2.5-flash";
  const flashLite = process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash";
  return tier === "fast" ? google(flashLite) : google(flash);
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
        console.warn(`[callLLM] ${tier} tier quota/rate limit — falling back to ${attemptTiers[i + 1]}`);
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

export function friendlyLLMError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "AI request failed";
  if (/quota|rate.?limit|resource_exhausted|exceeded your current quota/i.test(msg)) {
    return "LLM API quota exceeded. Wait about a minute and try again, or switch to a paid API plan.";
  }
  if (/Failed after \d+ attempts/i.test(msg)) {
    const last = msg.match(/Last error:\s*(.+)$/i)?.[1] ?? msg;
    if (/quota|rate.?limit/i.test(last)) {
      return "LLM API quota exceeded. Wait about a minute and try again.";
    }
    return last.length > 180 ? `${last.slice(0, 180)}…` : last;
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
