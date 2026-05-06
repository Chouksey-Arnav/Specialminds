// SpecialMinds Service Worker
// Enables offline use after first load — critical for students without reliable WiFi

const CACHE_NAME = 'specialminds-v1';
const OFFLINE_FALLBACK = '/offline.html';

// App shell — everything needed to run offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.html',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Lexend:wght@300;400;500;600&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache app shell — non-fatal if some fonts fail
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(err => console.warn('SW cache miss:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — those need network
  if (url.pathname.startsWith('/.netlify/functions/') ||
      url.pathname.startsWith('/api/')) {
    return; // Fall through to network
  }

  // Network-first for HTML pages (always fresh)
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache fresh copy
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match(OFFLINE_FALLBACK))
        )
    );
    return;
  }

  // Cache-first for everything else (fonts, scripts, styles)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(OFFLINE_FALLBACK));
    })
  );
});
