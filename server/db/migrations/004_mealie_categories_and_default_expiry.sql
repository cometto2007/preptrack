-- Replace legacy hardcoded meal categories with Mealie-derived category fields.

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS mealie_category_name TEXT,
  ADD COLUMN IF NOT EXISTS mealie_category_slug TEXT;

-- Legacy column from phase 1/2; remove once new columns exist.
ALTER TABLE meals
  DROP CONSTRAINT IF EXISTS meals_category_check;

ALTER TABLE meals
  DROP COLUMN IF EXISTS category;

-- Single freezer default expiry (days).
INSERT INTO settings (key, value)
VALUES ('default_expiry_days', '90')
ON CONFLICT (key) DO NOTHING;

-- Legacy per-category defaults are no longer used.
DELETE FROM settings
WHERE key IN (
  'expiry_days_meals',
  'expiry_days_soups',
  'expiry_days_sauces',
  'expiry_days_baked_goods',
  'expiry_days_ingredients',
  'expiry_days_other'
);
