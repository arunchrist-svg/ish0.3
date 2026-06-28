-- Allow lead_outreach deletes during sequence regeneration without FK violations.

ALTER TABLE outreach_edit_messages
  DROP CONSTRAINT IF EXISTS outreach_edit_messages_lead_outreach_id_fkey;
ALTER TABLE outreach_edit_messages
  ADD CONSTRAINT outreach_edit_messages_lead_outreach_id_fkey
  FOREIGN KEY (lead_outreach_id) REFERENCES lead_outreach(id) ON DELETE CASCADE;

ALTER TABLE outreach_approvals
  DROP CONSTRAINT IF EXISTS outreach_approvals_lead_outreach_id_fkey;
ALTER TABLE outreach_approvals
  ADD CONSTRAINT outreach_approvals_lead_outreach_id_fkey
  FOREIGN KEY (lead_outreach_id) REFERENCES lead_outreach(id) ON DELETE CASCADE;

ALTER TABLE outreach_schedule
  DROP CONSTRAINT IF EXISTS outreach_schedule_approval_id_fkey;
ALTER TABLE outreach_schedule
  ADD CONSTRAINT outreach_schedule_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES outreach_approvals(id) ON DELETE SET NULL;

ALTER TABLE outreach_schedule
  DROP CONSTRAINT IF EXISTS outreach_schedule_draft_lead_outreach_id_fkey;
ALTER TABLE outreach_schedule
  ADD CONSTRAINT outreach_schedule_draft_lead_outreach_id_fkey
  FOREIGN KEY (draft_lead_outreach_id) REFERENCES lead_outreach(id) ON DELETE SET NULL;
