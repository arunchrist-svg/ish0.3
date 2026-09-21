import { getAutopilotRun } from "@/lib/agents/autopilot-store";

export type OutboxLeadScope = {
  /** null = whole workspace. Empty array = known run with no leads. */
  leadIds: string[] | null;
};

export async function resolveOutboxLeadScope(
  ctx: { tenantId: string; workspaceId: string },
  runId?: string | null,
): Promise<OutboxLeadScope> {
  const id = runId?.trim();
  if (!id) return { leadIds: null };
  const run = await getAutopilotRun(id);
  if (!run || run.tenantId !== ctx.tenantId || run.workspaceId !== ctx.workspaceId) {
    return { leadIds: [] };
  }
  return { leadIds: [...new Set(run.progress.leadIds ?? [])] };
}
