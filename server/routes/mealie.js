const express = require('express');
const router = express.Router();
const mealieSync = require('../services/mealieSync');
const pool = require('../db/connection');

// GET /api/mealie/recipes?q=&page=1&perPage=20
router.get('/recipes', async (req, res) => {
  const q = req.query.q || '';
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = parseInt(req.query.perPage, 10) || 20;
  try {
    const recipes = await mealieSync.searchRecipes(q, page, perPage);
    res.json({ recipes });
  } catch (err) {
    // Gracefully return empty list if Mealie is not configured
    if (err.message && err.message.includes('not configured')) {
      return res.json({ recipes: [] });
    }
    console.error('[mealie] searchRecipes error:', err.message);
    res.json({ recipes: [] });
  }
});

// GET /api/mealie/meal-plan?start=YYYY-MM-DD&days=7
router.get('/meal-plan', async (req, res) => {
  const start = req.query.start;
  const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));

  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: 'start date (YYYY-MM-DD) is required' });
  }

  // Calculate end date
  const startDt = new Date(`${start}T00:00:00`);
  const endDt = new Date(startDt);
  endDt.setDate(endDt.getDate() + days - 1);
  const endDate = endDt.toISOString().slice(0, 10);

  // Fetch PrepTrack meals with total portions
  const { rows: meals } = await pool.query(
    `SELECT m.id, m.name, m.mealie_recipe_slug,
            COALESCE(SUM(b.portions_remaining), 0) AS total_portions
     FROM meals m
     LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
     GROUP BY m.id`
  );

  // Fetch schedule + default_portions setting
  const { rows: schedule } = await pool.query(
    'SELECT day_of_week, lunch_enabled, dinner_enabled FROM schedule'
  );
  const { rows: settingRows } = await pool.query(
    "SELECT value FROM settings WHERE key = 'default_portions'"
  );
  const lowThreshold = parseInt(settingRows[0]?.value ?? '2', 10);
  // Map day_of_week -> { lunch_enabled, dinner_enabled }
  const scheduleMap = {};
  for (const row of schedule) {
    scheduleMap[row.day_of_week] = {
      lunchEnabled: row.lunch_enabled,
      dinnerEnabled: row.dinner_enabled,
    };
  }

  // Fetch Mealie plan entries
  let mealieEntries = [];
  try {
    mealieEntries = await mealieSync.getMealPlan(start, endDate);
  } catch (err) {
    if (!err.message.includes('not configured')) {
      console.error('[mealie] getMealPlan error:', err.message);
    }
    // Proceed without Mealie data
  }

  // Index Mealie entries by date+type
  const mealieMap = {}; // `${date}:${entry_type}` -> entry
  for (const entry of mealieEntries) {
    const entryDate = entry.date; // YYYY-MM-DD
    const entryType = (entry.entry_type || '').toLowerCase(); // 'lunch' or 'dinner'
    const key = `${entryDate}:${entryType}`;
    mealieMap[key] = entry;
  }

  // Build slug -> meal lookup
  const slugToMeal = {};
  for (const meal of meals) {
    if (meal.mealie_recipe_slug) {
      slugToMeal[meal.mealie_recipe_slug] = meal;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const resultDays = [];
  let totalEnabled = 0;
  let covered = 0;
  let low = 0;
  let missing = 0;

  for (let i = 0; i < days; i++) {
    const dt = new Date(startDt);
    dt.setDate(dt.getDate() + i);
    const dateStr = dt.toISOString().slice(0, 10);
    const dayOfWeek = dt.getDay(); // 0=Sun
    const sched = scheduleMap[dayOfWeek] || { lunchEnabled: true, dinnerEnabled: true };

    const slots = [];
    for (const slotType of ['lunch', 'dinner']) {
      const enabled = slotType === 'lunch' ? sched.lunchEnabled : sched.dinnerEnabled;
      if (!enabled) {
        slots.push({ type: slotType, recipeName: null, slug: null, preptrackId: null, status: 'off', portions: 0 });
        continue;
      }

      totalEnabled++;
      const mealieEntry = mealieMap[`${dateStr}:${slotType}`];
      if (!mealieEntry || !mealieEntry.recipe) {
        // No Mealie plan entry for this slot
        slots.push({ type: slotType, recipeName: null, slug: null, preptrackId: null, status: 'unplanned', portions: 0 });
        missing++;
        continue;
      }

      const recipe = mealieEntry.recipe;
      const slug = recipe.slug;
      const ptMeal = slugToMeal[slug];
      const portions = ptMeal ? Number(ptMeal.total_portions) : 0;

      let status;
      if (!ptMeal || portions === 0) {
        status = 'missing';
        missing++;
      } else if (portions <= lowThreshold) {
        status = 'low';
        low++;
      } else {
        status = 'covered';
        covered++;
      }

      slots.push({
        type: slotType,
        recipeName: recipe.name,
        slug,
        preptrackId: ptMeal ? ptMeal.id : null,
        status,
        portions,
      });
    }

    resultDays.push({
      date: dateStr,
      dayOfWeek,
      isToday: dateStr === today,
      slots,
    });
  }

  res.json({
    days: resultDays,
    summary: { total: totalEnabled, covered, low, missing },
  });
});

// POST /api/mealie/sync — link PrepTrack meals to Mealie recipes by name
router.post('/sync', async (req, res) => {
  try {
    // Fetch all Mealie recipes (paginate)
    const perPage = 50;
    let page = 1;
    let allRecipes = [];
    while (true) {
      const data = await mealieSync.searchRecipes('', page, perPage);
      if (!data || data.length === 0) break;
      allRecipes = allRecipes.concat(data);
      if (data.length < perPage) break;
      page++;
    }

    // Fetch PrepTrack meals that have no mealie_recipe_slug
    const { rows: meals } = await pool.query(
      "SELECT id, name FROM meals WHERE mealie_recipe_slug IS NULL OR mealie_recipe_slug = ''"
    );

    // Build a map of Mealie recipe name (lower) -> slug
    const mealieByName = {};
    for (const r of allRecipes) {
      mealieByName[r.name.toLowerCase()] = r.slug;
    }

    let linked = 0;
    for (const meal of meals) {
      const slug = mealieByName[meal.name.toLowerCase()];
      if (slug) {
        await pool.query(
          'UPDATE meals SET mealie_recipe_slug = $1 WHERE id = $2',
          [slug, meal.id]
        );
        linked++;
      }
    }

    res.json({ ok: true, linked });
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      return res.status(400).json({ error: 'Mealie is not configured' });
    }
    console.error('[mealie] sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
