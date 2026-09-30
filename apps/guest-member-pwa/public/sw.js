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

/* F-323: client-side push half, ported from apps/admin-v2/public/sw.js -- generic and
 * copy-paste-ready except the fallback title (this app has no admin-only "Slotflow Admin"
 * default). No backend push payload carries data.url yet (confirmed: resolveAndQueue's
 * NotificationRequest has no such field) -- notificationclick falls back to '/' until that's
 * built, same as admin-v2's own "no backend trigger yet" state when this was first added there. */

self.addEventListener('push', (event) => {
  const fallback = { title: 'Slotflow', body: 'You have a new notification.', data: {} };
  let payload = fallback;
  if (event.data) {
    try {
      // F-236: the real FCM message (services/notification/src/firebase.ts's sendPush) nests
      // title/body under a `notification` key on the wire -- a flat spread merge here (this
      // file's own original F-323 port of admin-v2's handler) never overwrote the hardcoded
      // fallback above, so a real push showed generic text regardless of the real event.
      // Confirmed live: Bala's real booking_confirmed push read "You have a new notification"
      // instead of the real title/body. Read the nested shape first, falling back to a flat
      // title/body, then the hardcoded default.
      const raw = event.data.json();
      payload = {
        title: raw.notification?.title ?? raw.title ?? fallback.title,
        body: raw.notification?.body ?? raw.body ?? fallback.body,
        data: raw.data ?? fallback.data,
      };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.png',
      badge: '/logo.png',
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
