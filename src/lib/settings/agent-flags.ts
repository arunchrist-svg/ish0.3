import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";

export type AgentFlags = {
  replyAutoDraft?: boolean;
  notifyWhatsApp?: boolean;
  whatsAppFirst?: boolean;
  searchExactMode?: boolean;
  llmTierOverride?: "fast" | "quality";
  notifyEmail?: boolean;
  notifyInApp?: boolean;
  searchConfidenceThreshold?: number;
  /** Workspace kill switch for Autopilot scout + write. Send still uses Outbox pause. */
  autopilotEnabled?: boolean;
};

const DEFAULT_FLAGS: AgentFlags = {
  replyAutoDraft: true,
  notifyWhatsApp: true,
  searchExactMode: true,
  notifyEmail: true,
  notifyInApp: true,
  searchConfidenceThreshold: 0.85,
  autopilotEnabled: true,
};

export async function getAgentFlags(workspaceId: string): Promise<AgentFlags> {
  const row = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId),
  });
  const cfg = (row?.enrichmentConfig ?? {}) as { agentFlags?: AgentFlags };
  return { ...DEFAULT_FLAGS, ...cfg.agentFlags };
}

export function isAutopilotEnabled(flags: AgentFlags): boolean {
  return flags.autopilotEnabled !== false;
}

export async function setAutopilotEnabled(workspaceId: string, enabled: boolean): Promise<AgentFlags> {
  const row = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId),
  });
  const existing = (row?.enrichmentConfig ?? {}) as Record<string, unknown>;
  const existingFlags = (existing.agentFlags ?? {}) as AgentFlags;
  const nextFlags: AgentFlags = { ...existingFlags, autopilotEnabled: enabled };
  const merged = { ...existing, agentFlags: nextFlags };

  await db
    .insert(workspaceSettings)
    .values({ workspaceId, enrichmentConfig: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { enrichmentConfig: merged, updatedAt: new Date() },
    });

  return { ...DEFAULT_FLAGS, ...nextFlags };
}
