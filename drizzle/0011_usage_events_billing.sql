CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "credits_charged" integer NOT NULL DEFAULT 0,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "usage_events_tenant_created_idx" ON "usage_events" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "conversion_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event" text NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "conversion_events_event_idx" ON "conversion_events" ("event", "created_at");

INSERT INTO "plans" ("slug", "name", "price_cents", "included_credits", "seat_limit", "features")
VALUES ('topup_1k', 'Top-up 1,000 credits', 4900, 1000, 0, '{"type":"topup"}'),
       ('topup_5k', 'Top-up 5,000 credits', 19900, 5000, 0, '{"type":"topup"}'),
       ('topup_20k', 'Top-up 20,000 credits', 64900, 20000, 0, '{"type":"topup"}')
ON CONFLICT ("slug") DO NOTHING;
