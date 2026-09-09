import { inngest } from "@/inngest/client";
import { processPendingResearch, triggerPendingResearchAsync } from "@/lib/agents/research-processor";
import { writerJobConcurrency } from "@/lib/jobs/writer-concurrency";

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

export async function enqueueWriterRun(params: {
  leadId: string;
  tenantId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
  batchId?: string;
}): Promise<"queued" | "sync"> {
  const data = { ...params, batchId: params.batchId ?? crypto.randomUUID() };
  if (inngestJobsEnabled()) {
    await inngest.send({ name: "writer/lead.requested", data });
    return "queued";
  }
  void runWriterSafe(data);
  return "sync";
}

const WRITER_ENQUEUE_CHUNK = 100;
const WRITER_SYNC_CONCURRENCY = writerJobConcurrency();

/**
 * Enqueue sequence writes for many leads (thousands-safe).
 * Chunks Inngest sends; without Inngest, runs a capped background pool.
 */
export async function enqueueWriterForLeads(params: {
  leadIds: string[];
  tenantId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
  batchId?: string;
}): Promise<"queued" | "sync"> {
  const uniqueIds = [...new Set(params.leadIds.filter(Boolean))];
  if (!uniqueIds.length) return inngestJobsEnabled() ? "queued" : "sync";

  const batchId = params.batchId ?? crypto.randomUUID();
  const mode = params.mode ?? "sequence";

  if (inngestJobsEnabled()) {
    for (let i = 0; i < uniqueIds.length; i += WRITER_ENQUEUE_CHUNK) {
      const chunk = uniqueIds.slice(i, i + WRITER_ENQUEUE_CHUNK);
      await inngest.send(
        chunk.map((leadId) => ({
          name: "writer/lead.requested" as const,
          data: {
            leadId,
            tenantId: params.tenantId,
            mode,
            outreachTemplate: params.outreachTemplate,
            writerMode: params.writerMode,
            occasionTheme: params.occasionTheme,
            batchId,
          },
        })),
      );
    }
    return "queued";
  }

  void runWriterPool(uniqueIds, {
    tenantId: params.tenantId,
    mode,
    outreachTemplate: params.outreachTemplate,
    writerMode: params.writerMode,
    occasionTheme: params.occasionTheme,
    batchId,
  });
  return "sync";
}

async function runWriterPool(
  leadIds: string[],
  opts: {
    tenantId: string;
    mode: "single" | "sequence";
    outreachTemplate?: string;
    writerMode?: string;
    occasionTheme?: string | null;
    batchId: string;
  },
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < leadIds.length) {
      const leadId = leadIds[cursor++];
      await runWriterSafe({
        leadId,
        mode: opts.mode,
        outreachTemplate: opts.outreachTemplate,
        writerMode: opts.writerMode,
        occasionTheme: opts.occasionTheme,
        tenantId: opts.tenantId,
        batchId: opts.batchId,
      });
    }
  }
  const workers = Array.from(
    { length: Math.min(WRITER_SYNC_CONCURRENCY, leadIds.length) },
    () => worker(),
  );
  await Promise.all(workers);
}

async function runWriterSafe(params: {
  leadId: string;
  tenantId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
  batchId?: string;
}): Promise<void> {
  try {
    const { writeOutreachForJob } = await import("@/lib/agents/writer-job");
    await writeOutreachForJob(params);
  } catch (e) {
    console.error("[enqueue] writer failed for", params.leadId, e);
  }
}

export async function enqueueEnrichLead(params: {
  leadId: string;
  tenantId: string;
  mode: "free" | "paid";
  dataMode?: string;
  refetch?: boolean;
}): Promise<"queued" | "sync"> {
  if (inngestJobsEnabled()) {
    await inngest.send({ name: "enrich/lead.requested", data: params });
    return "queued";
  }
  void runEnrichSafe(params);
  return "sync";
}

async function runEnrichSafe(params: {
  leadId: string;
  mode: "free" | "paid";
  dataMode?: string;
  refetch?: boolean;
}): Promise<void> {
  try {
    const { enrichLeadById } = await import("@/lib/enrichment/enrich-lead");
    await enrichLeadById({
      leadId: params.leadId,
      mode: params.mode,
      dataMode: params.dataMode as never,
      refetch: params.refetch,
    });
  } catch (e) {
    console.error("[enqueue] enrich failed for", params.leadId, e);
  }
}
