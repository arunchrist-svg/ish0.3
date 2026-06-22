ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "company_overview" jsonb;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "overview_enriched_at" timestamp;
