ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "scale_status" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "scale_source" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "scale_evidence" text;
