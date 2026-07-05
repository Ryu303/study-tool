// Neo-Synapse BioMap - Service Worker for 100% Offline PWA Usage

const CACHE_NAME = 'biomap-ledger-v1.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './graph.js',
  './ingest.js',
  './quiz.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // CDN elements like fonts and icons will be cached on intercept
];

// Install Event - Pre-cache essential app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching local application shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up stale cache files from older builds
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache storage:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Serve assets offline (Network first, falling back to Cache if unavailable)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests (bypass chrome extensions, POST, etc.)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid network response, cache it dynamically for future offline fallback
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        console.log('[Service Worker] Offline fallback triggered for:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If offline and request is HTML, return root document
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
