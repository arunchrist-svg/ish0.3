-- India-market pricing: per workspace, below Apollo per-seat rates (INR paise)
UPDATE "plans" SET "price_cents" = 249900, "included_credits" = 500 WHERE "slug" = 'starter';
UPDATE "plans" SET "price_cents" = 599900, "included_credits" = 2500 WHERE "slug" = 'growth';
UPDATE "plans" SET "price_cents" = 1299900, "included_credits" = 8000 WHERE "slug" = 'scale';

UPDATE "plans" SET "price_cents" = 249900 WHERE "slug" = 'topup_1k';
UPDATE "plans" SET "price_cents" = 999900 WHERE "slug" = 'topup_5k';
UPDATE "plans" SET "price_cents" = 3499900 WHERE "slug" = 'topup_20k';
