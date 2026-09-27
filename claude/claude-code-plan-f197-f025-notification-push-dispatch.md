# F-197 (admin-v2 notification opt-in) + F-025 (real FCM push dispatch) — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** PR #30 (`feat(F-197/F-025): admin-v2 notification opt-in + real FCM push dispatch`,
merged 12 Sep 2026) shipped without a plan file committed alongside it, against this project's own
standing practice of committing one alongside any finding fix with a real design decision. Written
2026-09-25, from the actual saved plan-mode file this work was implemented against
(`tender-popping-robin.md`), cross-checked against the PR body and both register rows — not
reconstructed from the diff alone, since the diff only carries the "what."

**Status — do not conflate the two:**
- **F-197 → Resolved** (register line 200, resolved 12 Sep 2026). Genuinely complete: installability and
  the service worker were already done from Slice 1; this work added the notification-permission opt-in
  UI and its wiring to the existing `POST /devices/register` endpoint.
- **F-025 → still Open** (register line 46). This work shipped only the **push/FCM half**. The register's
  own 12 Sep 2026 dated update note is explicit that "the SMS/MSG91 half remains fully open and mocked —
  deliberately parked, Bala's cost-driven call, untouched by this work, no ETA. This finding stays Open
  until that half is also built." This doc does not claim F-025 is closed.

---

## 1. Context and what was found

F-197 was genuinely open going into this work: admin-v2's PWA installability and service worker were
done and verified in Slice 1, but the notification-permission opt-in UI and its wiring to the
already-working `POST /devices/register` endpoint were deliberately deferred out of that slice.

The handover brief that kicked this off named a second finding, "F-226," for the backend half (replacing
`mockDispatch`'s push branch with real Firebase Admin SDK delivery), and stated both IDs already existed
so no new one was needed. **Independent re-verification found F-226 does not exist in
`docs/findings_register.md`** (the register jumps F-225 → F-227 directly). Per this project's standing
rule that an unverified referenced ID doesn't get invented content, this was raised rather than silently
built under a nonexistent ID. Bala confirmed directly: build the backend real-dispatch work under
**F-025** instead — the real, already-registered finding that already covers exactly this gap ("Real push
(FCM) and real SMS notification delivery never verified").

Three Firebase credentials (Firebase web config, VAPID public key, Admin SDK service-account JSON) were
supplied directly by Bala for this session. Both findings were built together in one pass for a concrete
reason, not convenience: **F-197's opt-in UI could not be honestly live-fire verified without F-025's real
delivery path existing to actually receive a push through.** Verifying the "Enable notifications" toggle
against a mock dispatch would only prove a `DeviceToken` row got written, not that a real push round-trips
to a real device — the standing rule-2 bar (real evidence, not reasoning from code alone) required both
halves to exist together.

## 2. Blast-radius check (rule 3a, done up front before implementation)

- `services/notification/src/queue.ts` `processQueue()`/`mockDispatch` — callers: `index.ts:117`
  (fire-and-forget after every queue insert) **and three regression suites that call `processQueue()`
  directly and hard-assert mock behavior**: `dispatch-and-routing.regression.ts` (asserts `providerRef`
  starts with `mock-push` using a fabricated token `fcm-test-token-abc123`), `retry-and-dead-letter.regression.ts`,
  `cross-service-e2e.regression.ts`. This was the critical constraint: real dispatch must not break these
  fixtures, since a fabricated token would make a genuine `admin.messaging().send()` call throw. Real
  dispatch is gated on `FIREBASE_SERVICE_ACCOUNT_JSON` being present — absent in `.env.ci`/regression env,
  so the mock path is preserved there automatically, with zero test edits needed.
- `services/notification/src/index.ts` `resolveAndQueue`/`CHANNEL_POLICY` — single call site (`index.ts:160`,
  the `/notifications/send` handler), triggered externally by `services/payment` and `services/slot-engine`
  over HTTP. Neither is touched by this work — both only consume the existing `/notifications/send`
  contract, unchanged.
- `packages/database/prisma/schema.prisma` `DeviceToken` — owned solely by the notification service
  (confirmed: no relation, no other service queries it). No migration needed, no schema change.
- `apps/admin-v2/src/screens/shell/AppShell.tsx` — the single layout route (`<Outlet/>`) every admin-v2
  screen mounts under. Adding one `DropdownMenu.Item` here is low blast radius by construction, but it is
  the one component the whole nav shell depends on — no other file duplicates this dropdown.
- `apps/admin-v2/src/main.tsx` — already registers `/sw.js`; **not touched**. Firebase's `getToken()` is
  pointed at this existing registration via its `serviceWorkerRegistration` option, not a separate
  `firebase-messaging-sw.js`.
- `apps/admin-v2/public/sw.js` — **not touched**; already has working `push`/`notificationclick` listeners
  with a sensible default-payload fallback.
- `.env.example`, `deploy/gcp-vm/.env.ci`, `deploy/gcp-vm/docker-compose.yml` — consumed by CI's
  `verify-deployment.mjs`/Playwright job and by `promote.sh` on the VM. New build-args follow the exact
  existing `GOOGLE_OAUTH_CLIENT_ID → VITE_GOOGLE_CLIENT_ID` pattern; no existing var renamed or removed.
- `NotificationTemplate`/`templateBody` — confirmed via grep this is stored (via an existing
  template-management endpoint) but never actually rendered anywhere in dispatch today, for any channel.
  Real push does not wire this up either — flagged explicitly here (rule 9) rather than silently expanded
  into scope or silently left unmentioned.

## 3. Real alternatives considered and rejected

**Always requiring real Firebase config, even in CI/dev — rejected.** The straightforward version of "add
real dispatch" makes `sendPush` unconditional and lets CI fail without credentials, or forces a fake
service-account JSON into `.env.ci`. Both were rejected in favor of a conditional dispatch gate:

```ts
const ref = req.channel === 'push' && isFirebaseConfigured()
  ? await sendPush(req.recipient, req.eventType, req.variables)
  : await mockDispatch(req.channel, req.recipient, req.variables);
```

`isFirebaseConfigured()` is true only when `FIREBASE_SERVICE_ACCOUNT_JSON` is set. `.env.ci` and the
regression environment never set it, so CI/dev stay on the existing mock path completely unmodified —
`dispatch-and-routing.regression.ts`'s mock-push assertions (built around the fabricated token
`fcm-test-token-abc123`) keep passing without a single test edit, while a real deploy with the real
secret gets genuine Firebase delivery. The alternative (always-real) would have broken those three
regression suites outright, since a real `admin.messaging().send()` call against a fabricated token
throws.

**Hardcoding the secret — rejected.** `FIREBASE_SERVICE_ACCOUNT_JSON` (the real Admin SDK credential) was
deliberately kept out of every committed file. It goes only into the VM's real, gitignored
`deploy/gcp-vm/.env`, added directly during deployment as one minified single-line JSON string — not a
code change tracked by this plan. This mirrors this project's existing secret-handling split: public,
by-design-browser-visible values (the six `VITE_FIREBASE_*` web-config vars and the VAPID public key) go
into `.env.example`/`.env.ci`/`docker-compose.yml` alongside the existing `VITE_RAZORPAY_KEY`/
`VITE_GOOGLE_CLIENT_ID` precedent, exactly the way this project already treats public-by-design values —
while the one real secret never touches a committed file at all. `.env.ci` explicitly does not get the
service-account JSON, which is what lets the notification service treat its absence as "no Firebase
configured, use mock" with zero special-casing in CI.

**Not cleaning up stale/invalid FCM tokens — rejected.** Flagged in the originating handover as "not
required to ship, but flag if you don't build it" — it was cheap enough to build rather than defer. FCM's
`messaging/registration-token-not-registered` error is caught specifically; the matching `DeviceToken`
row is deleted, then the error is re-thrown so the existing retry/dead-letter bookkeeping in
`processQueue` still records the failed attempt normally. Rejected alternative: leave stale tokens in
place and let every future send against them fail identically forever — this would have left the
`DeviceToken` table accumulating dead rows with no path back to a working state for that device.

**A real template-engine wiring pass — rejected as scope creep.** `NotificationTemplate`/`templateBody`
exists but is unused by dispatch for every channel today, not just push. Wiring push dispatch to render
templates would have been "while we're in here" scope expansion into an unrelated, pre-existing gap —
flagged explicitly in the blast-radius check instead (§2), left untouched.

## 4. SMS deferral — a deliberate scope boundary, not an oversight

F-025's own text covers both push and SMS delivery. This work builds only the push/FCM half. The plan
file and the register's dated update note are both explicit that SMS/MSG91 is **deliberately parked,
Bala's cost-driven call**, fully mocked, untouched by this work, with no ETA — not an oversight or a
partial fix that silently got called done. Per standing rule 9 (don't let one fix silently absorb an
adjacent finding), F-025 stays **Open** rather than being marked Resolved, and the register's Description
column (never Impact/Action, per this project's resolved-row convention) carries the dated note recording
exactly what shipped and what remains.

## 5. What was actually built

**Environment/secrets wiring:**
- `.env.example`: six public `VITE_FIREBASE_*` web-config vars + `VITE_FIREBASE_VAPID_KEY`.
- `deploy/gcp-vm/.env.ci` / `deploy/gcp-vm/docker-compose.yml` / `Dockerfile.caddy-static`: matching public
  Firebase web-config + VAPID key vars and build-args, mirroring the existing `VITE_GOOGLE_CLIENT_ID`
  precedent.
- `docker-compose.dev.yml`: a `FIREBASE_SERVICE_ACCOUNT_JSON` passthrough substituted from the gitignored
  local `.env`, never hardcoded.
- The real service-account secret confirmed to never touch `.env.ci` or any committed file.

**Backend — `services/notification` (F-025 push half):**
- `firebase-admin` added as a dependency.
- New `services/notification/src/firebase.ts`: lazily initializes the Admin SDK once, only if
  `FIREBASE_SERVICE_ACCOUNT_JSON` is set; exports `sendPush(token, eventType, variables)` (returns the
  real FCM message id as `providerRef`) and `isFirebaseConfigured()`.
- A small hardcoded per-`eventType` title map for the six existing `CHANNEL_POLICY` event types, generic
  body text, plus a `data` payload carrying `eventType`/`variables` matching what `sw.js`'s `push`
  listener already expects.
- `queue.ts`'s single dispatch call site branches to `sendPush` for `channel === 'push'` when Firebase is
  configured, else falls back to the existing `mockDispatch` — sms/other channels and all retry/dead-letter
  logic untouched.
- Stale-token cleanup: `messaging/registration-token-not-registered` → delete the `DeviceToken` row →
  re-throw for normal dead-letter bookkeeping.

**Frontend — `apps/admin-v2` (F-197):**
- `firebase` added as a dependency; new `apps/admin-v2/src/lib/firebase.ts` initializes the app from
  `import.meta.env.VITE_FIREBASE_*` and exports `requestAndRegisterPushToken(userId)`: guards on
  `Notification`/`serviceWorker` support, requests permission, on grant calls `getToken()` against the
  existing `/sw.js` registration (no separate `firebase-messaging-sw.js`), then `POST /devices/register`.
  On denial, surfaces a static "blocked in browser settings" message rather than a repeatable retry
  button (browser permission can't be re-prompted programmatically once denied).
- On-load silent re-registration when permission is already granted, since the modular Firebase JS SDK
  has no `onTokenRefresh` event — `POST /devices/register`'s upsert-on-unique-token makes this idempotent
  regardless of whether the token actually rotated.
- One `DropdownMenu.Item` added to `AppShell.tsx`'s account menu (between the existing `Separator` and
  "Log out"), labeled "Enable notifications" / "Notifications enabled" / "Notifications blocked" per the
  current `Notification.permission` state.
- `vite.config.ts` gains a `/api/notification` dev-proxy — the first admin-v2 consumer of that service.

## 6. Verification (real evidence, per standing rule 2)

1. Real permission grant against the dev stack, real JBC admin account (`admin@example.com`) → real
   `getToken()` → confirmed via a real `DeviceToken` row read-back, repeated across multiple
   re-registrations.
2. Real end-to-end send: a real `low_occupancy_alert` push round-tripped through the actual, unmodified
   `/notifications/send` handler → the real Firebase Admin SDK → genuine FCM message ids
   (`projects/slot-flow-admin/messages/...`) → a real, visible OS toast, confirmed on-screen by the user
   directly, twice (after an unrelated environment gap — Windows notifications for Chrome being off — was
   found and corrected mid-verification, not silently worked around).
3. Idempotent re-registration path (simulating app reload with permission already granted) exercised
   directly — no duplicate-key errors.
4. Denied-permission state confirmed to render the blocked message with no crash and no falsely-claimed
   success (sandboxed browser, `Notification.permission` forced to `denied`).
5. A stale/invalidated token correctly triggered the cleanup path (`StaleTokenError` → `DeviceToken` row
   deleted) and was observed live.
6. Full 5-service regression green, rebuilt from a fresh `dist` build (standing rebuild-before-test rule)
   against `badminton_db_test` — `dispatch-and-routing.regression.ts`'s mock-push assertions specifically
   confirmed unaffected, proving the `FIREBASE_SERVICE_ACCOUNT_JSON`-absence gate works. Whole-repo
   typecheck and build clean.
7. `pnpm register:check` and `pnpm diagram:verify` both green after the register update.

## 7. Known gap surfaced by this work, described not fixed here (rule 9)

**F-236** (register line 144, surfaced during production deploy #3 of this exact work): `firebase.ts`'s
`sendPush` sends FCM's `notification: { title, body }` field, but `sw.js`'s flat-key payload merge never
overwrites `payload.title`/`payload.body`, so every real push displayed the hardcoded default title/body
instead of the real event content — confirmed live in production on two real pushes. Delivery, permission
flow, token registration, and dispatch are all genuinely working; this is a display-content bug on the
receiving end only. Logged as its own finding rather than folded into this one, per standing rule 9 — not
fixed as part of this backfill, since this doc only documents what F-197/F-025 actually shipped.

## 8. Close-out and sign-off

- `docs/findings_register.md`: F-197 → Resolved (register line 200). F-025 stays **Open** — its
  Description column (never Impact/Action) carries the dated 12 Sep 2026 note recording the push half as
  real and live-fire verified, with the SMS/MSG91 half explicitly still open and unscheduled.
- Already merged (PR #30, `feat(F-197/F-025): admin-v2 notification opt-in + real FCM push dispatch`,
  merged 2026-09-12T09:54:11Z) and deployed under the review flow this project already runs (Claude Code
  investigate-and-implement → Technical Lead spot-check and gatekeep → independent re-verification before
  Chief consolidation).

This backfill doc requires only doc-level sign-off before merging to `main` — no code, no register
change, nothing to re-verify. It does not reopen or alter F-025's Open status; it documents, honestly,
that only the push half of it shipped here.
