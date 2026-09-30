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

/* F-323/F-236: the real push/notificationclick handler lives in
 * scripts/shared-sw-push-handler.js (one source, not duplicated across apps -- SonarCloud
 * flagged this exact block as 45.5% duplication once this app's own copy of admin-v2's
 * handler was added). No backend push payload carries data.url yet (confirmed: resolveAndQueue's
 * NotificationRequest has no such field) -- notificationclick falls back to '/' until that's
 * built, same as admin-v2's own "no backend trigger yet" state when this was first added there.
 * This marker is replaced with the real code in dist/sw.js at build time by
 * scripts/inject-push-sw-handler.mjs. */
/* __PUSH_NOTIFICATION_HANDLER__ */
