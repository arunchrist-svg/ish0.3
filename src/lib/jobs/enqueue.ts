import { inngest } from "@/inngest/client";
import { processPendingResearch, triggerPendingResearchAsync } from "@/lib/agents/research-processor";

export function inngestJobsEnabled(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY?.trim());
}

export async function enqueueResearchForLead(leadId: string): Promise<void> {
  if (inngestJobsEnabled()) {
    await inngest.send({ name: "research/lead.requested", data: { leadId } });
    return;
  }
  void runResearcherLiteSafe(leadId);
}

export async function enqueueResearchForLeads(leadIds: string[]): Promise<void> {
  if (!leadIds.length) return;

  if (inngestJobsEnabled()) {
    await inngest.send(
      leadIds.map((leadId) => ({ name: "research/lead.requested", data: { leadId } })),
    );
    return;
  }

  triggerPendingResearchAsync(Math.min(leadIds.length, 5));
}

export async function runResearchBatchNow(limit = 10) {
  return processPendingResearch(limit);
}

async function runResearcherLiteSafe(leadId: string): Promise<void> {
  try {
    const { runResearcherLite } = await import("@/lib/agents/researcher-lite");
    await runResearcherLite(leadId);
  } catch (e) {
    console.error("[enqueue] researcher failed for", leadId, e);
  }
}

export async function enqueueReplyOrchestrator(params: {
  leadId: string;
  tenantId: string;
  workspaceId: string;
}): Promise<void> {
  if (inngestJobsEnabled()) {
    await inngest.send({
      name: "reply/lead.received",
      data: params,
    });
    return;
  }
  void runReplyOrchestratorSafe(params);
}

async function runReplyOrchestratorSafe(params: {
  leadId: string;
  tenantId: string;
  workspaceId: string;
}): Promise<void> {
  try {
    const { runReplyOrchestrator } = await import("@/lib/agents/reply-orchestrator");
    await runReplyOrchestrator(params);
  } catch (e) {
    console.error("[enqueue] reply orchestrator failed for", params.leadId, e);
  }
}
