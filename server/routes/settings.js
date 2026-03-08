const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const scheduler = require('../services/scheduler');

// GET /api/settings — all settings as object
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    // Never expose sensitive tokens in responses — redact them
    const REDACTED_KEYS = ['mealie_api_key', 'ticktick_api_token', 'ticktick_client_secret', 'telegram_bot_token'];
    for (const key of REDACTED_KEYS) {
      if (settings[key]) settings[key] = '[redacted]';
    }
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

const ALLOWED_SETTINGS_KEYS = new Set([
  'mealie_url',
  'mealie_api_key',
  'default_portions',
  'low_stock_threshold',
  'default_expiry_days',
  'notifications_enabled',
  'telegram_chat_id',
  'telegram_bot_token',
  'lunch_prompt_time',
  'dinner_prompt_time',
  'sync_frequency',
  'defrost_lead_time',
  'ticktick_api_token',
  'ticktick_list_id',
  'ticktick_client_id',
  'ticktick_client_secret',
]);

// PUT /api/settings — update one or more settings (atomic)
router.put('/', async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }
  const unknown = Object.keys(updates).filter(k => !ALLOWED_SETTINGS_KEYS.has(k));
  if (unknown.length) {
    return res.status(400).json({ error: `Unknown setting key(s): ${unknown.join(', ')}` });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(updates)) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    await client.query('COMMIT');

    // Reschedule cron jobs live if prompt times changed
    const promptKeys = ['lunch_prompt_time', 'dinner_prompt_time'];
    if (Object.keys(updates).some(k => promptKeys.includes(k))) {
      scheduler.reschedule().catch(err =>
        console.error('[settings] reschedule failed:', err.message)
      );
    }

    res.json({ ok: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  } finally {
    if (client) client.release();
  }
});

// GET /api/settings/schedule
router.get('/schedule', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM schedule ORDER BY day_of_week');
    res.json({ schedule: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// PUT /api/settings/schedule/:dayOfWeek
router.put('/schedule/:dayOfWeek', async (req, res) => {
  try {
    const dayOfWeek = parseInt(req.params.dayOfWeek, 10);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0–6' });
    }
    const { lunch_enabled, dinner_enabled } = req.body;
    if (typeof lunch_enabled !== 'boolean' || typeof dinner_enabled !== 'boolean') {
      return res.status(400).json({ error: 'lunch_enabled and dinner_enabled must be booleans' });
    }
    const { rows } = await pool.query(
      `UPDATE schedule SET lunch_enabled=$1, dinner_enabled=$2
       WHERE day_of_week=$3 RETURNING *`,
      [lunch_enabled, dinner_enabled, dayOfWeek]
    );
    if (!rows.length) return res.status(404).json({ error: 'Day not found' });
    res.json({ day: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// GET /api/settings/overrides — current week's overrides
router.get('/overrides', async (req, res) => {
  try {
    // week_start is Sunday (day 0) of the current week — use local date arithmetic to avoid UTC shift
    const now = new Date();
    const dow = now.getDay(); // 0=Sun
    const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const weekStartStr = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
    const { rows } = await pool.query(
      `SELECT * FROM schedule_overrides WHERE week_start = $1 ORDER BY day_of_week`,
      [weekStartStr]
    );
    res.json({ overrides: rows, week_start: weekStartStr });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overrides' });
  }
});

// POST /api/settings/overrides — add an override for this week
router.post('/overrides', async (req, res) => {
  try {
    const { week_start, day_of_week, meal_type, override_type } = req.body;
    const VALID_MEAL_TYPES = ['lunch', 'dinner'];
    const VALID_OVERRIDE_TYPES = ['disabled', 'dining_out'];
    // Validate week_start is a YYYY-MM-DD date string representing a Sunday
    if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return res.status(400).json({ error: 'week_start must be a YYYY-MM-DD date string' });
    }
    const [wy, wm, wd] = week_start.split('-').map(Number);
    const ws = new Date(wy, wm - 1, wd); // local date, avoids UTC shift
    // Reject invalid or normalized dates (e.g. 2026-02-29 → 2026-03-01)
    if (ws.getFullYear() !== wy || ws.getMonth() + 1 !== wm || ws.getDate() !== wd || ws.getDay() !== 0) {
      return res.status(400).json({ error: 'week_start must be a valid Sunday (YYYY-MM-DD)' });
    }
    if (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6) {
      return res.status(400).json({ error: 'day_of_week must be 0–6' });
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: 'meal_type must be lunch or dinner' });
    }
    if (!VALID_OVERRIDE_TYPES.includes(override_type)) {
      return res.status(400).json({ error: 'override_type must be disabled or dining_out' });
    }
    const { rows } = await pool.query(
      `INSERT INTO schedule_overrides (week_start, day_of_week, meal_type, override_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (week_start, day_of_week, meal_type) DO UPDATE SET override_type = $4
       RETURNING *`,
      [week_start, day_of_week, meal_type, override_type]
    );
    res.status(201).json({ override: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save override' });
  }
});

// DELETE /api/settings/overrides/:weekStart/:dayOfWeek/:mealType
router.delete('/overrides/:weekStart/:dayOfWeek/:mealType', async (req, res) => {
  try {
    const { weekStart, dayOfWeek, mealType } = req.params;
    const dow = parseInt(dayOfWeek, 10);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0–6' });
    }
    if (!['lunch', 'dinner'].includes(mealType)) {
      return res.status(400).json({ error: 'mealType must be lunch or dinner' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart must be YYYY-MM-DD' });
    }
    const [wsy, wsm, wsd] = weekStart.split('-').map(Number);
    const wsDt = new Date(wsy, wsm - 1, wsd);
    if (wsDt.getFullYear() !== wsy || wsDt.getMonth() + 1 !== wsm || wsDt.getDate() !== wsd || wsDt.getDay() !== 0) {
      return res.status(400).json({ error: 'weekStart must be a valid Sunday (YYYY-MM-DD)' });
    }
    await pool.query(
      `DELETE FROM schedule_overrides
       WHERE week_start = $1 AND day_of_week = $2 AND meal_type = $3`,
      [weekStart, dow, mealType]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

// GET /api/settings/export — full inventory export as JSON
router.get('/export', async (req, res) => {
  try {
    const [{ rows: meals }, { rows: batches }, { rows: log }] = await Promise.all([
      pool.query('SELECT * FROM meals ORDER BY name'),
      pool.query('SELECT * FROM batches ORDER BY meal_id, freeze_date'),
      pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 1000'),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="preptrack-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ exported_at: new Date().toISOString(), meals, batches, activity_log: log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// DELETE /api/settings/clear-inventory — remove all batches (activity log is kept for audit history)
router.delete('/clear-inventory', async (req, res) => {
  try {
    await pool.query('DELETE FROM batches');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear inventory' });
  }
});

module.exports = router;
