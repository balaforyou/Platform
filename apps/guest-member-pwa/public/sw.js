// Minimal service worker to satisfy PWA installability requirements.
// Does fetch pass-through to meet Google Chrome installation criteria.

const CACHE_NAME = 'badminton-pwa-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch handler is enough to pass PWA audits.
  event.respondWith(fetch(event.request));
});
