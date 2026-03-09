-- Phase 3/5: Allow multiple reservations per slot (one per recipe in grouped meal)
-- Drop the old single-reservation-per-slot constraint
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_meal_plan_date_meal_type_key;

-- New constraint: one reservation per recipe per slot
ALTER TABLE reservations
  ADD CONSTRAINT reservations_slot_meal_unique
  UNIQUE (meal_plan_date, meal_type, meal_id);

-- Store how many portions were planned in Mealie (from duplicate entries = quantity)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS planned_quantity INTEGER NOT NULL DEFAULT 1;
