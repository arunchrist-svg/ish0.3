import type { TenantContext } from "@/lib/tenant";

export type AgentToolContext = {
  ctx: TenantContext;
  sessionId: string;
};
