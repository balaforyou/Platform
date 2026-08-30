// Minimal service worker to satisfy PWA installability requirements (F-197).
// Fetch pass-through only — ported near-verbatim from apps/guest-member-pwa/public/sw.js,
// cache key renamed. admin-v2 has no offline story in Slice 1; this exists purely so
// Chrome/Android offer "Install app".

const CACHE_NAME = 'admin-v2-cache-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
