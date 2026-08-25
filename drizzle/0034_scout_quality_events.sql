CREATE TABLE IF NOT EXISTS "scout_quality_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "scout_sessions"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "scout_quality_events_workspace_created_idx"
  ON "scout_quality_events" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "scout_quality_events_tenant_type_idx"
  ON "scout_quality_events" ("tenant_id", "event_type");
