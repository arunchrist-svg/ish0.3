import { eq } from "drizzle-orm";
import { actionLogs, agentMemory, db } from "@/db";
import type { TenantContext } from "@/lib/tenant";

const CONVERSATION_KEY = "conversation";
const MAX_CONVERSATION_ENTRIES = 24;

export type AgentJsonObject = Record<string, unknown>;

export type AgentConversationEntry = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  at: string;
};

function scopedSessionId(ctx: Pick<TenantContext, "tenantId">, sessionId: string): string {
  return `${ctx.tenantId}:${sessionId}`;
}

export async function loadAgentMemory(
  ctx: Pick<TenantContext, "tenantId">,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({
      contextKey: agentMemory.contextKey,
      contextValue: agentMemory.contextValue,
    })
    .from(agentMemory)
    .where(eq(agentMemory.sessionId, scopedSessionId(ctx, sessionId)));

  return Object.fromEntries(rows.map((row) => [row.contextKey, row.contextValue]));
}

export async function saveAgentMemory(
  ctx: Pick<TenantContext, "tenantId">,
  sessionId: string,
  contextKey: string,
  contextValue: unknown,
): Promise<void> {
  await db
    .insert(agentMemory)
    .values({
      sessionId: scopedSessionId(ctx, sessionId),
      contextKey,
      contextValue,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [agentMemory.sessionId, agentMemory.contextKey],
      set: {
        contextValue,
        updatedAt: new Date(),
      },
    });
}

export async function appendAgentConversation(
  ctx: Pick<TenantContext, "tenantId">,
  sessionId: string,
  entries: AgentConversationEntry[],
): Promise<void> {
  const memory = await loadAgentMemory(ctx, sessionId);
  const existing = memory[CONVERSATION_KEY];
  const conversation: AgentConversationEntry[] =
    typeof existing === "object" &&
    existing !== null &&
    "entries" in existing &&
    Array.isArray(existing.entries)
      ? existing.entries.filter(isConversationEntry)
      : [];

  await saveAgentMemory(ctx, sessionId, CONVERSATION_KEY, {
    entries: [...conversation, ...entries].slice(-MAX_CONVERSATION_ENTRIES),
  });
}

export async function recordAgentAction(params: {
  ctx: Pick<TenantContext, "tenantId" | "workspaceId" | "userId">;
  sessionId: string;
  agentRole: string;
  actionType: string;
  payload: AgentJsonObject;
  result: AgentJsonObject;
}): Promise<void> {
  await db.insert(actionLogs).values({
    agentRole: params.agentRole,
    actionType: params.actionType,
    payload: {
      ...params.payload,
      sessionId: params.sessionId,
      tenantId: params.ctx.tenantId,
      workspaceId: params.ctx.workspaceId,
      userId: params.ctx.userId,
    },
    result: params.result,
  });
}

function isConversationEntry(value: unknown): value is AgentConversationEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentConversationEntry>;
  return (
    (candidate.role === "user" ||
      candidate.role === "assistant" ||
      candidate.role === "tool" ||
      candidate.role === "system") &&
    typeof candidate.content === "string" &&
    typeof candidate.at === "string"
  );
}

export function memoryConversation(memory: Record<string, unknown>): AgentConversationEntry[] {
  const value = memory[CONVERSATION_KEY];
  if (!value || typeof value !== "object" || !("entries" in value) || !Array.isArray(value.entries)) {
    return [];
  }
  return value.entries.filter(isConversationEntry);
}
