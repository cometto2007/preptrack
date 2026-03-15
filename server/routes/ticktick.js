const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { createTask, getTask, updateTask } = require('../services/ticktick');
const mealieSync = require('../services/mealieSync');

const TICKTICK_AUTH_URL  = 'https://ticktick.com/oauth/authorize';
const TICKTICK_TOKEN_URL = 'https://ticktick.com/oauth/token';
const SHOPPING_LIST_TITLE = 'PrepTrack — Shopping List';

// Single-use state + redirect URI stored together to prevent CSRF on the OAuth callback
let pendingOAuth = null; // { state, redirectUri }

// GET /api/ticktick/auth — start OAuth flow
router.get('/auth', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'ticktick_client_id'"
    );
    const clientId = rows[0]?.value?.trim();
    if (!clientId) {
      return res.status(400).send('ticktick_client_id not configured in Settings');
    }

    const forwardedHost  = req.get('x-forwarded-host');
    const forwardedProto = req.get('x-forwarded-proto');
    const host  = forwardedHost  || req.get('host');
    const proto = forwardedProto || req.protocol;
    const redirectUri = `${proto}://${host}/api/ticktick/callback`;

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuth = { state, redirectUri };

    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'tasks:write tasks:read',
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });

    res.redirect(`${TICKTICK_AUTH_URL}?${params}`);
  } catch (err) {
    console.error('[ticktick] auth error:', err.message);
    res.status(500).send('Failed to initiate OAuth');
  }
});

// GET /api/ticktick/callback — exchange code for token, signal opener, close popup
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  function closePopup(result) {
    const msg = result === 'connected'
      ? 'Connected! You can close this window.'
      : 'Authentication failed. You can close this window.';
    res.send(`<!DOCTYPE html><html><head><title>TickTick</title></head><body>
      <p style="font-family:sans-serif;padding:2rem">${msg}</p>
      <script>
        try { window.opener.postMessage({ type: 'ticktick-oauth', result: ${JSON.stringify(result)} }, '*'); } catch(e) {}
        window.close();
      </script>
    </body></html>`);
  }

  if (error || !code) return closePopup('error');
  if (!pendingOAuth || state !== pendingOAuth.state) return closePopup('error');
  const { redirectUri } = pendingOAuth;
  pendingOAuth = null;

  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('ticktick_client_id', 'ticktick_client_secret')"
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (!cfg.ticktick_client_id || !cfg.ticktick_client_secret) {
      return closePopup('error');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let tokenRes;
    try {
      tokenRes = await fetch(TICKTICK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${cfg.ticktick_client_id}:${cfg.ticktick_client_secret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => tokenRes.statusText);
      console.error('[ticktick] token exchange failed:', tokenRes.status, text);
      return closePopup('error');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return closePopup('error');

    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('ticktick_api_token', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [accessToken]
    );

    // Reset shopping list state so the next addition creates a fresh task
    await pool.query(
      `DELETE FROM settings WHERE key IN (
        'ticktick_shopping_task_id', 'ticktick_shopping_project_id', 'ticktick_shopping_item_map', 'ticktick_shopping_created_at'
      )`
    );

    console.log('[ticktick] OAuth connected successfully');
    closePopup('connected');
  } catch (err) {
    console.error('[ticktick] callback error:', err.message);
    closePopup('error');
  }
});

// ---------------------------------------------------------------------------
// Ingredient categorisation
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS = {
  'Vegetables':     ['zucchini', 'courgette', 'onion', 'garlic', 'tomato', 'carrot', 'potato', 'sweet potato', 'bell pepper', 'capsicum', 'spinach', 'lettuce', 'celery', 'broccoli', 'cauliflower', 'cabbage', 'leek', 'mushroom', 'aubergine', 'eggplant', 'cucumber', 'pea', 'asparagus', 'artichoke', 'fennel', 'beetroot', 'beet', 'corn', 'kale', 'chard', 'rocket', 'arugula', 'parsnip', 'turnip', 'radish', 'spring onion', 'shallot', 'chilli', 'chili', 'pumpkin', 'squash', 'green bean', 'broad bean'],
  'Fruit':          ['apple', 'banana', 'lemon', 'lime', 'orange', 'grape', 'strawberry', 'blueberry', 'raspberry', 'mango', 'pineapple', 'peach', 'pear', 'plum', 'cherry', 'apricot', 'fig', 'kiwi', 'melon', 'watermelon', 'avocado', 'coconut', 'pomegranate', 'passion fruit', 'grapefruit'],
  'Meat':           ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'veal', 'mince', 'minced meat', 'sausage', 'bacon', 'ham', 'prosciutto', 'salami', 'chorizo', 'pancetta', 'steak', 'breast', 'thigh', 'drumstick', 'rib', 'loin', 'meatball', 'ground beef', 'ground pork'],
  'Fish & Seafood': ['salmon', 'tuna', 'cod', 'haddock', 'trout', 'sardine', 'anchovy', 'shrimp', 'prawn', 'lobster', 'crab', 'mussel', 'clam', 'squid', 'octopus', 'sea bass', 'mackerel', 'herring', 'tilapia', 'halibut', 'monkfish', 'swordfish', 'sea bream'],
  'Dairy & Eggs':   ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'parmesan', 'parmigiano', 'mozzarella', 'ricotta', 'cheddar', 'brie', 'feta', 'gorgonzola', 'mascarpone', 'crème fraîche', 'sour cream', 'ghee', 'whipping cream', 'double cream', 'single cream', 'half and half'],
  'Herbs & Spices': ['basil', 'oregano', 'thyme', 'rosemary', 'parsley', 'cilantro', 'coriander', 'mint', 'sage', 'tarragon', 'dill', 'bay leaf', 'chive', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'nutmeg', 'black pepper', 'white pepper', 'salt', 'ginger', 'cardamom', 'clove', 'allspice', 'saffron', 'vanilla', 'star anise', 'fennel seed', 'mustard seed'],
  'Pantry':         ['pasta', 'rice', 'flour', 'sugar', 'olive oil', 'vegetable oil', 'sunflower oil', 'vinegar', 'stock', 'broth', 'tomato paste', 'tomato sauce', 'canned tomato', 'tin tomato', 'breadcrumb', 'oat', 'honey', 'jam', 'mustard', 'soy sauce', 'worcestershire', 'baking powder', 'baking soda', 'yeast', 'lentil', 'chickpea', 'couscous', 'quinoa', 'noodle', 'coconut milk', 'fish sauce', 'oyster sauce', 'tahini', 'peanut butter'],
};

const CATEGORY_EMOJI = {
  'Vegetables':     '🥦',
  'Fruit':          '🍋',
  'Meat':           '🥩',
  'Fish & Seafood': '🐟',
  'Dairy & Eggs':   '🧀',
  'Herbs & Spices': '🌿',
  'Pantry':         '🫙',
  'Other':          '🛒',
};

// Display order at the supermarket
const CATEGORY_ORDER = ['Vegetables', 'Fruit', 'Meat', 'Fish & Seafood', 'Dairy & Eggs', 'Herbs & Spices', 'Pantry', 'Other'];

/**
 * Determine the supermarket category for a Mealie ingredient.
 * 1. Use Mealie's food.foodCategory if set.
 * 2. Keyword-match the food name.
 * 3. Default to "Other".
 */
function inferCategory(ing) {
  // Mealie stores foodCategory as a string or object {name}
  const raw = ing.food?.foodCategory;
  if (raw) {
    const name = typeof raw === 'string' ? raw.trim() : (raw.name || '').trim();
    if (name) return name;
  }
  const foodName = (ing.food?.name || ing.display || ing.note || '').toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => foodName.includes(kw))) return category;
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// Ingredient aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable aggregation key for a Mealie ingredient.
 * Keyed by food name only — different units of the same food merge into one item.
 */
function ingredientKey(ing) {
  if (ing.food?.name) {
    const name = ing.food.name.toLowerCase().trim();
    return `food|${name}`;
  }
  const display = (ing.display || ing.note || '').toLowerCase().trim().slice(0, 60);
  return `note|${display}`;
}

function fmtQty(qty) {
  if (qty == null) return '';
  return Number.isInteger(qty) ? String(qty) : parseFloat(qty.toFixed(2)).toString();
}

/**
 * Build a human-readable checklist item title from a map entry.
 * Amounts stored as [{qty, unit}] to support multiple units per ingredient.
 * Format: "🥦 Carrot — 1 whole + 700g (Spezzatino Light)"
 */
function buildItemTitle(entry) {
  const emoji = CATEGORY_EMOJI[entry.category] || CATEGORY_EMOJI['Other'];
  const name = entry.name || '';
  const sources = entry.sources.join(', ');

  const amounts = (entry.amounts || [])
    .map(a => [fmtQty(a.qty), a.unit].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' + ');

  // When no quantities are available, show ×N so repeated adds are visible
  const countSuffix = !amounts && (entry.count || 1) > 1 ? ` ×${entry.count}` : '';
  const left = [name + countSuffix, amounts ? `— ${amounts}` : ''].filter(Boolean).join(' ');
  return `${emoji} ${left} (${sources})`;
}

/**
 * Persist shopping list state (taskId, projectId, itemMap) to the settings table.
 */
async function saveShoppingState(taskId, projectId, itemMap, createdAt) {
  const upsert = `
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`;
  await pool.query(upsert, ['ticktick_shopping_task_id', taskId]);
  await pool.query(upsert, ['ticktick_shopping_project_id', projectId]);
  await pool.query(upsert, ['ticktick_shopping_item_map', JSON.stringify(itemMap)]);
  await pool.query(upsert, ['ticktick_shopping_created_at', createdAt || new Date().toISOString()]);
}

// ---------------------------------------------------------------------------
// POST /api/ticktick/shopping-list (Legacy - single recipe)
// Body: { slug, recipeName, portions? }
// ---------------------------------------------------------------------------
router.post('/shopping-list', async (req, res) => {
  try {
    const { slug, recipeName, portions } = req.body;
    if (!slug && !recipeName) {
      return res.status(400).json({ error: 'slug or recipeName required' });
    }

    // Delegate to the batch endpoint with a single recipe
    const syntheticReq = { ...req, body: { recipes: [{ slug, recipeName, portions }] } };
    return handleShoppingListBatch(syntheticReq, res);
  } catch (err) {
    console.error('[ticktick] shopping-list error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to add to shopping list' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ticktick/shopping-list-batch (v2 - multi-recipe with scaling)
// Body: {
//   recipes: [
//     { slug, recipeName, portions }
//   ]
// }
// portions: null = use full recipe yield (no scaling)
// ---------------------------------------------------------------------------
async function handleShoppingListBatch(req, res) {
  try {
    const { recipes } = req.body;
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'recipes must be a non-empty array' });
    }

    // Load TickTick credentials + shopping list state from settings
    const { rows } = await pool.query(
      `SELECT key, value FROM settings WHERE key IN (
        'ticktick_api_token', 'ticktick_list_id',
        'ticktick_shopping_task_id', 'ticktick_shopping_project_id', 'ticktick_shopping_item_map', 'ticktick_shopping_created_at'
      )`
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));

    if (!cfg.ticktick_api_token) {
      return res.status(503).json({ error: 'TickTick not configured — add API token in Settings' });
    }

    const token     = cfg.ticktick_api_token;
    const listId    = cfg.ticktick_list_id || null;
    let taskId      = cfg.ticktick_shopping_task_id || null;
    let projectId   = cfg.ticktick_shopping_project_id || null;

    // Auto-reset if the task is older than 7 days (new shopping week)
    if (taskId && cfg.ticktick_shopping_created_at) {
      const age = Date.now() - new Date(cfg.ticktick_shopping_created_at).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        taskId = null;
        projectId = null;
      }
    }

    // Parse the stored item map (key → { id, qty, unit, name, sources })
    let itemMap = {};
    try {
      if (cfg.ticktick_shopping_item_map) {
        itemMap = JSON.parse(cfg.ticktick_shopping_item_map);
      }
    } catch {
      itemMap = {};
    }

    // Check if the stored task still exists and whether it was completed
    // Also preserve item statuses from the existing task
    const statusById = {};
    if (taskId && projectId) {
      try {
        const existing = await getTask(token, projectId, taskId);
        if (!existing) {
          // Task was deleted — start fresh
          taskId = null; projectId = null; itemMap = {};
        } else if (existing.status === 2) {
          // Task was completed — reuse the task but clear the ingredient list
          itemMap = {};
        } else {
          // Task exists - preserve item statuses
          if (existing.items) {
            existing.items.forEach(item => {
              statusById[item.id] = item.status;
            });
          }
        }
      } catch (err) {
        console.warn('[ticktick] Failed to fetch existing task from TickTick:', err.message);
        // Proceed optimistically with stored state
      }
    }

    // Aggregate ingredients from all recipes with scaling
    let added = 0;
    let merged = 0;
    const touchedIds = new Set(); // items added/merged this request — will be reset to unchecked

    for (const { slug, recipeName, portions } of recipes) {
      // Handle recipeName-only entries (no slug) - add as note items
      let title = recipeName || slug;
      
      if (!slug) {
        // No slug - add a plain note item
        const noteKey = `note|${title.toLowerCase().slice(0, 60)}`;
        if (!itemMap[noteKey]) {
          itemMap[noteKey] = {
            id: crypto.randomBytes(4).toString('hex'),
            amounts: [],
            name: title,
            sources: [title],
          };
          added++;
        }
        continue;
      }

      // Fetch recipe from Mealie to get ingredients and recipeServings
      let rawIngredients = [];
      let recipeServings = null;
      
      try {
        const recipe = await mealieSync.getRecipe(slug);
        title = recipe.name || title;
        rawIngredients = recipe.recipeIngredient || recipe.recipe_ingredient || [];
        recipeServings = recipe.recipeServings || recipe.recipe_servings || recipe.recipe_yield || null;
      } catch (err) {
        console.warn(`[ticktick] Failed to fetch recipe "${slug}" from Mealie:`, err.message);
        const noteKey = `note|${title.toLowerCase().slice(0, 60)}`;
        if (!itemMap[noteKey]) {
          itemMap[noteKey] = {
            id: crypto.randomBytes(4).toString('hex'),
            amounts: [],
            name: title,
            sources: [title],
          };
          added++;
        }
        continue;
      }

      // Calculate scale factor
      // portions = number of batches to cook (multiplier, e.g. 2 = double all ingredients)
      let scaleFactor = 1.0;
      if (portions != null) {
        scaleFactor = Number(portions) || 1.0;
      }


      // Per-recipe dedup: prevents double-counting if Mealie has duplicate ingredient rows
      // Reset for each recipe so intentionally adding the same recipe twice still works
      const seenThisRecipe = new Set();

      for (const ing of rawIngredients) {
        const key = ingredientKey(ing);
        const foodName = ing.food?.name || ing.display || ing.note || '';
        if (!foodName && !ing.display && !ing.note) continue;

        // Get base quantity and scale it
        const baseQty = typeof ing.quantity === 'number' ? ing.quantity : null;
        const scaledQty = baseQty != null ? baseQty * scaleFactor : null;
        const unit = ing.unit?.name || null;
        
        // Skip duplicate (food + unit) entries within the same recipe
        const dedupKey = `${key}|${unit || ''}`;
        if (seenThisRecipe.has(dedupKey)) continue;
        seenThisRecipe.add(dedupKey);

        if (itemMap[key]) {
          const entry = itemMap[key];
          const existing = entry.amounts.find(a => (a.unit || '') === (unit || ''));
          if (existing) {
            if (scaledQty != null && existing.qty != null) existing.qty += scaledQty;
          } else {
            entry.amounts.push({ qty: scaledQty, unit });
          }
          if (!entry.sources.includes(title)) entry.sources.push(title);
          entry.count = (entry.count || 1) + 1;
          touchedIds.add(entry.id);
          merged++;
        } else {
          const newEntry = {
            id: crypto.randomBytes(4).toString('hex'),
            amounts: [{ qty: scaledQty, unit }],
            count: 1,
            name: foodName,
            category: inferCategory(ing),
            sources: [title],
          };
          itemMap[key] = newEntry;
          touchedIds.add(newEntry.id);
          added++;
        }
      }

      // If no structured ingredients, add a plain note item
      if (rawIngredients.length === 0) {
        const noteKey = `note|${title.toLowerCase().slice(0, 60)}`;
        if (!itemMap[noteKey]) {
          itemMap[noteKey] = {
            id: crypto.randomBytes(4).toString('hex'),
            amounts: [],
            name: title,
            sources: [title],
          };
          added++;
        }
      }
    }

    // Rebuild the items array sorted by supermarket category order
    const items = Object.values(itemMap)
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category || 'Other');
        const bi = CATEGORY_ORDER.indexOf(b.category || 'Other');
        const catDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        if (catDiff !== 0) return catDiff;
        return (a.name || '').localeCompare(b.name || '');
      })
      .map(entry => ({
        id: entry.id,
        title: buildItemTitle(entry),
        // Items touched this request are reset to unchecked so they show up as new
        status: touchedIds.has(entry.id) ? 0 : (statusById[entry.id] ?? 0),
      }));

    // Create or update the TickTick task
    let savedTask;
    const updateBody = { id: taskId, projectId, title: SHOPPING_LIST_TITLE, status: 0, items };

    if (taskId) {
      try {
        savedTask = await updateTask(token, taskId, updateBody);
      } catch (err) {
        console.warn('[ticktick] Failed to update TickTick task:', err.message);
        // Task was permanently deleted or update failed — fall through to create a fresh one
        // Do NOT reset itemMap — the current session's accumulated ingredients must be preserved
        taskId = null;
        projectId = null;
      }
    }

    const isNewTask = !taskId;
    if (!taskId) {
      // Step 1: create empty task to obtain its ID
      savedTask = await createTask(token, listId, SHOPPING_LIST_TITLE, '');
      taskId    = savedTask.id;
      projectId = savedTask.projectId || listId;
      // Step 2: update with the full items list
      savedTask = await updateTask(token, taskId, {
        ...updateBody, id: taskId, projectId,
      });
    }

    // Persist state for next call — preserve original createdAt when updating existing task
    const createdAt = isNewTask ? new Date().toISOString() : cfg.ticktick_shopping_created_at;
    await saveShoppingState(taskId, projectId, itemMap, createdAt);

    res.json({ ok: true, added, merged });
  } catch (err) {
    console.error('[ticktick] shopping-list-batch error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to add to shopping list' });
  }
}

// Route handler for the batch endpoint
router.post('/shopping-list-batch', handleShoppingListBatch);

// POST /api/ticktick/reset-shopping-list — clear persisted task state so next add creates a fresh task
router.post('/reset-shopping-list', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM settings WHERE key IN (
        'ticktick_shopping_task_id', 'ticktick_shopping_project_id', 'ticktick_shopping_item_map', 'ticktick_shopping_created_at'
      )`
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ticktick] reset error:', err.message);
    res.status(500).json({ error: 'Failed to reset shopping list' });
  }
});

module.exports = router;
