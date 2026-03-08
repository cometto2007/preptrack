const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { createTask } = require('../services/ticktick');
const mealieSync = require('../services/mealieSync');

const TICKTICK_AUTH_URL  = 'https://ticktick.com/oauth/authorize';
const TICKTICK_TOKEN_URL = 'https://ticktick.com/oauth/token';

// Single-use state + redirect URI stored together to prevent CSRF on the OAuth callback
let pendingOAuth = null; // { state, redirectUri }

// GET /api/ticktick/auth?origin=<browser-origin> — start OAuth flow
router.get('/auth', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'ticktick_client_id'"
    );
    const clientId = rows[0]?.value?.trim();
    if (!clientId) {
      return res.status(400).send('ticktick_client_id not configured in Settings');
    }

    // Build the redirect URI from the browser-facing host.
    // Vite's proxy (changeOrigin:true) sets X-Forwarded-Host to the original
    // browser host (e.g. localhost:5173), which is what must be registered in
    // the TickTick developer portal. In production a real reverse proxy does
    // the same. Fall back to the actual Host header if no forwarding header exists.
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

    console.log('[ticktick] OAuth connected successfully');
    closePopup('connected');
  } catch (err) {
    console.error('[ticktick] callback error:', err.message);
    closePopup('error');
  }
});

/**
 * POST /api/ticktick/shopping-list
 * Body: { slug, recipeName }
 * Fetches ingredients from Mealie and creates a TickTick task.
 */
router.post('/shopping-list', async (req, res) => {
  try {
    const { slug, recipeName } = req.body;
    if (!slug && !recipeName) {
      return res.status(400).json({ error: 'slug or recipeName required' });
    }

    // Load TickTick credentials from settings
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('ticktick_api_token', 'ticktick_list_id')"
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (!cfg.ticktick_api_token) {
      return res.status(503).json({ error: 'TickTick not configured — add API token in Settings' });
    }

    // Fetch recipe from Mealie to get ingredients
    let ingredients = [];
    let title = recipeName || slug;
    if (slug) {
      try {
        const recipe = await mealieSync.getRecipe(slug);
        title = recipe.name || title;
        // Support both snake_case (recipe_ingredient) and camelCase (recipeIngredient)
        // across Mealie API versions
        const rawIngredients = recipe.recipeIngredient || recipe.recipe_ingredient || [];
        ingredients = rawIngredients.map(ing => {
          const qty  = ing.quantity ? `${ing.quantity} ` : '';
          const unit = (ing.unit?.name || ing.unit) ? `${ing.unit?.name || ing.unit} ` : '';
          const food = ing.food?.name || ing.food || ing.note || ing.display || '';
          return `${qty}${unit}${food}`.trim();
        }).filter(Boolean);
      } catch {
        // Mealie unavailable — create task with just the recipe name
      }
    }

    await createTask(
      cfg.ticktick_api_token,
      cfg.ticktick_list_id || 'inbox',
      title,
      ingredients.length > 0 ? '' : 'No ingredient data available — check Mealie for details.',
      ingredients,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ticktick] shopping-list error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to add to shopping list' });
  }
});

module.exports = router;
