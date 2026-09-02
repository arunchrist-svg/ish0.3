import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { callLLM, friendlyLLMError } from "@/lib/llm";
import { completeAgentRun, startAgentRun } from "@/lib/agents/log-agent-run";
import {
  appendAgentConversation,
  loadAgentMemory,
  memoryConversation,
  recordAgentAction,
  type AgentJsonObject,
} from "@/lib/agent/memory";
import { createAgentTools, type AgentTools } from "@/lib/agent/tools";
import type { TenantContext } from "@/lib/tenant";

export const MAX_AGENT_ITERATIONS = 5;

const workerInput = z.object({
  task: z.string().trim().min(1).max(4000).describe("The read-only reasoning task for the worker"),
});

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; toolName: string; input: unknown }
  | { type: "tool-complete"; toolName: string; output: unknown }
  | { type: "tool-error"; toolName: string; message: string }
  | { type: "text-delta"; text: string }
  | { type: "complete"; iterations: number }
  | { type: "error"; message: string };

type OrchestrationParams = {
  ctx: TenantContext;
  sessionId: string;
  prompt: string;
  leadId?: string;
  signal?: AbortSignal;
};

function supervisorModel() {
  const anthropic = createAnthropic();
  return anthropic(process.env.ANTHROPIC_MODEL_SONNET?.trim() || "claude-sonnet-4-6");
}

function safeMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Unknown tool error";
  }
}

function jsonObject(value: unknown): AgentJsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AgentJsonObject;
  }
  return { value };
}

function buildSupervisorSystem(params: {
  memory: ReturnType<typeof memoryConversation>;
  leadId?: string;
}): string {
  const history = params.memory
    .slice(-12)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
  const leadContext = params.leadId
    ? `The UI supplied this lead ID. Use it when the user refers to "this lead": ${params.leadId}`
    : "No lead ID was supplied by the UI. Ask for a lead ID before using a lead tool.";

  return `You are the Supervisor for a CRM sales operations assistant.

Your job is to understand the user's request, choose the smallest safe action, and use the provided tools when a CRM change is requested.
${leadContext}

Rules:
- Never invent a lead, status, enrichment result, or cadence result.
- Never claim an action succeeded before its tool returns successfully.
- Ask a concise clarification when a required lead ID or closing amount is missing.
- Use one CRM mutation at a time and re-evaluate the tool result before taking another action.
- Delegate only read-only analysis to the Worker. The Worker cannot mutate CRM data.
- Do not send email, change credentials, bypass permissions, or expose private tenant data.
- When the task is complete, provide a concise outcome and any next step.

Recent session context:
${history || "No previous context."}`;
}

export async function* runAgent(
  params: OrchestrationParams,
): AsyncGenerator<AgentStreamEvent> {
  const memory = await loadAgentMemory(params.ctx, params.sessionId);
  const conversation = memoryConversation(memory);
  await appendAgentConversation(params.ctx, params.sessionId, [
    { role: "user", content: params.prompt, at: new Date().toISOString() },
  ]);
  yield { type: "status", message: "Supervisor is planning the next safe action..." };

  const context = { ctx: params.ctx, sessionId: params.sessionId };
  const crmTools = createAgentTools(context);
  const supervisorRunId = await startAgentRun({
    tenantId: params.ctx.tenantId,
    workspaceId: params.ctx.workspaceId,
    agent: "agent-supervisor",
    promptVersion: "agent-supervisor.v1",
    tier: "quality",
  });
  const tools = {
    ...crmTools,
    delegateToWorker: tool({
      description:
        "Ask a read-only Worker model to analyze CRM context or explain a recommendation. It cannot change records.",
      inputSchema: workerInput,
      execute: async ({ task }) => {
        const result = await callLLM({
          provider: "anthropic",
          exclusiveProvider: true,
          tier: "fast",
          system:
            "You are a read-only CRM operations worker. Analyze the supplied task without inventing facts. Do not propose hidden actions or claim that any database mutation occurred.",
          prompt: `${task}\n\nSession context:\n${conversation
            .slice(-8)
            .map((entry) => `${entry.role}: ${entry.content}`)
            .join("\n")}`,
          maxTokens: 700,
          trace: {
            agent: "agent-worker",
            tenantId: params.ctx.tenantId,
            workspaceId: params.ctx.workspaceId,
          },
        });
        const output = { ok: true, analysis: result };
        await recordAgentAction({
          ctx: params.ctx,
          sessionId: params.sessionId,
          agentRole: "worker",
          actionType: "delegateToWorker",
          payload: { task },
          result: output,
        });
        return output;
      },
    }),
  };

  let iterations = 0;
  let assistantText = "";
  const result = streamText({
    model: supervisorModel(),
    system: buildSupervisorSystem({ memory: conversation, leadId: params.leadId }),
    prompt: params.prompt,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_ITERATIONS),
    maxOutputTokens: 1200,
    maxRetries: 1,
    abortSignal: params.signal,
  });

  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        assistantText += part.text;
        yield { type: "text-delta", text: part.text };
      } else if (part.type === "tool-call") {
        iterations += 1;
        yield { type: "tool-start", toolName: part.toolName, input: part.input };
      } else if (part.type === "tool-result") {
        await recordAgentAction({
          ctx: params.ctx,
          sessionId: params.sessionId,
          agentRole: "supervisor",
          actionType: part.toolName,
          payload: jsonObject(part.input),
          result: jsonObject(part.output),
        });
        yield { type: "tool-complete", toolName: part.toolName, output: part.output };
      } else if (part.type === "tool-error") {
        const message = safeMessage(part.error);
        await recordAgentAction({
          ctx: params.ctx,
          sessionId: params.sessionId,
          agentRole: "supervisor",
          actionType: part.toolName,
          payload: jsonObject(part.input),
          result: { ok: false, error: message },
        });
        yield { type: "tool-error", toolName: part.toolName, message };
      } else if (part.type === "error") {
        yield { type: "error", message: friendlyLLMError(part.error) };
      }
    }

    const steps = await result.steps;
    const resolvedIterations = Math.max(iterations, steps.length);
    if (!assistantText.trim()) {
      assistantText = resolvedIterations >= MAX_AGENT_ITERATIONS
        ? "The agent reached its five-step safety limit. Review the latest result and try again if needed."
        : "The requested CRM operation completed.";
      yield { type: "text-delta", text: assistantText };
    }

    const usage = await result.totalUsage;
    await completeAgentRun(supervisorRunId, {
      status: "completed",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      model: (await result.response).modelId,
      tier: "quality",
    });
    await appendAgentConversation(params.ctx, params.sessionId, [
      { role: "assistant", content: assistantText, at: new Date().toISOString() },
    ]);
    yield { type: "complete", iterations: resolvedIterations };
  } catch (error) {
    await completeAgentRun(supervisorRunId, {
      status: "failed",
      tier: "quality",
      error: error instanceof Error ? error.message : String(error),
    }).catch((completionError) => {
      console.warn("[agent] supervisor run completion failed", completionError);
    });
    yield { type: "error", message: friendlyLLMError(error) };
  }
}

export type { AgentTools };
