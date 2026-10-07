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
 *                              (the `badge`, and the DEFAULT `icon` -- see F-334 below)
 *
 * F-334: the large `icon` follows the tenant. The guest app's page records the host-resolved
 * tenant's logo in the Cache API (apps/guest-member-pwa/src/lib/pushBranding.ts); this handler
 * reads it back and falls back to __PUSH_ICON_PATH__ when nothing usable is recorded (always the
 * case for admin-v2, which never records one). The cache name and key below are literals mirrored
 * from pushBranding.ts; a unit test keeps the two in step. `badge` is deliberately unchanged.
 *
 * Everything above this line is documentation for readers of THIS file only -- the injector
 * (scripts/inject-push-sw-handler.mjs) extracts and ships only what's below the marker, so this
 * header (which itself mentions the placeholder tokens as prose) never ends up in a built
 * dist/sw.js getting its own token names substituted.
 */
/* __SHARED_SW_PUSH_HANDLER_CODE_START__ */

const TENANT_BRANDING_CACHE = 'tenant-branding-v1';
const TENANT_BRANDING_KEY = '/__tenant-branding.json';

// F-334: the tenant's recorded logo, or `defaultIcon`. Never rejects: any missing, malformed or
// unsafe record falls back, so a push is always shown with today's icon at worst. Only a same-origin
// http(s) URL is used; the page only ever records the tenant's own host logo.
async function resolveTenantPushIcon(defaultIcon) {
  try {
    if (typeof caches === 'undefined') return defaultIcon;
    const hit = await caches.match(TENANT_BRANDING_KEY, { cacheName: TENANT_BRANDING_CACHE });
    if (!hit) return defaultIcon;
    const record = await hit.json();
    if (!record || typeof record.icon !== 'string') return defaultIcon;
    const url = new URL(record.icon, self.location.origin);
    const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
    return isHttp && url.origin === self.location.origin ? url.href : defaultIcon;
  } catch {
    return defaultIcon;
  }
}

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
    resolveTenantPushIcon('__PUSH_ICON_PATH__').then((icon) =>
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon,
        badge: '__PUSH_ICON_PATH__',
        data: payload.data || {},
      }),
    ),
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
