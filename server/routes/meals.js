const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const VALID_CATEGORIES = ['Meals', 'Soups', 'Sauces', 'Baked Goods', 'Ingredients', 'Other'];

// GET /api/meals — list all meals with aggregated portions, earliest expiry, and earliest freeze date
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.id, m.name, m.category, m.mealie_recipe_slug, m.image_url, m.notes, m.created_at,
        COALESCE(SUM(b.portions_remaining), 0)::int AS total_portions,
        MIN(b.expiry_date)  AS earliest_expiry,
        MIN(b.freeze_date)  AS earliest_freeze_date,
        COUNT(b.id)::int    AS batch_count
      FROM meals m
      LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
      GROUP BY m.id
      ORDER BY m.name
    `);
    res.json({ meals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch meals' });
  }
});

// GET /api/meals/:id — single meal with batches and activity log
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mealResult = await pool.query('SELECT * FROM meals WHERE id = $1', [id]);
    if (!mealResult.rows.length) return res.status(404).json({ error: 'Meal not found' });

    const batchesResult = await pool.query(
      'SELECT * FROM batches WHERE meal_id = $1 ORDER BY freeze_date ASC',
      [id]
    );
    const activityResult = await pool.query(
      'SELECT * FROM activity_log WHERE meal_id = $1 ORDER BY created_at DESC LIMIT 50',
      [id]
    );

    res.json({
      meal: mealResult.rows[0],
      batches: batchesResult.rows,
      activity: activityResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch meal' });
  }
});

// POST /api/meals — create a new meal
router.post('/', async (req, res) => {
  try {
    const { name, category = 'Meals', mealie_recipe_slug, image_url, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO meals (name, category, mealie_recipe_slug, image_url, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), category, mealie_recipe_slug || null, image_url || null, notes || null]
    );
    res.status(201).json({ meal: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Meal already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create meal' });
  }
});

// PUT /api/meals/:id — partial update (only provided fields are changed)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate each provided field
    if (req.body.name !== undefined && !String(req.body.name).trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    if (req.body.category !== undefined && !VALID_CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    // Build SET clause from only the fields that were provided
    const allowed = ['name', 'category', 'mealie_recipe_slug', 'image_url', 'notes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key] ?? null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const keys = Object.keys(updates);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), id];

    const { rows } = await pool.query(
      `UPDATE meals SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Meal not found' });
    res.json({ meal: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Meal name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update meal' });
  }
});

// DELETE /api/meals/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM meals WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Meal not found' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete meal' });
  }
});

// POST /api/meals/:id/increment — add a new batch
router.post('/:id/increment', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { portions = 2, freeze_date, expiry_date } = req.body;

    // Validate portions
    const qty = Number(portions);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'portions must be a positive integer' });
    }

    await client.query('BEGIN');

    // Always verify meal exists first — gives consistent 404 regardless of expiry_date
    const { rows: mealRows } = await client.query('SELECT category FROM meals WHERE id = $1', [id]);
    if (!mealRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Meal not found' });
    }

    // Determine expiry
    let finalExpiry = expiry_date || null;
    if (!finalExpiry) {
      const cat = mealRows[0].category.toLowerCase().replace(/ /g, '_');
      const { rows: settingRows } = await client.query(
        'SELECT value FROM settings WHERE key = $1',
        [`expiry_days_${cat}`]
      );
      const days = settingRows.length ? parseInt(settingRows[0].value) : 90;
      const fd = freeze_date ? new Date(freeze_date) : new Date();
      fd.setUTCDate(fd.getUTCDate() + days);
      finalExpiry = fd.toISOString().split('T')[0];
    }

    // Use CURRENT_DATE for freeze_date default so server local date is used
    const actualFreezeDate = freeze_date || null;
    const { rows: batchRows } = await client.query(
      `INSERT INTO batches (meal_id, portions_remaining, freeze_date, expiry_date)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4) RETURNING *`,
      [id, qty, actualFreezeDate, finalExpiry]
    );

    await client.query(
      `INSERT INTO activity_log (meal_id, batch_id, action, quantity, source)
       VALUES ($1, $2, 'add', $3, 'manual')`,
      [id, batchRows[0].id, qty]
    );

    await client.query('COMMIT');
    res.status(201).json({ batch: batchRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to increment' });
  } finally {
    client.release();
  }
});

// POST /api/meals/:id/decrement — FIFO removal
router.post('/:id/decrement', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { quantity = 1, source = 'manual', note } = req.body;

    // Validate quantity
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    await client.query('BEGIN');

    // Verify meal exists first — gives 404 not "not enough portions"
    const { rows: mealCheck } = await client.query('SELECT id FROM meals WHERE id = $1', [id]);
    if (!mealCheck.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Meal not found' });
    }

    // FIFO: lock rows to prevent concurrent races
    const { rows: batches } = await client.query(
      `SELECT * FROM batches WHERE meal_id = $1 AND portions_remaining > 0
       ORDER BY freeze_date ASC FOR UPDATE`,
      [id]
    );

    const totalAvailable = batches.reduce((sum, b) => sum + b.portions_remaining, 0);
    if (totalAvailable < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough portions available', available: totalAvailable });
    }

    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.portions_remaining);
      await client.query(
        'UPDATE batches SET portions_remaining = portions_remaining - $1 WHERE id = $2',
        [take, batch.id]
      );
      await client.query(
        `INSERT INTO activity_log (meal_id, batch_id, action, quantity, source, note)
         VALUES ($1, $2, 'remove', $3, $4, $5)`,
        [id, batch.id, take, source, note || null]
      );
      remaining -= take;
    }

    await client.query('COMMIT');
    res.json({ removed: qty });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to decrement' });
  } finally {
    client.release();
  }
});

module.exports = router;
