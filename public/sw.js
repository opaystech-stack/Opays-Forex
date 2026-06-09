const CACHE_NAME = 'opaysfox-v1';
const STATIC_ASSETS = [
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
  // Skip non-GET or external requests (Supabase, Gemini API, etc.)
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // For HTML navigation requests: ALWAYS go network-first
  // This ensures new deployments are always picked up immediately
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          return networkResponse;
        })
        .catch(() => {
          // Only use cache as offline fallback
          return caches.match('./index.html');
        })
    );
    return;
  }

  // For JS/CSS bundles (hashed by Vite): network-first, no caching
  // Vite already hashes filenames, so each deploy has unique URLs
  if (e.request.url.match(/\/assets\/.*\.(js|css)$/)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For static assets (icons, manifest): cache-first is fine
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
