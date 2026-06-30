import { db, agentRuns } from "@/db";
import { eq } from "drizzle-orm";

export type AgentRunTrace = {
  tenantId: string;
  workspaceId?: string;
  agent: string;
  leadId?: string;
  promptVersion?: string;
  tier?: string;
  model?: string;
};

export async function startAgentRun(trace: AgentRunTrace): Promise<string> {
  const [row] = await db
    .insert(agentRuns)
    .values({
      tenantId: trace.tenantId,
      workspaceId: trace.workspaceId ?? null,
      agent: trace.agent,
      leadId: trace.leadId ?? null,
      promptVersion: trace.promptVersion ?? null,
      tier: trace.tier ?? null,
      model: trace.model ?? null,
      status: "running",
    })
    .returning({ id: agentRuns.id });

  return row.id;
}

export async function completeAgentRun(
  runId: string,
  result: {
    status: "completed" | "failed";
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    model?: string;
    tier?: string;
    error?: string;
  },
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: result.status,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      latencyMs: result.latencyMs ?? null,
      model: result.model ?? null,
      tier: result.tier ?? null,
      error: result.error ?? null,
      completedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId));
}
