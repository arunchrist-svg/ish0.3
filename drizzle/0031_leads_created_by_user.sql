ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "leads_workspace_created_by_idx"
  ON "leads" ("workspace_id", "created_by_user_id");

-- Best-effort backfill from audit events where actor is a real user uuid.
UPDATE "leads" l
SET "created_by_user_id" = ae.actor_id::uuid
FROM (
  SELECT DISTINCT ON (entity_id) entity_id, actor_id
  FROM "audit_events"
  WHERE entity_type = 'lead'
    AND action IN ('lead.created', 'lead.saved')
    AND actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ORDER BY entity_id, created_at ASC
) ae
WHERE l.id = ae.entity_id::uuid
  AND l.created_by_user_id IS NULL;
