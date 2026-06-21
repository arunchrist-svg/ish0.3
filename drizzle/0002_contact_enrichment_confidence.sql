ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_confidence" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "enrichment_source" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "enrichment_provider" text;
