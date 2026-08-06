import { generateText } from "ai";
import { startAgentRun, completeAgentRun } from "@/lib/agents/log-agent-run";

import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  ensureGeminiApiKey,
  sanitizeModelId,
} from "@/lib/llm/gemini-env";

type LLMTier = "fast" | "quality";

export type LLMTraceContext = {
  agent: string;
  tenantId: string;
  workspaceId?: string;
  leadId?: string;
  promptVersion?: string;
};

let openRouterClient: ReturnType<typeof createOpenAI> | null = null;
let omlxClient: ReturnType<typeof createOpenAI> | null = null;



function getOmlxBaseUrl(): string {
  const base = process.env.OMLX_BASE_URL ?? "http://127.0.0.1:5200/v1";
  return base.endsWith("/v1") ? base : `${base.replace(/\/$/, "")}/v1`;
}

function getOmlxClient() {
  if (!omlxClient) {
    omlxClient = createOpenAI({
      baseURL: getOmlxBaseUrl(),
      apiKey: process.env.OMLX_API_KEY ?? "none",
    });
  }
  return omlxClient;
}


function normalizeLLMProvider(raw?: string): string {
  return (raw ?? "gemini").trim().toLowerCase();
}

export function getLLMProvider(): string {
  return normalizeLLMProvider(process.env.LLM_PROVIDER);
}

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
  const provider = getLLMProvider();

  if (provider === "anthropic") {
    const haiku = sanitizeModelId(process.env.ANTHROPIC_MODEL_HAIKU, "claude-haiku-4-5");
    const sonnet = sanitizeModelId(process.env.ANTHROPIC_MODEL_SONNET, "claude-sonnet-4-5");
    return tier === "fast" ? anthropic(haiku) : anthropic(sonnet);
  }

  if (provider === "openrouter") {
    const fast = sanitizeModelId(process.env.OPENROUTER_MODEL_FAST, "openai/gpt-4o-mini");
    const quality = sanitizeModelId(process.env.OPENROUTER_MODEL_QUALITY, "openai/gpt-4o");
    const client = getOpenRouterClient();
    return tier === "fast" ? client.chat(fast) : client.chat(quality);
  }

  if (provider === "omlx") {
    const fallback = sanitizeModelId(process.env.OMLX_MODEL, "Llama-3.2-3B-Instruct-4bit");
    const fast = sanitizeModelId(process.env.OMLX_MODEL_FAST, fallback);
    const quality = sanitizeModelId(
      process.env.OMLX_MODEL_QUALITY ?? process.env.OMLX_MODEL_FAST,
      fallback,
    );
    const client = getOmlxClient();
    return tier === "fast" ? client.chat(fast) : client.chat(quality);
  }

  ensureGeminiApiKey();
  const flash = sanitizeModelId(process.env.GEMINI_MODEL_FLASH, "gemini-2.5-flash");
  const flashLite = sanitizeModelId(process.env.GEMINI_MODEL_FLASH_LITE, "gemini-2.5-flash-lite");
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
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|connect ECONNREFUSED|Local LLM server/i.test(msg)) {
    return "Local LLM server is not reachable. Start OMLX and verify OMLX_BASE_URL in .env.local.";
  }
  if (/GenerateContentRequest\.model|unexpected model name format/i.test(msg)) {
    return "Cloud Gemini was called with an invalid model name. Set LLM_PROVIDER=omlx and restart the dev server.";
  }
  if (/Failed to process successful response|\/v1\/responses/i.test(msg)) {
    return "Local LLM response could not be parsed. Ensure OMLX is running and models are loaded.";
  }
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
