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
      scope: 'tasks:write',
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
        try { window.opener.postMessage({ type: 'ticktick-oauth', result: '${result}' }, '*'); } catch(e) {}
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
        'ticktick_shopping_task_id', 'ticktick_shopping_project_id', 'ticktick_shopping_item_map'
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
// Ingredient aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable aggregation key for a Mealie ingredient.
 * Same food + same unit → merge. Same food + different unit → separate item.
 * Ingredients with no food.id (notes/display) are keyed by their display text.
 */
function ingredientKey(ing) {
  if (ing.food?.id) {
    const unit = (ing.unit?.name || '').toLowerCase().trim();
    return `food|${ing.food.id}|${unit}`;
  }
  const display = (ing.display || ing.note || '').toLowerCase().trim().slice(0, 60);
  return `note|${display}`;
}

/**
 * Build a human-readable checklist item title from a map entry.
 * Format: "Zucchini — 4 whole (Recipe A, Recipe B)"
 */
function buildItemTitle(entry) {
  let qty = '';
  if (entry.qty != null && entry.qty > 0) {
    // Show as integer if whole number, otherwise 2 decimal places max
    qty = Number.isInteger(entry.qty)
      ? String(entry.qty)
      : parseFloat(entry.qty.toFixed(2)).toString();
  }
  const unit = entry.unit || '';
  const name = entry.name || '';
  const sources = entry.sources.join(', ');

  let amount = [qty, unit].filter(Boolean).join(' ');
  let left = [name, amount ? `— ${amount}` : ''].filter(Boolean).join(' ');
  return `${left} (${sources})`;
}

/**
 * Persist shopping list state (taskId, projectId, itemMap) to the settings table.
 */
async function saveShoppingState(taskId, projectId, itemMap) {
  const upsert = `
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`;
  await pool.query(upsert, ['ticktick_shopping_task_id', taskId]);
  await pool.query(upsert, ['ticktick_shopping_project_id', projectId]);
  await pool.query(upsert, ['ticktick_shopping_item_map', JSON.stringify(itemMap)]);
}

// ---------------------------------------------------------------------------
// POST /api/ticktick/shopping-list
// Body: { slug, recipeName }
// ---------------------------------------------------------------------------
router.post('/shopping-list', async (req, res) => {
  try {
    const { slug, recipeName } = req.body;
    if (!slug && !recipeName) {
      return res.status(400).json({ error: 'slug or recipeName required' });
    }

    // Load TickTick credentials + shopping list state from settings
    const { rows } = await pool.query(
      `SELECT key, value FROM settings WHERE key IN (
        'ticktick_api_token', 'ticktick_list_id',
        'ticktick_shopping_task_id', 'ticktick_shopping_project_id', 'ticktick_shopping_item_map'
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

    // Parse the stored item map (key → { id, qty, unit, name, sources })
    let itemMap = {};
    try {
      if (cfg.ticktick_shopping_item_map) {
        itemMap = JSON.parse(cfg.ticktick_shopping_item_map);
      }
    } catch {
      itemMap = {};
    }

    // Fetch recipe ingredients from Mealie
    let title = recipeName || slug;
    let rawIngredients = [];
    if (slug) {
      try {
        const recipe = await mealieSync.getRecipe(slug);
        title = recipe.name || title;
        rawIngredients = recipe.recipeIngredient || recipe.recipe_ingredient || [];
      } catch {
        // Mealie unavailable — add a note-only item
        rawIngredients = [];
      }
    }

    // Try to fetch the existing shopping list task
    let existingItems = []; // TickTick items array from current task
    if (taskId && projectId) {
      try {
        const existingTask = await getTask(token, projectId, taskId);
        if (existingTask) {
          existingItems = existingTask.items || [];
        } else {
          // Task was deleted or completed — start fresh
          taskId = null;
          projectId = null;
          itemMap = {};
        }
      } catch {
        // Can't reach TickTick — proceed with local state optimistically
      }
    }

    // Build a status map from existing items so we preserve checked state
    const statusById = {};
    for (const item of existingItems) {
      if (item.id != null) statusById[String(item.id)] = item.status ?? 0;
    }

    // Aggregate new ingredients into the item map
    let added = 0;
    let merged = 0;

    for (const ing of rawIngredients) {
      const key = ingredientKey(ing);
      const foodName = ing.food?.name || ing.display || ing.note || '';
      if (!foodName && !ing.display && !ing.note) continue; // skip empty

      const qty  = typeof ing.quantity === 'number' ? ing.quantity : null;
      const unit = ing.unit?.name || null;

      if (itemMap[key]) {
        // Existing ingredient — merge quantity and append recipe source
        const entry = itemMap[key];
        if (qty != null && entry.qty != null) {
          entry.qty += qty;
        }
        if (!entry.sources.includes(title)) {
          entry.sources.push(title);
        }
        merged++;
      } else {
        // New ingredient — add to map with a fresh random ID
        itemMap[key] = {
          id: crypto.randomBytes(4).toString('hex'),
          qty,
          unit,
          name: foodName,
          sources: [title],
        };
        added++;
      }
    }

    // If no structured ingredients, add a plain note item
    if (rawIngredients.length === 0) {
      const key = `note|${title.toLowerCase().slice(0, 60)}`;
      if (!itemMap[key]) {
        itemMap[key] = {
          id: crypto.randomBytes(4).toString('hex'),
          qty: null,
          unit: null,
          name: title,
          sources: [title],
        };
        added++;
      }
    }

    // Rebuild the items array from the map (preserve checked state for existing IDs)
    const items = Object.values(itemMap).map(entry => ({
      id: entry.id,
      title: buildItemTitle(entry),
      status: statusById[entry.id] ?? 0,
    }));

    // Create or update the TickTick task
    let savedTask;
    if (taskId) {
      savedTask = await updateTask(token, taskId, {
        id: taskId,
        projectId,
        title: SHOPPING_LIST_TITLE,
        items,
      });
    } else {
      savedTask = await createTask(token, listId, SHOPPING_LIST_TITLE, '', []);
      // createTask returns the task — now update it with structured items
      // (some TickTick API versions ignore items on create, so we always update after)
      taskId    = savedTask.id;
      projectId = savedTask.projectId || listId;
      savedTask = await updateTask(token, taskId, {
        id: taskId,
        projectId,
        title: SHOPPING_LIST_TITLE,
        items,
      });
    }

    // Persist state for next call
    await saveShoppingState(taskId, projectId, itemMap);

    res.json({ ok: true, added, merged });
  } catch (err) {
    console.error('[ticktick] shopping-list error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to add to shopping list' });
  }
});

module.exports = router;
