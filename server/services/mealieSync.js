// Mealie API service — Node 18+ fetch, in-memory cache (5 min TTL)
const pool = require('../db/connection');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map(); // key -> { data, ts }

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

async function getSettings() {
  const { rows } = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('mealie_url', 'mealie_api_key')"
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const url = (map.mealie_url || '').trim().replace(/\/$/, '');
  const apiKey = (map.mealie_api_key || '').trim();
  if (!url || !apiKey) {
    throw new Error('Mealie is not configured. Set mealie_url and mealie_api_key in Settings.');
  }
  // Validate URL — only allow http/https (self-hosted Mealie on local network is a valid use case)
  let parsed;
  try { parsed = new URL(url); } catch {
    throw new Error('mealie_url is not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('mealie_url must use http or https.');
  }
  return { url, apiKey };
}

async function mealieRequest(url, apiKey, path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const fullPath = `${path}${qs ? '?' + qs : ''}`;
  // Include a hash of apiKey in cache key so rotating the key invalidates cached responses
  const cacheKey = `${url}|${apiKey.slice(-8)}${fullPath}`;

  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(`${url}/api${fullPath}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Mealie API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

async function searchRecipes(q = '', page = 1, perPage = 20) {
  const { url, apiKey } = await getSettings();
  const data = await mealieRequest(url, apiKey, '/recipes', {
    search: q,
    page,
    perPage,
  });
  const items = data.items || [];
  return items.map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description || '',
    imageId: r.id, // Mealie uses recipe id for image path
    mealie_category_name: Array.isArray(r.recipeCategory) && r.recipeCategory.length > 0
      ? (r.recipeCategory[0].name || null)
      : null,
    mealie_category_slug: Array.isArray(r.recipeCategory) && r.recipeCategory.length > 0
      ? (r.recipeCategory[0].slug || null)
      : null,
  }));
}

async function getMealPlan(startDate, endDate) {
  const { url, apiKey } = await getSettings();
  const perPage = 100;
  let page = 1;
  let allItems = [];
  // Meal plan data changes frequently — bypass the cache entirely
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      const qs = new URLSearchParams({ start_date: startDate, end_date: endDate, page, perPage }).toString();
      res = await fetch(`${url}/api/households/mealplans?${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Mealie API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const items = data.items || [];
    allItems = allItems.concat(items);
    if (items.length < perPage) break;
    page++;
  }
  return allItems;
}

async function getRecipe(slug) {
  const { url, apiKey } = await getSettings();
  return mealieRequest(url, apiKey, `/recipes/${encodeURIComponent(slug)}`);
}

/**
 * Group raw Mealie meal plan entries by date + broad meal type (lunch/dinner).
 * - 'lunch' entries → lunch
 * - 'dinner', 'side', 'dessert', 'drink', 'snack' → dinner
 * - 'breakfast' and unknown types → ignored
 * - Duplicate slugs within a group are collapsed into quantity > 1
 *
 * Returns: Array<{ date, mealType, recipes: Array<{ mealieId, slug, name, quantity }> }>
 */
function groupMealPlanEntries(rawEntries) {
  function broadType(rawType) {
    const t = (rawType || '').toLowerCase().trim();
    if (t === 'lunch') return 'lunch';
    if (['dinner', 'side', 'dessert', 'drink', 'snack'].includes(t)) return 'dinner';
    return null;
  }

  const groups = new Map(); // "date:mealType" -> { date, mealType, recipeMap: Map<slug, recipe> }

  for (const entry of rawEntries) {
    const date = entry.date;
    const rawType = entry.entry_type || entry.entryType || '';
    const mealType = broadType(rawType);
    if (!date || !mealType || !entry.recipe?.slug) continue;

    const key = `${date}:${mealType}`;
    if (!groups.has(key)) {
      groups.set(key, { date, mealType, recipeMap: new Map() });
    }

    const group = groups.get(key);
    const slug = entry.recipe.slug;
    if (group.recipeMap.has(slug)) {
      group.recipeMap.get(slug).quantity++;
    } else {
      group.recipeMap.set(slug, {
        mealieId: entry.recipe.id || null,
        slug,
        name: entry.recipe.name || slug,
        quantity: 1,
      });
    }
  }

  return Array.from(groups.values()).map(({ date, mealType, recipeMap }) => ({
    date,
    mealType,
    recipes: Array.from(recipeMap.values()),
  }));
}

module.exports = { searchRecipes, getMealPlan, getSettings, getRecipe, groupMealPlanEntries };
