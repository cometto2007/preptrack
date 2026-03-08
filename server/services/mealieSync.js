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
  return { url, apiKey };
}

async function mealieRequest(url, apiKey, path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const fullPath = `${path}${qs ? '?' + qs : ''}`;
  const cacheKey = `${url}${fullPath}`;

  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const res = await fetch(`${url}/api${fullPath}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

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
  }));
}

async function getMealPlan(startDate, endDate) {
  const { url, apiKey } = await getSettings();
  const data = await mealieRequest(url, apiKey, '/meal-plans', {
    start_date: startDate,
    end_date: endDate,
  });
  return data.items || [];
}

module.exports = { searchRecipes, getMealPlan, getSettings };
