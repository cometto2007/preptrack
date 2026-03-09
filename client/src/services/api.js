const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path)        => request(path),
  post:   (path, body)  => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)  => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)        => request(path, { method: 'DELETE' }),
};

// Meals
export const mealsApi = {
  list:       (category, options = {})    => {
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (options.includeEmpty) qs.set('include_empty', '1');
    const suffix = qs.toString();
    return api.get(`/meals${suffix ? `?${suffix}` : ''}`);
  },
  get:        (id)          => api.get(`/meals/${id}`),
  create:     (data)        => api.post('/meals', data),
  update:     (id, data)    => api.put(`/meals/${id}`, data),
  remove:     (id)          => api.delete(`/meals/${id}`),
  increment:  (id, data)    => api.post(`/meals/${id}/increment`, data),
  decrement:  (id, data)    => api.post(`/meals/${id}/decrement`, data),
};

// Batches
export const batchesApi = {
  list:   (mealId) => api.get(`/batches${mealId ? `?meal_id=${encodeURIComponent(mealId)}` : ''}`),
  remove: (id)     => api.delete(`/batches/${id}`),
};

// Settings
export const settingsApi = {
  get:              ()              => api.get('/settings'),
  update:           (data)         => api.put('/settings', data),
  getSchedule:      ()             => api.get('/settings/schedule'),
  updateSchedule:   (day, d)       => api.put(`/settings/schedule/${day}`, d),
  getOverrides:     ()             => api.get('/settings/overrides'),
  addOverride:      (data)         => api.post('/settings/overrides', data),
  deleteOverride:   (ws, dow, mt)  => api.delete(`/settings/overrides/${ws}/${dow}/${mt}`),
  export:           ()             => fetch('/api/settings/export').then(r => r.blob()),
  clearInventory:   ()             => api.delete('/settings/clear-inventory'),
};

// Mealie
export const mealieApi = {
  searchRecipes: (q = '', page = 1, perPage = 20) =>
    api.get(`/mealie/recipes?q=${encodeURIComponent(q)}&page=${page}&perPage=${perPage}`),
  getRecipe: (slug) =>
    api.get(`/mealie/recipe/${encodeURIComponent(slug)}`),
  getMealPlan: (start, days = 7) =>
    api.get(`/mealie/meal-plan?start=${start}&days=${days}`),
  sync: () => api.post('/mealie/sync', {}),
};

// Categories
export const categoriesApi = {
  list: () => api.get('/categories'),
};

// TickTick
export const ticktickApi = {
  addToShoppingList: (slug, recipeName) =>
    api.post('/ticktick/shopping-list', { slug, recipeName }),
  resetShoppingList: () =>
    api.post('/ticktick/reset-shopping-list', {}),
};

// Notifications
export const notificationsApi = {
  getPending:      ()                   => api.get('/notifications/pending'),
  getVapidKey:     ()                   => api.get('/notifications/vapid-public-key'),
  subscribe:       (sub)                => api.post('/notifications/subscribe', sub),
  unsubscribe:     (endpoint)           => api.post('/notifications/unsubscribe', { endpoint }),
  resolve:         (id, data)           => api.post(`/notifications/resolve/${id}`, data),
  resolveGroup:    (resolutions)        => api.post('/notifications/resolve-group', { resolutions }),
};
