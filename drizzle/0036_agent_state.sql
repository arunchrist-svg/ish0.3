CREATE TABLE IF NOT EXISTS "agent_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar NOT NULL,
  "context_key" varchar NOT NULL,
  "context_value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "action_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_role" varchar NOT NULL,
  "action_type" varchar NOT NULL,
  "payload" jsonb NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_memory_session_context_idx"
  ON "agent_memory" ("session_id", "context_key");

CREATE INDEX IF NOT EXISTS "action_logs_created_at_idx"
  ON "action_logs" ("created_at");
