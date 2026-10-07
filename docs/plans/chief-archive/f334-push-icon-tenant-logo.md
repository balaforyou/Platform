# F-334 — push notification icon follows the tenant logo (Option B)

Date: 7 Oct 2026 · Reviewer: Chief · Founder: Bala · PR #136 (draft)

**Source note.** There is no handover document from Chief for this finding. This is Claude Code's own approved plan, with Chief's rulings of 7 Oct 2026 and the three conditions added. The register row and
Confirmed-ID text came from Chief's message of 7 Oct 2026. Evidence and CI are in `docs/plans/batch-log.md`, not here.

## Problem
Guest push notifications show the Elite Courts roundel (`/logo.png`) as the large icon on every tenant. `icon` and `badge` are hardcoded to the build-time `/logo.png` in `scripts/shared-sw-push-handler.js:48-49`
(one service worker shared by every tenant host); the server sends no icon (`services/notification/src/firebase.ts:54-64`). The small "JBC Courts" header comes from the manifest and is independent.

## Option B (chosen): the page records the logo, the service worker reads it
- **Storage:** Cache API, cache `tenant-branding-v1`, key `/__tenant-branding.json`, value `{ "icon": "<absolute URL>" }`. Precedent: `apps/admin-v2/public/sw.js` already uses the Cache API. No IndexedDB or
  `postMessage` precedent exists, and the Cache API works from both the page and the worker. Each tenant host is its own origin, so the cache is isolated per tenant with no tenant key.
- **Writer (S1):** `apps/guest-member-pwa/src/lib/pushBranding.ts`, mounted by `PushBrandingSync` inside `TenantProvider`. Guest-only, so `ui-shared` and admin-web are untouched.
- **Reader (S2):** `resolveTenantPushIcon` in `scripts/shared-sw-push-handler.js`, looked up with `caches.match(key, { cacheName })` so it never creates the cache. `badge` and `notificationclick` are unchanged.
- **Fallback:** the build-time default for any missing, malformed or unsafe record (no Cache API, no entry, bad JSON, non-string, cross-origin, non-http(s), thrown error, tenant with no logo, first push before the app is reopened).
  admin-v2 never records one and keeps `/icon-192.png`.

## The three conditions
1. **Host-resolved tenant only.** Record the logo only when the tenant came from host resolution. A `?tenant=` override, the dev-default tenant, or a resolved subdomain that is not the host's records nothing and
   deletes any earlier entry, so an override can never leave a stale logo behind.
2. **Keep the fallback.** Today's default icon is always the floor; a push is never blocked or altered beyond its icon.
3. **Check `courtowner1`'s logo in the database.** Its value has not been read; owed alongside the real-device check.

## Rulings (Chief, 7 Oct 2026)
- Evidence for S1 to S3 signed off. Final sign-off on #136 waits on CI for the S4 head, Sonar and Codacy.
- A logo on an external host falls back to the default (the approved plan). Known limitation, not flipped now; today every `tenant.logo` is a same-origin relative path.
- The host-label rule stays duplicated in the guest app. Extraction into `ui-shared` is out of scope; the fail-closed equality check is the safeguard and is covered by tests.
- Codacy's red-circle comment on `if (!tenant) return`: the reasoning holds (`TenantProvider` never mounts children without a tenant, `TenantContext.tsx:192-201`), so the guard stays, with a code comment saying why.
- No local full regression run: the backend is untouched, so CI's `regression` job is enough.

## Known limitations
First push after deploy, before the app is reopened, shows the default icon · an external-host logo falls back to the default · `badge` is unchanged (its possible alpha-mask defect on Android is a separate
observation, not part of F-334) · real FCM delivery and Android rendering are not provable locally.

## Out of scope
`badge`, the notification service, `sendPush`, the injector, admin-v2, and F-327's `notificationclick` change (it follows once #136 merges).
