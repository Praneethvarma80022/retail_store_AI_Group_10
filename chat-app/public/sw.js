const CACHE_NAME = 'retail-ai-v1';
const RUNTIME_CACHE = 'retail-ai-runtime-v1';
const API_CACHE = 'retail-ai-api-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/index.css',
  '/src/Mobile.css'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore errors for missing assets in development
      });
    })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== API_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first for API calls, Cache first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls - Network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((response) => {
            return response || new Response(
              JSON.stringify({ error: 'Offline - cached data unavailable' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets - Cache first
  if (request.method === 'GET' && 
      (request.destination === 'style' || 
       request.destination === 'script' || 
       request.destination === 'image' ||
       request.destination === 'font')) {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request).then((response) => {
          if (response.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Default - Network first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.method === 'GET') {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).catch(() => {
          return new Response('No data available', { status: 503 });
        });
      })
  );
});

// Message event - for cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
