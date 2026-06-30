const CACHE_NAME = 'opaysfox-v5';
const STATIC_ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately, don't wait for old SW to finish
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Delete ALL old caches to prevent stale content
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Skip non-GET or external requests
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(e.request.url);

  // Skip API requests (always go directly to the network)
  if (url.pathname.startsWith('/api')) {
    return;
  }

  // For HTML navigation: ALWAYS network-first
  // This ensures new versions are always picked up
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((response) => {
          // Don't cache 4xx/5xx responses
          if (!response || response.status >= 400) {
            return response;
          }
          return response;
        })
        .catch(() => {
          // Z1 — Repli vers le shell mis en cache UNIQUEMENT hors-ligne.
          // Un réseau lent/instable (mobile) ne doit PAS démarrer l'app sur un
          // `index.html` mis en cache « sans session » : tant qu'on est en ligne
          // on reste strictement network-first et on laisse l'échec remonter.
          if (navigator.onLine === false) {
            return caches.match('./index.html');
          }
          return Response.error();
        })
    );
    return;
  }

  // For version.json: ALWAYS network-first, never cache
  if (url.pathname === '/version.json') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // For JS/CSS bundles with hash: network-first with fallback to cache
  if (url.pathname.match(/\/assets\/.*\.(js|css)$/) || url.pathname.match(/^\/(\w+)-[a-f0-9]+\.(js|css)$/)) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
    return;
  }

  // For static assets (icons, fonts, images): cache-first
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
