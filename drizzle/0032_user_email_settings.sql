CREATE TABLE IF NOT EXISTS "user_email_settings" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "user_email_settings_user_idx"
  ON "user_email_settings" ("user_id");
