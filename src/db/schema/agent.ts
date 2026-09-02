import { index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const agentMemory = pgTable("agent_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: varchar("session_id").notNull(),
  contextKey: varchar("context_key").notNull(),
  contextValue: jsonb("context_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sessionContextIdx: uniqueIndex("agent_memory_session_context_idx").on(table.sessionId, table.contextKey),
}));

export const actionLogs = pgTable("action_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentRole: varchar("agent_role").notNull(),
  actionType: varchar("action_type").notNull(),
  payload: jsonb("payload").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("action_logs_created_at_idx").on(table.createdAt),
}));
