CREATE TABLE IF NOT EXISTS "autopilot_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "input" jsonb NOT NULL,
  "progress" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "started_at" timestamp,
  "paused_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "autopilot_runs_workspace_status_idx"
  ON "autopilot_runs" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "autopilot_runs_workspace_updated_idx"
  ON "autopilot_runs" ("workspace_id", "updated_at");
