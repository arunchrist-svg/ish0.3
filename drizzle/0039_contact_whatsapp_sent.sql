ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_opened_at timestamp;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamp;
