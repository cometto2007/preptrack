const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET /api/settings — all settings as object
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — update one or more settings
router.put('/', async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
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
    const { dayOfWeek } = req.params;
    const { lunch_enabled, dinner_enabled } = req.body;
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

module.exports = router;
