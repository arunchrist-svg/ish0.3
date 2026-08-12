ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "bounced_at" timestamp;
ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "bounce_type" text;
ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "bounce_reason" text;
ALTER TABLE "outreach_schedule" ADD COLUMN IF NOT EXISTS "recipient_email" text;
