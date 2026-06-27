ALTER TABLE contacts ADD COLUMN IF NOT EXISTS alternate_emails jsonb DEFAULT '[]'::jsonb;
