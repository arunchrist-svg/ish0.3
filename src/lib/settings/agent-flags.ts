import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";

export type AgentFlags = {
  replyAutoDraft?: boolean;
  notifyWhatsApp?: boolean;
  searchExactMode?: boolean;
  llmTierOverride?: "fast" | "quality";
  notifyEmail?: boolean;
  notifyInApp?: boolean;
  searchConfidenceThreshold?: number;
};

const DEFAULT_FLAGS: AgentFlags = {
  replyAutoDraft: true,
  notifyWhatsApp: false,
  searchExactMode: true,
  notifyEmail: true,
  notifyInApp: true,
  searchConfidenceThreshold: 0.85,
};

export async function getAgentFlags(workspaceId: string): Promise<AgentFlags> {
  const row = await db.query.workspaceSettings.findFirst({
    where: eq(workspaceSettings.workspaceId, workspaceId),
  });
  const cfg = (row?.enrichmentConfig ?? {}) as { agentFlags?: AgentFlags };
  return { ...DEFAULT_FLAGS, ...cfg.agentFlags };
}
