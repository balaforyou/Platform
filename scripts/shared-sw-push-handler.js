/**
 * Shared push/notificationclick service-worker handler for admin-v2 and guest-member-pwa
 * (originally F-044 Phase B for admin-v2, ported verbatim into guest-pwa by F-323).
 *
 * This file is NOT loaded at runtime as-is -- it is the single source of truth for the two
 * placeholders below, injected into each app's built `dist/sw.js` by
 * `scripts/inject-push-sw-handler.mjs` (mirroring `apps/admin-v2/scripts/stamp-sw.mjs`'s own
 * `__BUILD_SHA__` placeholder-substitution pattern). Extracted because SonarCloud's duplication
 * check flagged the two apps' near-identical hand-copies of this exact block (45.5% duplication
 * on a small PR) -- the code now exists exactly once in the repository; each app's own
 * `public/sw.js` carries only a marker comment where this gets injected at build time.
 *
 * Placeholders, substituted by the injector script:
 *   __PUSH_FALLBACK_TITLE__ -- 'Slotflow Admin' for admin-v2, 'Slotflow' for guest-member-pwa
 *   __PUSH_ICON_PATH__      -- /icon-192.png for admin-v2, /logo.png for guest-member-pwa
 *                              (used for both `icon` and `badge` -- identical in both apps today)
 *
 * Everything above this line is documentation for readers of THIS file only -- the injector
 * (scripts/inject-push-sw-handler.mjs) extracts and ships only what's below the marker, so this
 * header (which itself mentions the placeholder tokens as prose) never ends up in a built
 * dist/sw.js getting its own token names substituted.
 */
/* __SHARED_SW_PUSH_HANDLER_CODE_START__ */

self.addEventListener('push', (event) => {
  const fallback = { title: '__PUSH_FALLBACK_TITLE__', body: 'You have a new notification.', data: {} };
  let payload = fallback;
  if (event.data) {
    try {
      // F-236: the real FCM message (services/notification/src/firebase.ts's sendPush) nests
      // title/body under a `notification` key on the wire -- a flat spread merge here never
      // overwrote the hardcoded fallback above, so every real push showed generic text
      // regardless of the real event. Read the nested shape first, falling back to a flat
      // title/body (in case a future sender ever sends one directly), then the hardcoded default.
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
      icon: '__PUSH_ICON_PATH__',
      badge: '__PUSH_ICON_PATH__',
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
