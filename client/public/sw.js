// PrepTrack Service Worker — Phase 5
// Bump CACHE_VERSION on each deployment to evict stale assets from all clients.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `preptrack-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
];

// ── Install: pre-cache static shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  clients.claim();
});

// ── Fetch: cache-first for static, network-first for API ────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API calls: network-first, no cache fallback.
  // Skip navigate-mode requests (OAuth redirects, etc.) — let the browser handle them natively.
  if (url.pathname.startsWith('/api/')) {
    if (request.mode === 'navigate') return;
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Cache successful GET responses for static assets
        if (response.ok && request.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    }).catch(() => {
      // App shell fallback only for document navigations (SPA routing)
      if (request.mode === 'navigate') {
        return caches.match('/index.html');
      }
      return new Response(null, { status: 503 });
    })
  );
});

// ── Push: show notification ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'PrepTrack', {
      body: data.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: data.url,
      actions: data.actions || [],
      tag: 'preptrack-prompt', // collapses duplicate notifications
      renotify: false,
    })
  );
});

// ── Notification click: focus or open app ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Reuse an existing tab if one is open
      const existing = windowClients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(url).catch(() => clients.openWindow(url));
      }
      return clients.openWindow(url);
    })
  );
});
