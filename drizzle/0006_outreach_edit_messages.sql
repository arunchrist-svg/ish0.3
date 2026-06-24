CREATE TABLE IF NOT EXISTS "outreach_edit_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_outreach_id" uuid NOT NULL REFERENCES "lead_outreach"("id"),
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outreach_edit_messages_lead_outreach_id_idx"
  ON "outreach_edit_messages" ("lead_outreach_id");
