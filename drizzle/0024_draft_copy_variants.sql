-- Three subject and three body options per draft; user picks one of each to send
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS subject_c text;
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS email_body_b text;
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS email_body_c text;
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS chosen_subject_key text DEFAULT 'A';
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS chosen_body_key text DEFAULT 'A';
ALTER TABLE outreach_approvals ADD COLUMN IF NOT EXISTS body_used text;
