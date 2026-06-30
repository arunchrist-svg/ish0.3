import { inngest } from "@/inngest/client";
import { runResearcherLite } from "@/lib/agents/researcher-lite";
import { processPendingResearch } from "@/lib/agents/research-processor";
import { runSequencer } from "@/lib/agents/sequencer";
import { runReplyOrchestrator } from "@/lib/agents/reply-orchestrator";

export const replyOrchestratorFunction = inngest.createFunction(
  {
    id: "reply-orchestrator",
    retries: 3,
    idempotency: "event.data.leadId",
  },
  { event: "reply/lead.received" },
  async ({ event, step }) => {
    const result = await step.run("reply-workflow", async () =>
      runReplyOrchestrator({
        leadId: event.data.leadId,
        tenantId: event.data.tenantId,
        workspaceId: event.data.workspaceId,
      }),
    );
    return result;
  },
);


export const researchLeadFunction = inngest.createFunction(
  {
    id: "research-lead",
    retries: 3,
    idempotency: "event.data.leadId",
  },
  { event: "research/lead.requested" },
  async ({ event, step }) => {
    await step.run("research-brief", async () => {
      await runResearcherLite(event.data.leadId);
    });
    return { leadId: event.data.leadId };
  },
);

export const researchBatchFunction = inngest.createFunction(
  { id: "research-batch", retries: 2 },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const result = await step.run("process-pending-research", async () => processPendingResearch(10));
    return result;
  },
);

export const sequencerFunction = inngest.createFunction(
  { id: "sequencer-run", retries: 2 },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    const result = await step.run("run-sequencer", async () => runSequencer());
    return result;
  },
);

export const inngestFunctions = [researchLeadFunction, researchBatchFunction, sequencerFunction, replyOrchestratorFunction];
