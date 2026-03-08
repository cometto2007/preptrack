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
  try {
    const { rowCount } = await pool.query('DELETE FROM batches WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Batch not found' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

module.exports = router;
