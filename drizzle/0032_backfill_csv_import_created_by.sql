-- Excel import logs one batch audit event (lead.imported) without a per-lead entity_id,
-- so the earlier created_by backfill from lead.created / lead.saved missed csv_import rows.
-- Only fill when a workspace has a single importer uuid, so we do not guess across people.

UPDATE "leads" l
SET "created_by_user_id" = src.actor_id::uuid
FROM (
  SELECT workspace_id, MIN(actor_id) AS actor_id
  FROM "audit_events"
  WHERE action = 'lead.imported'
    AND actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY workspace_id
  HAVING COUNT(DISTINCT actor_id) = 1
) src
WHERE l.workspace_id = src.workspace_id
  AND l.lead_source = 'csv_import'
  AND l.created_by_user_id IS NULL;
