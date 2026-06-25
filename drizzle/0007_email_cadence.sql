-- Migration: email cadence tracking
-- Adds open tracking, tracking tokens, reply content storage, and cancelled status support

ALTER TABLE "outreach_schedule"
  ADD COLUMN IF NOT EXISTS "opened_at" timestamp,
  ADD COLUMN IF NOT EXISTS "tracking_token" text;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "last_reply_content" text;
