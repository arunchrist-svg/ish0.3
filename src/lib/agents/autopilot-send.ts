import { eq } from "drizzle-orm";
import { db, leads } from "@/db";
import { getAutopilotRun } from "@/lib/agents/autopilot-store";
import { autopilotSendsEmail, parseAutopilotBatchRunId } from "@/lib/agents/autopilot-logic";
import { batchQueueInitialEmails } from "@/lib/outreach/batch-send-initial";
import type { TenantContext } from "@/lib/tenant";

export async function queueAutopilotEmailIfEnabled(params: {
  leadId: string;
  tenantId: string;
  batchId?: string | null;
}): Promise<{ queued: boolean; skippedReason?: string }> {
  const runId = parseAutopilotBatchRunId(params.batchId);
  if (!runId) return { queued: false, skippedReason: "not_autopilot_batch" };

  const run = await getAutopilotRun(runId);
  if (!run || !autopilotSendsEmail(run.input.autoSend)) {
    return { queued: false, skippedReason: "auto_send_off" };
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, params.leadId),
  });
  if (!lead || lead.tenantId !== params.tenantId) {
    return { queued: false, skippedReason: "lead_missing" };
  }

  const userId = run.createdByUserId ?? lead.createdByUserId;
  if (!userId) return { queued: false, skippedReason: "no_actor" };

  const ctx: TenantContext = {
    userId,
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
    role: "owner",
    platformRole: "user",
    isSuperadmin: false,
    onboardingStatus: "complete",
    onboardingStep: 5,
    demoMode: false,
    tenantSlug: "",
    mustChangePassword: false,
  };

  try {
    const result = await batchQueueInitialEmails(ctx, {
      leadIds: [params.leadId],
      batchId: params.batchId ?? undefined,
    });
    if (result.ok < 1) {
      return { queued: false, skippedReason: result.errors[0] ?? "queue_failed" };
    }
    return { queued: true };
  } catch (error) {
    console.error("[autopilot] auto-queue send failed", params.leadId, error);
    return {
      queued: false,
      skippedReason: error instanceof Error ? error.message : "queue_failed",
    };
  }
}
