CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "name" text NOT NULL,
  "email" text,
  "linkedin_sub" text NOT NULL UNIQUE,
  "linkedin_url" text,
  "linkedin_picture" text,
  "last_import_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "linkedin_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "team_members"("id") ON DELETE CASCADE,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "linkedin_url" text NOT NULL,
  "email" text,
  "company" text,
  "position" text,
  "connected_on" timestamp,
  "import_batch_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_connections_member_url_idx"
  ON "linkedin_connections" ("member_id", "linkedin_url");

CREATE TABLE IF NOT EXISTS "connection_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL REFERENCES "linkedin_connections"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "match_method" text NOT NULL,
  "confidence" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "connection_matches_conn_contact_idx"
  ON "connection_matches" ("connection_id", "contact_id");
