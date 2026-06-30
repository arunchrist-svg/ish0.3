CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" uuid REFERENCES "workspaces"("id"),
  "agent" text NOT NULL,
  "lead_id" uuid REFERENCES "leads"("id"),
  "status" text DEFAULT 'running' NOT NULL,
  "tier" text,
  "model" text,
  "prompt_version" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "latency_ms" integer,
  "error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
