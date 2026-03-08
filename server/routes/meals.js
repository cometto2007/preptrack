const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET /api/meals — list all meals with aggregated portions and earliest expiry
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.id, m.name, m.category, m.mealie_recipe_slug, m.image_url, m.notes, m.created_at,
        COALESCE(SUM(b.portions_remaining), 0)::int AS total_portions,
        MIN(b.expiry_date) AS earliest_expiry,
        COUNT(b.id)::int AS batch_count
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
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO meals (name, category, mealie_recipe_slug, image_url, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, category, mealie_recipe_slug, image_url, notes]
    );
    res.status(201).json({ meal: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Meal already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create meal' });
  }
});

// PUT /api/meals/:id — update a meal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, mealie_recipe_slug, image_url, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE meals SET name=$1, category=$2, mealie_recipe_slug=$3, image_url=$4, notes=$5
       WHERE id=$6 RETURNING *`,
      [name, category, mealie_recipe_slug, image_url, notes, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Meal not found' });
    res.json({ meal: rows[0] });
  } catch (err) {
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
    const { portions = 2, freeze_date, expiry_date, category } = req.body;

    await client.query('BEGIN');

    // Determine expiry from category default if not provided
    let finalExpiry = expiry_date;
    if (!finalExpiry) {
      const cat = (category || 'meals').toLowerCase().replace(' ', '_');
      const settingKey = `expiry_days_${cat}`;
      const { rows } = await client.query('SELECT value FROM settings WHERE key = $1', [settingKey]);
      const days = rows.length ? parseInt(rows[0].value) : 90;
      const fd = freeze_date ? new Date(freeze_date) : new Date();
      fd.setDate(fd.getDate() + days);
      finalExpiry = fd.toISOString().split('T')[0];
    }

    const { rows: batchRows } = await client.query(
      `INSERT INTO batches (meal_id, portions_remaining, freeze_date, expiry_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, portions, freeze_date || new Date().toISOString().split('T')[0], finalExpiry]
    );

    await client.query(
      `INSERT INTO activity_log (meal_id, batch_id, action, quantity, source)
       VALUES ($1, $2, 'add', $3, 'manual')`,
      [id, batchRows[0].id, portions]
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

    await client.query('BEGIN');

    // FIFO: get batches oldest first with remaining portions
    const { rows: batches } = await client.query(
      `SELECT * FROM batches WHERE meal_id = $1 AND portions_remaining > 0
       ORDER BY freeze_date ASC`,
      [id]
    );

    const totalAvailable = batches.reduce((sum, b) => sum + b.portions_remaining, 0);
    if (totalAvailable < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough portions available' });
    }

    let remaining = quantity;
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
        [id, batch.id, take, source, note]
      );
      remaining -= take;
    }

    await client.query('COMMIT');
    res.json({ removed: quantity });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to decrement' });
  } finally {
    client.release();
  }
});

module.exports = router;
