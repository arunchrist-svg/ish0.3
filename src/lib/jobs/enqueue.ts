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

export async function enqueueWriterRun(params: {
  leadId: string;
  tenantId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
}): Promise<"queued" | "sync"> {
  if (inngestJobsEnabled()) {
    await inngest.send({ name: "writer/lead.requested", data: params });
    return "queued";
  }
  void runWriterSafe(params);
  return "sync";
}

async function runWriterSafe(params: {
  leadId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
}): Promise<void> {
  try {
    if (params.mode === "single") {
      const { runWriter } = await import("@/lib/agents/writer");
      await runWriter(params.leadId, {
        outreachTemplate: params.outreachTemplate as never,
        writerMode: params.writerMode as never,
        occasionTheme: params.occasionTheme,
      });
      return;
    }
    const { runWriterSequence } = await import("@/lib/agents/writer-sequence");
    await runWriterSequence(params.leadId, {
      outreachTemplate: params.outreachTemplate as never,
      writerMode: params.writerMode as never,
      occasionTheme: params.occasionTheme,
    });
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
