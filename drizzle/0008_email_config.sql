ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "email_config" jsonb NOT NULL DEFAULT '{}';
