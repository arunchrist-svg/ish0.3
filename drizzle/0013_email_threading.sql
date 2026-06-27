-- Email threading: RFC Message-IDs and thread metadata
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_message_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS thread_root_message_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS thread_root_subject text;

ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS rfc_message_id text;
ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS references_chain text;
ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS email_kind text;
ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS subject_sent text;
