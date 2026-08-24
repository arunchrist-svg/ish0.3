CREATE TABLE IF NOT EXISTS "scout_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "mode" text NOT NULL DEFAULT 'autopilot',
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "companies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "people" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ui_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "company_count" integer NOT NULL DEFAULT 0,
  "people_count" integer NOT NULL DEFAULT 0,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "scout_sessions_workspace_updated_idx"
  ON "scout_sessions" ("workspace_id", "updated_at");

CREATE INDEX IF NOT EXISTS "scout_sessions_tenant_workspace_idx"
  ON "scout_sessions" ("tenant_id", "workspace_id");
