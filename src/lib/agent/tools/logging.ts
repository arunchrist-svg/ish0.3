import { recordAgentAction } from "@/lib/agent/memory";
import type { AgentToolContext } from "./types";

export async function logToolAction(params: {
  context: AgentToolContext;
  actionType: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
}): Promise<void> {
  try {
    await recordAgentAction({
      ctx: params.context.ctx,
      sessionId: params.context.sessionId,
      agentRole: "supervisor",
      actionType: params.actionType,
      payload: params.payload,
      result: params.result,
    });
  } catch (error) {
    console.warn("[agent] action log failed", error instanceof Error ? error.message : error);
  }
}
