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
  list:       ()            => api.get('/meals'),
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
  get:            ()       => api.get('/settings'),
  update:         (data)   => api.put('/settings', data),
  getSchedule:    ()       => api.get('/settings/schedule'),
  updateSchedule: (day, d) => api.put(`/settings/schedule/${day}`, d),
};

// Mealie
export const mealieApi = {
  searchRecipes: (q = '', page = 1, perPage = 20) =>
    api.get(`/mealie/recipes?q=${encodeURIComponent(q)}&page=${page}&perPage=${perPage}`),
  getMealPlan: (start, days = 7) =>
    api.get(`/mealie/meal-plan?start=${start}&days=${days}`),
  sync: () => api.post('/mealie/sync', {}),
};

// Notifications
export const notificationsApi = {
  getPending:  ()          => api.get('/notifications/pending'),
  subscribe:   (sub)       => api.post('/notifications/subscribe', sub),
  unsubscribe: (endpoint)  => api.post('/notifications/unsubscribe', { endpoint }),
  resolve:     (id, action)=> api.post(`/notifications/resolve/${id}`, { action }),
};
