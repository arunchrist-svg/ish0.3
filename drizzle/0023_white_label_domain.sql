-- White-label domain rename: gift* → fit / outreach / buying
ALTER TABLE campaigns RENAME COLUMN gifting_context TO buying_context;
ALTER TABLE accounts RENAME COLUMN gift_score TO fit_score;
ALTER TABLE accounts RENAME COLUMN gift_budget TO budget_band;
ALTER TABLE lead_research RENAME COLUMN gifting_hook TO outreach_hook;
