const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET /api/notifications/pending — open reservations needing user action
router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, m.name AS meal_name, m.category,
             COALESCE(SUM(b.portions_remaining), 0)::int AS freezer_stock
      FROM reservations r
      JOIN meals m ON m.id = r.meal_id
      LEFT JOIN batches b ON b.meal_id = r.meal_id AND b.portions_remaining > 0
      WHERE r.status = 'pending'
      GROUP BY r.id, m.name, m.category
      ORDER BY r.meal_plan_date ASC
    `);
    res.json({ prompts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending notifications' });
  }
});

// POST /api/notifications/subscribe — save a push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO NOTHING`,
      [endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// POST /api/notifications/resolve/:reservationId — resolve a prompt
router.post('/resolve/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { action } = req.body; // 'defrost' | 'cooking_fresh' | 'skip' | 'ate_fresh' | 'froze_portions' | 'used_freezer'

    const { rows } = await pool.query(
      `UPDATE reservations SET status='confirmed', resolved_at=NOW()
       WHERE id=$1 RETURNING *`,
      [reservationId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found' });

    // TODO (Phase 4): trigger appropriate inventory actions based on action type
    res.json({ ok: true, action });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve prompt' });
  }
});

module.exports = router;
