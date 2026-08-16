ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "user_preference_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
