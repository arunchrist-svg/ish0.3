-- Platform roles, Google OAuth, team invites, demo mode

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "platform_role" text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "google_id" text UNIQUE,
  ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "demo_mode" boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "org_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "token" text NOT NULL UNIQUE,
  "invited_by" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "org_invites_tenant_idx" ON "org_invites" ("tenant_id");
CREATE INDEX IF NOT EXISTS "org_invites_email_idx" ON "org_invites" ("email");

-- Promote superadmin if user already exists
UPDATE "users"
SET "platform_role" = 'superadmin'
WHERE lower("email") = 'srilaksha.ish@gmail.com';
