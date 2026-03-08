const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET /api/categories
// Returns category names currently used by meals + an Uncategorised bucket.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.mealie_category_name,
        COUNT(*)::int AS meal_count
      FROM meals m
      JOIN (
        SELECT meal_id
        FROM batches
        WHERE portions_remaining > 0
        GROUP BY meal_id
      ) stocked ON stocked.meal_id = m.id
      GROUP BY m.mealie_category_name
    `);

    let uncategorisedCount = 0;
    const categories = [];

    for (const row of rows) {
      const name = row.mealie_category_name ? String(row.mealie_category_name).trim() : '';
      if (!name) {
        uncategorisedCount += row.meal_count;
        continue;
      }
      categories.push({
        name,
        count: row.meal_count,
      });
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));
    categories.push({ name: 'Uncategorised', count: uncategorisedCount });

    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
