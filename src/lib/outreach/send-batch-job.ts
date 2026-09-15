import { desc, sql } from "drizzle-orm";
import { db, auditEvents } from "@/db";
import { logAudit } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";
import { summarizeBatchQueueErrors } from "@/lib/outreach/send-batch-progress";

export const SEND_BATCH_DONE_ACTION = "outreach.batch_queue_done";

export type SendBatchJobResult = {
  batchId: string;
  ok: number;
  failed: number;
  errors: string[];
  done: true;
};

export async function saveSendBatchJobResult(params: {
  ctx: Pick<TenantContext, "tenantId" | "workspaceId" | "userId">;
  batchId: string;
  ok: number;
  failed: number;
  errors: string[];
}): Promise<void> {
  await logAudit({
    tenantId: params.ctx.tenantId,
    workspaceId: params.ctx.workspaceId,
    actorId: params.ctx.userId,
    action: SEND_BATCH_DONE_ACTION,
    entityType: "outreach_batch",
    metadata: {
      batchId: params.batchId,
      ok: params.ok,
      failed: params.failed,
      errors: summarizeBatchQueueErrors(params.errors).slice(0, 12),
    },
  });
}

export async function loadSendBatchJobResult(batchId: string): Promise<SendBatchJobResult | null> {
  if (!batchId) return null;
  const [row] = await db
    .select({ metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(
      sql`${auditEvents.action} = ${SEND_BATCH_DONE_ACTION} and ${auditEvents.metadata}->>'batchId' = ${batchId}`,
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  const meta = row?.metadata;
  if (!meta || typeof meta !== "object") return null;
  const ok = typeof meta.ok === "number" ? meta.ok : 0;
  const failed = typeof meta.failed === "number" ? meta.failed : 0;
  const errors = Array.isArray(meta.errors)
    ? meta.errors.filter((item): item is string => typeof item === "string")
    : [];
  return { batchId, ok, failed, errors, done: true };
}
