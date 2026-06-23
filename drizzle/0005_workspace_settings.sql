CREATE TABLE IF NOT EXISTS "workspace_settings" (
  "workspace_id" uuid PRIMARY KEY NOT NULL REFERENCES "workspaces"("id"),
  "enrichment_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
