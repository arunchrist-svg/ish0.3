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

export const writerLeadFunction = inngest.createFunction(
  {
    id: "writer-lead",
    retries: 2,
    concurrency: [{ limit: 3, key: "event.data.tenantId" }],
  },
  { event: "writer/lead.requested" },
  async ({ event, step }) => {
    const { runWriter } = await import("@/lib/agents/writer");
    const { runWriterSequence } = await import("@/lib/agents/writer-sequence");
    const result = await step.run("write-outreach", async () => {
      if (event.data.mode === "single") {
        const outreachId = await runWriter(event.data.leadId, {
          outreachTemplate: event.data.outreachTemplate,
          writerMode: event.data.writerMode,
          occasionTheme: event.data.occasionTheme,
        });
        return { outreachIds: [outreachId] };
      }
      const ids = await runWriterSequence(event.data.leadId, {
        outreachTemplate: event.data.outreachTemplate,
        writerMode: event.data.writerMode,
        occasionTheme: event.data.occasionTheme,
      });
      return { outreachIds: ids };
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

export const inngestFunctions = [
  researchLeadFunction,
  researchBatchFunction,
  sequencerFunction,
  replyOrchestratorFunction,
  writerLeadFunction,
  enrichLeadFunction,
];
