-- Subscription plans priced in INR (paise)
UPDATE "plans" SET "price_cents" = 799900 WHERE "slug" = 'starter';
UPDATE "plans" SET "price_cents" = 2499900 WHERE "slug" = 'growth';
UPDATE "plans" SET "price_cents" = 6499900 WHERE "slug" = 'scale';

-- Top-up packs priced in INR (paise)
UPDATE "plans" SET "price_cents" = 399900 WHERE "slug" = 'topup_1k';
UPDATE "plans" SET "price_cents" = 1649900 WHERE "slug" = 'topup_5k';
UPDATE "plans" SET "price_cents" = 5399900 WHERE "slug" = 'topup_20k';
