import { inngest } from "@/inngest/client";
import { writerJobConcurrency } from "@/lib/jobs/writer-concurrency";
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
  // Every 15 minutes so morning/evening send windows are always hit.
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const result = await step.run("run-sequencer", async () => runSequencer());
    return result;
  },
);

export const writerLeadFunction = inngest.createFunction(
  {
    id: "writer-lead",
    retries: 2,
    concurrency: [{ limit: writerJobConcurrency(), key: "event.data.tenantId" }],
    // batchId lets Rewrite All re-run the same lead; omit falls back to leadId only.
    idempotency: "event.data.batchId + '-' + event.data.leadId",
  },
  { event: "writer/lead.requested" },
  async ({ event, step }) => {
    const result = await step.run("write-outreach", async () => {
      const { writeOutreachForJob } = await import("@/lib/agents/writer-job");
      return writeOutreachForJob({
        leadId: event.data.leadId,
        tenantId: event.data.tenantId,
        mode: event.data.mode,
        outreachTemplate: event.data.outreachTemplate,
        writerMode: event.data.writerMode,
        occasionTheme: event.data.occasionTheme,
        batchId: event.data.batchId,
      });
    });
    return { leadId: event.data.leadId, ...result };
  },
);

export const enrichLeadFunction = inngest.createFunction(
  {
    id: "enrich-lead",
    retries: 2,
    concurrency: [{ limit: 4, key: "event.data.tenantId" }],
  },
  { event: "enrich/lead.requested" },
  async ({ event, step }) => {
    const { enrichLeadById } = await import("@/lib/enrichment/enrich-lead");
    const result = await step.run("enrich", async () =>
      enrichLeadById({
        leadId: event.data.leadId,
        mode: event.data.mode,
        dataMode: event.data.dataMode,
        refetch: event.data.refetch,
      }),
    );
    return { leadId: event.data.leadId, result };
  },
);

export const scoutQualityLearnFunction = inngest.createFunction(
  { id: "scout-quality-learn", retries: 1 },
  { cron: "0 4 * * 1" },
  async ({ step }) => {
    const { db, workspaces } = await import("@/db");
    const rows = await step.run("list-workspaces", async () =>
      db.select({ id: workspaces.id, tenantId: workspaces.tenantId }).from(workspaces),
    );
    let refreshed = 0;
    for (const row of rows) {
      const result = await step.run(`learn-${row.id}`, async () => {
        const { refreshScoutQualityLearning } = await import("@/lib/enrichment/quality-learning");
        return refreshScoutQualityLearning({ tenantId: row.tenantId, workspaceId: row.id });
      });
      if (result) refreshed += 1;
    }
    return { workspaces: rows.length, refreshed };
  },
);

export const inngestFunctions = [
  researchLeadFunction,
  researchBatchFunction,
  sequencerFunction,
  replyOrchestratorFunction,
  writerLeadFunction,
  enrichLeadFunction,
  scoutQualityLearnFunction,
];
