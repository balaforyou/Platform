/* Slotflow Admin service worker (F-197 / §7 of the signed Slice 1 plan).
 *
 * Not the bare pass-through stub any more:
 *  - cache name carries the build SHA; activate() deletes every other admin-v2 cache
 *  - app shell: cache-first, network fill, clone-to-cache
 *  - live data (/api/*): network-first, cache fallback
 *  - both miss  -> a real 503 Response, never an unhandled rejection
 *  - push / notificationclick wired for F-044 Phase B (no backend trigger yet)
 *
 * The SHA is substituted at build time by scripts/stamp-sw.mjs. In `vite dev` the
 * raw placeholder is served, so it degrades to "dev".
 */

const RAW_SHA = '__BUILD_SHA__';
const BUILD_SHA = RAW_SHA.startsWith('__BUILD_') ? 'dev' : RAW_SHA;
const SHELL_CACHE = `admin-v2-shell-${BUILD_SHA}`;
const OWNED_CACHE_PREFIX = 'admin-v2-shell-';

const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        /* a shell URL 404ing must not wedge the install */
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(OWNED_CACHE_PREFIX) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      // Self-heal devices that cached Vite dev modules under an earlier SW (see
      // isShellRequest) — drop any such entries so a stale module can't be served.
      try {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.keys();
        await Promise.all(
          cached
            .filter((req) => {
              const p = new URL(req.url).pathname;
              return p.startsWith('/node_modules/') || p.startsWith('/@') || p.startsWith('/src/');
            })
            .map((req) => cache.delete(req)),
        );
      } catch {
        /* best effort */
      }
      await self.clients.claim();
    })(),
  );
});

function offlineResponse(request) {
  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline — Slotflow Admin</title>' +
        '<body style="font-family:system-ui;margin:0;padding:3rem;text-align:center">' +
        '<h1>You’re offline</h1><p>Slotflow Admin can’t reach the network and this page isn’t cached yet.</p>',
      { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  return new Response(
    JSON.stringify({ error: { code: 'OFFLINE', message: 'No network connection and no cached copy.' } }),
    { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'application/json' } },
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    return offlineResponse(request);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineResponse(request);
  }
}

function isShellRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  // Vite dev-server internals — never cache-first these. Their `?v=<hash>` query rotates
  // on every dependency re-optimization, and cacheFirst's `ignoreSearch: true` would pin
  // a stale module indefinitely (a pre-token-slice bundle that lacks a newer export ->
  // SyntaxError -> blank page). Absent in production builds (everything lands in /assets/),
  // so this is a no-op there. Added in sub-slice 0.1 (dated plan addendum).
  if (
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/')
  ) {
    return false;
  }
  return (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    /\.(?:js|mjs|css|png|svg|ico|json|webmanifest|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isShellRequest(request, url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(fetch(request).catch(() => offlineResponse(request)));
});

/* ── F-044 Phase B: client-side notification half, ready ahead of any backend push ── */

self.addEventListener('push', (event) => {
  let payload = { title: 'Slotflow Admin', body: 'You have a new notification.', data: {} };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
