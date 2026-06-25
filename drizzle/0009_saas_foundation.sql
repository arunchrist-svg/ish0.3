-- SaaS foundation: users, sessions, org membership, billing, credits, onboarding

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL UNIQUE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "org_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'owner',
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("user_id", "tenant_id")
);

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "onboarding_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "onboarding_step" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;

CREATE TABLE IF NOT EXISTS "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "price_cents" integer NOT NULL,
  "included_credits" integer NOT NULL,
  "seat_limit" integer NOT NULL DEFAULT 2,
  "features" jsonb NOT NULL DEFAULT '{}',
  "stripe_price_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL REFERENCES "plans"("id"),
  "stripe_subscription_id" text,
  "status" text NOT NULL DEFAULT 'trialing',
  "current_period_start" timestamp,
  "current_period_end" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("tenant_id")
);

CREATE TABLE IF NOT EXISTS "credit_balances" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "period_start" timestamp,
  "period_end" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "action" text NOT NULL,
  "reference_id" text,
  "idempotency_key" text UNIQUE,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "credit_transactions_tenant_idx" ON "credit_transactions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token");
CREATE INDEX IF NOT EXISTS "org_members_user_idx" ON "org_members" ("user_id");

INSERT INTO "plans" ("slug", "name", "price_cents", "included_credits", "seat_limit", "features")
VALUES
  ('starter', 'Starter', 9900, 500, 2, '{"enrichmentMode":"free","maxScoutContacts":25,"liveSend":false}'),
  ('growth', 'Growth', 29900, 2500, 5, '{"enrichmentMode":"auto","maxScoutContacts":50,"liveSend":true}'),
  ('scale', 'Scale', 79900, 10000, 15, '{"enrichmentMode":"paid","maxScoutContacts":100,"liveSend":true}')
ON CONFLICT ("slug") DO NOTHING;
