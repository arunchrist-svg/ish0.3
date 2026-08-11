-- LinkedIn profile URL on Settings users; link imported networks to those users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin" text;

ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "team_members_user_id_idx" ON "team_members" ("user_id");

UPDATE team_members tm
SET user_id = u.id
FROM users u
WHERE tm.user_id IS NULL
  AND tm.email IS NOT NULL
  AND lower(trim(tm.email)) = lower(trim(u.email))
  AND NOT EXISTS (
    SELECT 1 FROM team_members tm2 WHERE tm2.user_id = u.id
  );
