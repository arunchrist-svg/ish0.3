-- RBAC: tenant slugs, session tenant scope, member status, password change flag
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "slug" text;

UPDATE "tenants"
SET "slug" = lower(regexp_replace(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
|| '-' || substr(replace(id::text, '-', ''), 1, 6)
WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_unique" ON "tenants" ("slug");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;

ALTER TABLE "org_members" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL;

ALTER TABLE "org_invites" ADD COLUMN IF NOT EXISTS "invited_by_superadmin" boolean NOT NULL DEFAULT false;
