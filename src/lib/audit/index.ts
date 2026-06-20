import { db, auditEvents } from "@/db";

export async function logAudit(params: {
  tenantId?: string;
  workspaceId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditEvents).values({
      tenantId: params.tenantId ?? null,
      workspaceId: params.workspaceId ?? null,
      actorId: params.actorId ?? "cm",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // audit logging must never crash the caller
    console.error("[audit] failed to write audit event", params.action, params.entityType);
  }
}
