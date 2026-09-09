ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp;
ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "last_error" text;

CREATE INDEX IF NOT EXISTS "outreach_schedule_status_scheduled_for_idx"
  ON "outreach_schedule" ("status", "scheduled_for");
