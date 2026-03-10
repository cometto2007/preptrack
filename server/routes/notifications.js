const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { vapidPublicKey, vapidConfigured, sendToAll } = require('../services/pushService');

// GET /api/notifications/pending — open reservations grouped by date+meal_type
router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.meal_id, r.meal_plan_date, r.meal_type, r.status,
             COALESCE(r.planned_quantity, 1) AS planned_quantity,
             m.name AS meal_name, m.mealie_recipe_slug,
             COALESCE(SUM(b.portions_remaining), 0)::int AS freezer_stock
      FROM reservations r
      JOIN meals m ON m.id = r.meal_id
      LEFT JOIN batches b ON b.meal_id = r.meal_id AND b.portions_remaining > 0
      WHERE r.status = 'pending'
      GROUP BY r.id, m.name, m.mealie_recipe_slug
      ORDER BY r.meal_plan_date ASC, r.id ASC
    `);

    // Group reservations by date + meal_type into prompt objects
    const groupMap = new Map();
    for (const row of rows) {
      const dateStr = typeof row.meal_plan_date === 'string'
        ? row.meal_plan_date
        : row.meal_plan_date.toISOString().slice(0, 10);
      const key = `${dateStr}:${row.meal_type}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { date: dateStr, meal_type: row.meal_type, recipes: [] });
      }
      groupMap.get(key).recipes.push({
        id: row.id,
        meal_id: row.meal_id,
        meal_name: row.meal_name,
        mealie_recipe_slug: row.mealie_recipe_slug,
        freezer_stock: row.freezer_stock,
        planned_quantity: row.planned_quantity,
      });
    }

    res.json({ prompts: Array.from(groupMap.values()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending notifications' });
  }
});

// GET /api/notifications/vapid-public-key — returns VAPID public key for push subscription
router.get('/vapid-public-key', (req, res) => {
  if (!vapidConfigured) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ key: vapidPublicKey });
});

// POST /api/notifications/subscribe — save a push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    // Restrict to https push service endpoints only (prevents SSRF)
    let parsedEndpoint;
    try { parsedEndpoint = new URL(endpoint); } catch {
      return res.status(400).json({ error: 'Invalid endpoint URL' });
    }
    if (parsedEndpoint.protocol !== 'https:') {
      return res.status(400).json({ error: 'endpoint must use https' });
    }
    // Block loopback and private-range hosts (prevents SSRF to internal services)
    const h = parsedEndpoint.hostname;
    const isPrivate =
      h === 'localhost' ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h) ||
      h === '::1' ||
      /^fc[0-9a-f]{2}:/i.test(h) ||
      /^fd[0-9a-f]{2}:/i.test(h);
    if (isPrivate) {
      return res.status(400).json({ error: 'endpoint hostname not allowed' });
    }
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
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// POST /api/notifications/resolve-group
// Resolves multiple reservations in a single transaction.
// Body: { resolutions: [{ id, action, portions?, freeze_date?, expiry_date? }] }
router.post('/resolve-group', async (req, res) => {
  const { resolutions } = req.body;
  if (!Array.isArray(resolutions) || resolutions.length === 0) {
    return res.status(400).json({ error: 'resolutions must be a non-empty array' });
  }

  const VALID_ACTIONS = ['defrost', 'cooking_fresh', 'skip', 'ate_fresh', 'froze_portions', 'ate_and_froze', 'used_freezer'];

  for (const r of resolutions) {
    if (!Number.isInteger(r.id) || r.id <= 0) {
      return res.status(400).json({ error: 'Each resolution must have a valid id' });
    }
    if (!VALID_ACTIONS.includes(r.action)) {
      return res.status(400).json({ error: `Invalid action: ${r.action}` });
    }
  }

  let client;
  try {
    // Validate that all resolutions are for pending reservations
    // and that they belong to the same date/meal_type group
    const { rows: reservationChecks } = await pool.query(
      `SELECT id, meal_plan_date::text, meal_type, status FROM reservations WHERE id = ANY($1::int[])`,
      [resolutions.map(r => r.id)]
    );
    
    if (reservationChecks.length !== resolutions.length) {
      const foundIds = new Set(reservationChecks.map(r => r.id));
      const missing = resolutions.find(r => !foundIds.has(r.id));
      return res.status(404).json({ error: `Reservation ${missing?.id} not found` });
    }

    const nonPending = reservationChecks.find(r => r.status !== 'pending');
    if (nonPending) {
      return res.status(409).json({ error: `Reservation ${nonPending.id} is not pending (status: ${nonPending.status})` });
    }

    // Ensure all reservations are from the same group (same date + meal_type)
    const dates = new Set(reservationChecks.map(r => typeof r.meal_plan_date === 'string' ? r.meal_plan_date : r.meal_plan_date.toISOString().slice(0,10)));
    const types = new Set(reservationChecks.map(r => r.meal_type));
    if (dates.size > 1 || types.size > 1) {
      return res.status(400).json({ error: 'All reservations must be from the same date and meal type' });
    }

    // Proceed with transaction
    client = await pool.connect();
    await client.query('BEGIN');

    for (const r of resolutions) {
      const { rows: resRows } = await client.query(
        `SELECT r.*, m.name AS meal_name FROM reservations r
         JOIN meals m ON m.id = r.meal_id
         WHERE r.id = $1 FOR UPDATE`,
        [r.id]
      );
      if (!resRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Reservation ${r.id} not found` });
      }
      const reservation = resRows[0];
      if (reservation.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Reservation ${r.id} already resolved` });
      }

      const mealId = reservation.meal_id;
      const newStatus = r.action === 'skip' ? 'cancelled' : 'confirmed';

      await client.query(
        `UPDATE reservations SET status = $1, resolved_at = NOW() WHERE id = $2`,
        [newStatus, r.id]
      );

      if (r.action === 'defrost' || r.action === 'used_freezer') {
        // Default to planned_quantity if portions not provided
        const qty = r.portions != null 
          ? (Number.isInteger(r.portions) ? r.portions : parseInt(r.portions, 10))
          : reservation.planned_quantity;
        if (!Number.isInteger(qty) || qty <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `portions must be a positive integer for reservation ${r.id}` });
        }
        try {
          await fifoDecrement(client, mealId, qty, r.action);
        } catch (stockErr) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: stockErr.message });
        }
      } else if (r.action === 'froze_portions' || r.action === 'ate_and_froze') {
        // Default to planned_quantity if portions not provided
        const qty = r.portions != null 
          ? (Number.isInteger(r.portions) ? r.portions : parseInt(r.portions, 10))
          : reservation.planned_quantity;
        if (!Number.isInteger(qty) || qty <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `portions must be a positive integer for reservation ${r.id}` });
        }
        try {
          await addBatch(client, mealId, qty, r.freeze_date || null, r.expiry_date || null, 'prompt');
        } catch (batchErr) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: batchErr.message });
        }
      }
      // cooking_fresh, skip, ate_fresh — no inventory change
    }

    await client.query('COMMIT');
    res.json({ ok: true, resolved: resolutions.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[notifications] resolve-group error:', err.message);
    res.status(500).json({ error: 'Failed to resolve prompts' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/notifications/resolve/:reservationId
// action: 'defrost' | 'cooking_fresh' | 'skip' | 'ate_fresh' | 'froze_portions' | 'ate_and_froze' | 'used_freezer'
router.post('/resolve/:reservationId', async (req, res) => {
  const reservationId = parseInt(req.params.reservationId, 10);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({ error: 'Invalid reservation ID' });
  }
  const { action, portions, freeze_date, expiry_date } = req.body;

  const VALID_ACTIONS = ['defrost', 'cooking_fresh', 'skip', 'ate_fresh', 'froze_portions', 'ate_and_froze', 'used_freezer'];
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: resRows } = await client.query(
      `SELECT r.*, m.name AS meal_name FROM reservations r
       JOIN meals m ON m.id = r.meal_id
       WHERE r.id = $1 FOR UPDATE`,
      [reservationId]
    );
    if (!resRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const reservation = resRows[0];
    if (reservation.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Reservation already resolved' });
    }

    const mealId = reservation.meal_id;
    const newStatus = action === 'skip' ? 'cancelled' : 'confirmed';

    await client.query(
      `UPDATE reservations SET status = $1, resolved_at = NOW() WHERE id = $2`,
      [newStatus, reservationId]
    );

    if (action === 'defrost' || action === 'used_freezer') {
      const qty = Object.prototype.hasOwnProperty.call(req.body, 'portions') ? parseInt(portions, 10) : 1;
      if (!Number.isInteger(qty) || qty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'portions must be a positive integer' });
      }
      try {
        await fifoDecrement(client, mealId, qty, action);
      } catch (stockErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: stockErr.message });
      }
    } else if (action === 'froze_portions' || action === 'ate_and_froze') {
      const qty = parseInt(portions, 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'portions must be a positive integer' });
      }
      try {
        await addBatch(client, mealId, qty, freeze_date || null, expiry_date || null, 'prompt');
      } catch (batchErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: batchErr.message });
      }
    }
    // cooking_fresh, skip, ate_fresh — no inventory change

    await client.query('COMMIT');
    res.json({ ok: true, action, status: newStatus });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[notifications] resolve error:', err.message);
    res.status(500).json({ error: 'Failed to resolve prompt' });
  } finally {
    if (client) client.release();
  }
});

// FIFO decrement helper
async function fifoDecrement(client, mealId, quantity, source) {
  const { rows: batches } = await client.query(
    `SELECT id, portions_remaining FROM batches
     WHERE meal_id = $1 AND portions_remaining > 0
     ORDER BY freeze_date ASC, id ASC
     FOR UPDATE`,
    [mealId]
  );
  const totalAvailable = batches.reduce((s, b) => s + b.portions_remaining, 0);
  if (totalAvailable < quantity) {
    throw new Error(`Insufficient freezer stock: requested ${quantity}, available ${totalAvailable}`);
  }
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.portions_remaining);
    const newCount = batch.portions_remaining - take;
    if (newCount === 0) {
      await client.query('DELETE FROM batches WHERE id = $1', [batch.id]);
    } else {
      await client.query('UPDATE batches SET portions_remaining = $1 WHERE id = $2', [newCount, batch.id]);
    }
    await client.query(
      `INSERT INTO activity_log (meal_id, batch_id, action, quantity, source)
       VALUES ($1, $2, 'remove', $3, $4)`,
      [mealId, batch.id, take, source]
    );
    remaining -= take;
  }
}

// Add batch helper
async function addBatch(client, mealId, qty, freezeDate, expiryDate, source = 'prompt') {
  // Validate date strings — reject malformed and normalized dates (e.g. 2026-02-29 → 2026-03-01)
  function strictDate(str, fieldName) {
    if (!str) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error(`${fieldName} must be YYYY-MM-DD`);
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) {
      throw new Error(`${fieldName} is not a valid calendar date`);
    }
  }
  strictDate(freezeDate, 'freeze_date');
  strictDate(expiryDate, 'expiry_date');
  let finalExpiry = expiryDate || null;
  if (!finalExpiry) {
    const { rows: settingRows } = await client.query(
      "SELECT value FROM settings WHERE key = 'default_expiry_days'"
    );
    const parsed = parseInt(settingRows[0]?.value, 10);
    const days = Number.isInteger(parsed) && parsed > 0 ? parsed : 90;
    // Use local-date arithmetic throughout to avoid UTC shift
    let fd;
    if (freezeDate) {
      const [fy, fm, fdd] = freezeDate.split('-').map(Number);
      fd = new Date(fy, fm - 1, fdd);
    } else {
      const now = new Date();
      fd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    fd.setDate(fd.getDate() + days);
    finalExpiry = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}-${String(fd.getDate()).padStart(2, '0')}`;
  }
  const { rows: batchRows } = await client.query(
    `INSERT INTO batches (meal_id, portions_remaining, freeze_date, expiry_date)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4) RETURNING id`,
    [mealId, qty, freezeDate || null, finalExpiry]
  );
  await client.query(
    `INSERT INTO activity_log (meal_id, batch_id, action, quantity, source)
     VALUES ($1, $2, 'add', $3, $4)`,
    [mealId, batchRows[0].id, qty, source]
  );
}

module.exports = router;
