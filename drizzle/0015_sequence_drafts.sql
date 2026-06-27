-- Sequence draft positions and pre-linked follow-up drafts
ALTER TABLE lead_outreach ADD COLUMN IF NOT EXISTS sequence_position integer;

UPDATE lead_outreach SET sequence_position = 1
WHERE sequence_position IS NULL AND template_variant IS NOT NULL AND template_variant != 'reply';

ALTER TABLE outreach_schedule ADD COLUMN IF NOT EXISTS draft_lead_outreach_id uuid REFERENCES lead_outreach(id);
