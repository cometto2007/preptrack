const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET /api/batches?meal_id=x
router.get('/', async (req, res) => {
  try {
    const { meal_id } = req.query;
    const query = meal_id
      ? 'SELECT * FROM batches WHERE meal_id = $1 ORDER BY freeze_date ASC'
      : 'SELECT * FROM batches ORDER BY freeze_date ASC';
    const params = meal_id ? [meal_id] : [];
    const { rows } = await pool.query(query, params);
    res.json({ batches: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// DELETE /api/batches/:id
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }
    const batch = rows[0];
    await client.query('DELETE FROM batches WHERE id = $1', [req.params.id]);
    if (batch.portions_remaining > 0) {
      await client.query(
        `INSERT INTO activity_log (meal_id, action, quantity, source)
         VALUES ($1, 'remove', $2, 'batch_delete')`,
        [batch.meal_id, batch.portions_remaining]
      );
    }
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to delete batch' });
  } finally {
    client.release();
  }
});

module.exports = router;
