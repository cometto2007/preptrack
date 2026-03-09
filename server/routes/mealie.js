const express = require('express');
const router = express.Router();
const mealieSync = require('../services/mealieSync');
const { groupMealPlanEntries } = mealieSync;
const pool = require('../db/connection');

// GET /api/mealie/recipes?q=&page=1&perPage=20
router.get('/recipes', async (req, res) => {
  const q = req.query.q || '';
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = Math.min(100, parseInt(req.query.perPage, 10) || 20);
  try {
    const recipes = await mealieSync.searchRecipes(q, page, perPage);
    res.json({ recipes });
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      return res.json({ recipes: [] });
    }
    console.error('[mealie] searchRecipes error:', err.message);
    res.status(502).json({ error: err.message || 'Failed to fetch recipes from Mealie' });
  }
});

// Adds n days to a YYYY-MM-DD string using local date arithmetic (no UTC shift)
function addDaysToDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Returns today as YYYY-MM-DD in local time
function localDateStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// GET /api/mealie/meal-plan?start=YYYY-MM-DD&days=7
router.get('/meal-plan', async (req, res) => {
  const start = req.query.start;
  const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));

  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: 'start date (YYYY-MM-DD) is required' });
  }
  // Reject invalid calendar dates (e.g. 2026-99-99 passes the regex but is not real)
  const [sy, sm, sd] = start.split('-').map(Number);
  const startCheck = new Date(sy, sm - 1, sd);
  if (startCheck.getFullYear() !== sy || startCheck.getMonth() + 1 !== sm || startCheck.getDate() !== sd) {
    return res.status(400).json({ error: 'start is not a valid calendar date' });
  }

  // Calculate end date using local-date arithmetic (avoids UTC timezone drift)
  const endDate = addDaysToDateStr(start, days - 1);

  // Fetch PrepTrack meals with total portions
  let meals, schedule, scheduleMap, lowThreshold;
  try {
    const { rows: mealRows } = await pool.query(
      `SELECT m.id, m.name, m.mealie_recipe_slug,
              COALESCE(SUM(b.portions_remaining), 0) AS total_portions
       FROM meals m
       LEFT JOIN batches b ON b.meal_id = m.id AND b.portions_remaining > 0
       GROUP BY m.id`
    );
    meals = mealRows;

    const { rows: scheduleRows } = await pool.query(
      'SELECT day_of_week, lunch_enabled, dinner_enabled FROM schedule'
    );
    schedule = scheduleRows;

    const { rows: settingRows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'default_portions'"
    );
    lowThreshold = parseInt(settingRows[0]?.value, 10) || 2;

    scheduleMap = {};
    for (const row of schedule) {
      scheduleMap[row.day_of_week] = {
        lunchEnabled: row.lunch_enabled,
        dinnerEnabled: row.dinner_enabled,
      };
    }
  } catch (err) {
    console.error('[mealie] DB error in meal-plan:', err.message);
    return res.status(500).json({ error: 'Database error' });
  }

  // Fetch Mealie plan entries
  let mealieEntries = [];
  try {
    mealieEntries = await mealieSync.getMealPlan(start, endDate);
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      // Mealie not set up — return plan without recipe data
    } else {
      console.error('[mealie] getMealPlan error:', err.message);
      return res.status(502).json({ error: err.message || 'Failed to fetch meal plan from Mealie' });
    }
  }

  // Group Mealie entries by date + broad meal type
  const grouped = groupMealPlanEntries(mealieEntries);
  const groupedMap = new Map(); // "date:mealType" -> GroupedMeal
  for (const g of grouped) {
    groupedMap.set(`${g.date}:${g.mealType}`, g);
  }

  // Build slug -> PrepTrack meal lookup
  const slugToMeal = {};
  for (const meal of meals) {
    if (meal.mealie_recipe_slug) {
      slugToMeal[meal.mealie_recipe_slug] = meal;
    }
  }

  // Compute per-recipe status
  function recipeStatus(slug) {
    const ptMeal = slugToMeal[slug];
    const portions = ptMeal ? Number(ptMeal.total_portions) : 0;
    if (!ptMeal || portions === 0) return 'missing';
    if (portions <= lowThreshold) return 'low';
    return 'covered';
  }

  // Compute aggregate slot status from individual recipe statuses
  function aggregateStatus(statuses) {
    if (statuses.length === 0) return 'unplanned';
    if (statuses.every(s => s === 'covered')) return 'covered';
    if (statuses.every(s => s === 'missing')) return 'missing';
    if (statuses.every(s => s === 'covered' || s === 'low')) return 'low';
    return 'partial'; // some covered/low, some missing
  }

  const today = localDateStr();
  const resultDays = [];
  let totalEnabled = 0;
  let coveredCount = 0;
  let partialCount = 0;
  let missingCount = 0;

  for (let i = 0; i < days; i++) {
    const dateStr = addDaysToDateStr(start, i);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    const sched = scheduleMap[dayOfWeek] || { lunchEnabled: true, dinnerEnabled: true };

    const slots = [];
    for (const slotType of ['lunch', 'dinner']) {
      const enabled = slotType === 'lunch' ? sched.lunchEnabled : sched.dinnerEnabled;
      if (!enabled) {
        slots.push({ type: slotType, status: 'off', recipes: [] });
        continue;
      }

      totalEnabled++;
      const group = groupedMap.get(`${dateStr}:${slotType}`);

      if (!group || group.recipes.length === 0) {
        slots.push({ type: slotType, status: 'unplanned', recipes: [] });
        missingCount++;
        continue;
      }

      const recipes = group.recipes.map(r => {
        const ptMeal = slugToMeal[r.slug];
        const portions = ptMeal ? Number(ptMeal.total_portions) : 0;
        const status = recipeStatus(r.slug);
        return {
          slug: r.slug,
          name: r.name,
          recipeId: r.mealieId,
          quantity: r.quantity,
          preptrackId: ptMeal ? ptMeal.id : null,
          portions,
          status,
        };
      });

      const slotStatus = aggregateStatus(recipes.map(r => r.status));

      if (slotStatus === 'covered' || slotStatus === 'low') coveredCount++;
      else if (slotStatus === 'partial') partialCount++;
      else missingCount++;

      slots.push({ type: slotType, status: slotStatus, recipes });
    }

    resultDays.push({ date: dateStr, dayOfWeek, isToday: dateStr === today, slots });
  }

  res.json({
    days: resultDays,
    summary: { total: totalEnabled, covered: coveredCount, partial: partialCount, missing: missingCount },
  });
});

function firstRecipeCategory(recipe) {
  if (!Array.isArray(recipe?.recipeCategory) || recipe.recipeCategory.length === 0) {
    return { name: null, slug: null };
  }
  return {
    name: recipe.recipeCategory[0]?.name || null,
    slug: recipe.recipeCategory[0]?.slug || null,
  };
}

// GET /api/mealie/recipe/:slug
router.get('/recipe/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    const recipe = await mealieSync.getRecipe(slug);
    const category = firstRecipeCategory(recipe);
    res.json({
      recipe: {
        id: recipe.id,
        slug: recipe.slug,
        name: recipe.name,
        mealie_category_name: category.name,
        mealie_category_slug: category.slug,
        recipeServings: recipe.recipeServings ?? recipe.recipe_servings ?? null,
      },
    });
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      return res.status(400).json({ error: 'Mealie is not configured' });
    }
    res.status(502).json({ error: err.message || 'Failed to fetch recipe' });
  }
});

// POST /api/mealie/sync — link PrepTrack meals to Mealie recipes by name
router.post('/sync', async (req, res) => {
  try {
    // Fetch all Mealie recipes (paginate)
    const perPage = 50;
    const maxPages = 20; // guard against infinite loop
    let page = 1;
    let allRecipes = [];
    while (page <= maxPages) {
      const data = await mealieSync.searchRecipes('', page, perPage);
      if (!data || data.length === 0) break;
      allRecipes = allRecipes.concat(data);
      if (data.length < perPage) break;
      page++;
    }

    // Fetch PrepTrack meals that have no mealie slug or missing stored category metadata
    const { rows: meals } = await pool.query(
      `SELECT id, name
       FROM meals
       WHERE mealie_recipe_slug IS NULL
          OR mealie_recipe_slug = ''
          OR mealie_category_name IS NULL
          OR BTRIM(mealie_category_name) = ''`
    );

    // Build a map of Mealie recipe name (lower) -> recipe metadata
    const mealieByName = {};
    for (const r of allRecipes) {
      mealieByName[r.name.toLowerCase()] = {
        slug: r.slug,
        mealie_category_name: r.mealie_category_name || null,
        mealie_category_slug: r.mealie_category_slug || null,
      };
    }

    let linked = 0;
    for (const meal of meals) {
      const match = mealieByName[meal.name.toLowerCase()];
      if (match?.slug) {
        let categoryName = match.mealie_category_name;
        let categorySlug = match.mealie_category_slug;
        if (!categoryName) {
          try {
            const recipe = await mealieSync.getRecipe(match.slug);
            const category = firstRecipeCategory(recipe);
            categoryName = category.name;
            categorySlug = category.slug;
          } catch {
            categoryName = null;
            categorySlug = null;
          }
        }
        await pool.query(
          `UPDATE meals
           SET mealie_recipe_slug = $1, mealie_category_name = $2, mealie_category_slug = $3
           WHERE id = $4`,
          [match.slug, categoryName, categorySlug, meal.id]
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

// GET /api/mealie/recipe-image/:recipeId — proxies recipe image from Mealie with auth
router.get('/recipe-image/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    // Validate: Mealie recipe IDs are UUIDs
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipeId)) {
      return res.status(400).end();
    }
    const { url, apiKey } = await mealieSync.getSettings();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let imgRes;
    try {
      imgRes = await fetch(`${url}/api/media/recipes/${recipeId}/images/original.webp`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!imgRes.ok) return res.status(imgRes.status).end();
    const buffer = await imgRes.arrayBuffer();
    const ct = imgRes.headers.get('content-type') || '';
    const allowedTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];
    res.setHeader('Content-Type', allowedTypes.includes(ct) ? ct : 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).end();
  }
});

module.exports = router;
