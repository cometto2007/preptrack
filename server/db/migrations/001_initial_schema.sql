-- PrepTrack initial schema

CREATE TABLE IF NOT EXISTS meals (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  mealie_recipe_slug TEXT,
  mealie_category_name TEXT,
  mealie_category_slug TEXT,
  image_url   TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
  id                 SERIAL PRIMARY KEY,
  meal_id            INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  portions_remaining INTEGER NOT NULL DEFAULT 0 CHECK (portions_remaining >= 0),
  freeze_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date        DATE NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_meal_id ON batches(meal_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry  ON batches(expiry_date);

CREATE TABLE IF NOT EXISTS activity_log (
  id         SERIAL PRIMARY KEY,
  meal_id    INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  batch_id   INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  action     TEXT NOT NULL CHECK (action IN ('add','remove','expire','reserve','unreserve')),
  quantity   INTEGER NOT NULL,
  source     TEXT CHECK (source IN ('manual','prompt','mealie_sync')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_meal_id ON activity_log(meal_id);

CREATE TABLE IF NOT EXISTS reservations (
  id             SERIAL PRIMARY KEY,
  meal_id        INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  batch_id       INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  meal_plan_date DATE NOT NULL,
  meal_type      TEXT NOT NULL CHECK (meal_type IN ('lunch','dinner')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  UNIQUE (meal_plan_date, meal_type)
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule (
  day_of_week     INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  lunch_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  dinner_enabled  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS schedule_overrides (
  id            SERIAL PRIMARY KEY,
  week_start    DATE NOT NULL,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('lunch','dinner')),
  override_type TEXT NOT NULL CHECK (override_type IN ('enabled','disabled')),
  UNIQUE (week_start, day_of_week, meal_type)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  endpoint    TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default schedule: Mon–Fri on, Sat–Sun off
INSERT INTO schedule (day_of_week, lunch_enabled, dinner_enabled) VALUES
  (0, FALSE, FALSE),
  (1, TRUE,  TRUE),
  (2, TRUE,  TRUE),
  (3, TRUE,  TRUE),
  (4, TRUE,  TRUE),
  (5, TRUE,  TRUE),
  (6, FALSE, FALSE)
ON CONFLICT (day_of_week) DO NOTHING;

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('lunch_prompt_time',      '15:00'),
  ('dinner_prompt_time',     '20:00'),
  ('notification_channel',   'push'),
  ('default_portions',       '2'),
  ('defrost_lead_days',      '1'),
  ('mealie_url',             ''),
  ('mealie_api_key',         ''),
  ('mealie_sync_frequency',  '6h'),
  ('default_expiry_days',    '90')
ON CONFLICT (key) DO NOTHING;
