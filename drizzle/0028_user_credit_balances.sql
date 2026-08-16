-- Org pool stays on credit_balances. Per-user slices live here.
CREATE TABLE IF NOT EXISTS "user_credit_balances" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "remaining" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_credit_balances_pk"
  ON "user_credit_balances" ("tenant_id", "user_id");

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "usage_events"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
