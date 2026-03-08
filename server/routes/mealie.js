const express = require('express');
const router = express.Router();
// const mealieSync = require('../services/mealieSync'); // TODO Phase 3

// GET /api/mealie/recipes — search Mealie recipes
router.get('/recipes', async (req, res) => {
  // TODO (Phase 3): implement Mealie API integration
  res.json({ recipes: [] });
});

// GET /api/mealie/meal-plan — get meal plan for a date range
router.get('/meal-plan', async (req, res) => {
  // TODO (Phase 3): implement Mealie API integration
  res.json({ mealPlan: [] });
});

// POST /api/mealie/sync — trigger a manual sync
router.post('/sync', async (req, res) => {
  // TODO (Phase 3): implement Mealie API integration
  res.json({ ok: true, message: 'Mealie sync not yet implemented' });
});

module.exports = router;
