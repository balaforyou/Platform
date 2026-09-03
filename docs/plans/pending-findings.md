# Pending Findings — awaiting Chief confirmation

Added Batch 8, as the structural enforcement for the ID-assignment rule in root `CLAUDE.md`'s
"Source of truth" section. That rule ("new findings get described, not numbered, until Chief
confirms") has failed twice despite being written down — F-173 (Batch 5/6), then F-174–F-178
(Batch 7) — both times because an implementing thread assigned and committed an ID before Chief
actually saw the content. Restating the rule again wasn't the fix; this file plus
`scripts/check-register.mjs`'s pending-findings check is.

## How this works

1. Whichever thread surfaces a new finding appends it below, under "Awaiting confirmation" —
   **described, not numbered.** No ID column exists here for a reason: there is nothing to
   self-assign.
2. Chief reviews (relayed by Bala) and confirms by adding `Confirmed-ID: F-NNN` and
   `Confirmed: <date>` directly onto that entry. This is the only edit Chief-side makes to this
   file, and it's what turns "Chief reviewed it" from an in-conversation exchange into a durable,
   checkable artifact.
3. Only once `Confirmed-ID:` exists does the implementing thread write the register row for that
   ID, then move the entry below into "Promoted" (kept for audit, not deleted).
4. `pnpm register:check` enforces this mechanically for every register ID at or above **F-179**
   (the first ID this mechanism governs — the existing 174 findings predate it and are not
   retroactively checked): that ID must have a matching `Confirmed-ID:` line somewhere in this
   file's "Promoted" section, or the check fails. See `scripts/CLAUDE.md` for the check's own
   internals.

Entry template:

```
### <short slug>
Batch: <N>
Surfaced: <date>
Description: <full finding text — context, description, impact>
Confirmed-ID: <blank until Chief fills this in>
Confirmed: <blank until Chief fills this in>
```

## Awaiting confirmation

### upcoming-slots-widget-single-window-display
Batch: 20
Surfaced: 26 Aug 2026
Description: guest-member-pwa's dashboard "Upcoming Slots" widget (apps/guest-member-pwa/src/main.tsx)
has the same single-window display gap F-187 fixed in BookingPay/BookingConfirmation/BookingHistory —
a multi-window (F-183) booking's extra hours don't render, only the parent's base window shows.
Deliberately left out of F-187's scope (a summary dashboard tile, not a payment-decision screen).
Not fixed here.
Confirmed-ID: F-188
Confirmed: 26 Aug 2026
26 Aug 2026 filing correction: moved back here from "Promoted" — this finding is still genuinely
unimplemented (see Description above, "Not fixed here"), so it does not belong in an audit trail of
resolved work. No `findings_register.md` row exists for it. `Confirmed-ID`/`Confirmed` kept as-is;
only the section changed.

### closed-override-no-retroactive-window-suppression
Batch: 21
Surfaced: 27 Aug 2026
Description: A CLOSED availability override only takes effect at generation time — it does not
retroactively hide AvailabilityWindow rows already materialized for that date. Confirmed at
services/slot-engine/src/availabilityGeneration.ts:213-221: when a CLOSED override exists,
generation correctly reports createdCount: 0 (no new windows created), but still returns
windowIds: existingForDate.map(w => w.id) — every window that already existed before the override
was created, with no filtering applied against the override at all. Enforcement-gap bug, not a
"CLOSED overrides are broken" bug — CLOSED overrides work correctly against ungenerated dates; they
just don't reach back and suppress windows generated before the override existed. Found during
F-190's live journey-check (admin block/remove-slot verification), confirmed pre-existing and
unrelated to F-190. Not fixed here.
Confirmed-ID: F-191
Confirmed: 27 Aug 2026

### shipped-images-base-tags-not-digest-pinned
Batch: 23
Surfaced: 28 Aug 2026
Description: The two Dockerfiles that build every shipped image use moving base-image tags, not
digests: `deploy/gcp-vm/Dockerfile.node-service` builds and runs on `node:22-bookworm-slim`
(lines 1 and 28); `deploy/gcp-vm/Dockerfile.caddy-static` uses `node:22-bookworm-slim` for its
build stage and `caddy:2-alpine` for the final stage (lines 1 and 37). No `sha256:` pin appears
anywhere in `deploy/gcp-vm/`. Consequence, surfaced by F-193 sub-batch 3 making CI push a
`:<svc>-<full-sha>` "immutable" tag per commit: that tag is immutable once pushed, but it is not
a reproducibility guarantee — re-running CI on the *same* application commit is not guaranteed
to produce byte-identical images if an upstream base tag moved between runs (Debian point
release, a new `caddy:2-alpine`). F-193's Option-1 push design does not make this worse (within
a run, the bytes `verify-deployment.mjs` approves are the exact bytes pushed), so it was
deliberately not folded into F-193. The fix — pin the two `FROM` base images by digest, with a
refresh mechanism (Renovate/Dependabot or a documented periodic bump) — touches the shipped
Dockerfiles and equally the local manual-deploy path (`deploy_via_dockerhub_reference.md` steps
2-4 build from the same Dockerfiles), so it is its own finding, not a Batch 23 fold-in.
Confirmed-ID: F-194
Confirmed: 28 Aug 2026
Addendum, 28 Aug 2026 (Chief-directed): Folding in a second item, confirmed during F-193's own
closure review — the e2e suite in `integration` runs `continue-on-error: true` (pre-existing
baseline: 4 passed / 4 failed / 1 skipped, documented in `apps/guest-member-pwa/CLAUDE.md`), so
today's pipeline verifies deployment deterministically via `verify-deployment.mjs` but only
advises on e2e/behavioral correctness. F-194 now also covers clearing that fixture debt so the
e2e step can be flipped to blocking. Two related but separable reproducibility/coverage gaps,
same finding, fix in due course — not urgent, not folded into a live batch.

Addendum, 30 Aug 2026 (surfaced during admin-v2 Slice 1 close-out — new evidence about this
existing finding, staged as a candidate, not merged into the text above):

The e2e suite's current CI state is **0 passed / 8 failed / 1 skipped**, not the "4 / 4 / 1"
baseline recorded in `apps/guest-member-pwa/CLAUDE.md` and hardcoded into `ci.yml`'s summary line.
Verified identical across four `main` runs spanning 28–29 Aug at different times of day
(runs 33183500194, 33227663577, 33227758953, 33242182694) and on the admin-v2-slice-1 PR run
(33287588578) — so this is a stable regression on `main`, not the admin-v2 branch, and not pure
time-of-day flake.

Two distinct failure modes, which should not be folded together:
1. **Documented, time-of-day-dependent** — `tests/seed-test-data.ts`'s `alignTimeToBoundary`
   mixes local-hour `getHours`/`setHours` with a +2h offset; near a day boundary the generated
   booking window and the booking screen's default date disagree, failing `guest-booking` and
   window-dependent specs. This is the mechanism `CLAUDE.md:22` warns about.
2. **Apparently newer, time-stable** — the guest-pwa login screen never renders its phone input
   in the CI stack: all seven login-based specs (`f023`, `f041`, `f061`×2, `guest-booking`,
   `member-self-confirm`, `pwa-install-dismissal`) time out on
   `locator('input[placeholder="9999999999"]')` in `loginByOtp`/`loginAs` — i.e. the app is not
   reaching the phone-entry screen at all, structurally different from (1)'s date-misalignment.
   `f043` fails separately in `beforeAll` (`spawn … node ENOENT`).

Not investigated further here (out of scope for that batch — F-194 already owns it). Flagged for
whoever picks up F-194: mode (2) is the bigger lift and its onset should be bisected before the
"flip e2e to blocking" work the addendum-of-28-Aug describes.

### guest-occupancy-branch-endpoint-date-unvalidated
Batch: 24 (adminHub week-over-week trend — Overview dashboard)
Surfaced: 29 Aug 2026
Description: `GET /branches/:id/guest-occupancy` (`services/slot-engine/src/index.ts:1686`) reads
`const { date } = request.query` raw at `:1689` and forwards it straight into
`computePoolGuestOccupancy(poolIds, date)` (`:1704`) with no validation. `dayBounds(date?)`
(`:280-288`) does `new Date(date)` with no `Number.isNaN(day.getTime())` guard, unlike the
sibling member-attendance compute path (`:676-692`) and the guarded helper at `:326-330`. An
unparseable `?date=` therefore produces an Invalid-Date / downstream Prisma error rather than a
clean `400 INVALID_DATE`. `dayBounds`'s own source comment (`:281`, `:290-297`) notes it is
deliberately kept UTC-only and separate from `branchDayBounds` because it is shared with
availability generation (Stage-2 / F-066 scope) — i.e. the UTC semantics are intentional; the
missing NaN/format guard on the endpoint input is the gap, not the UTC behaviour. Surfaced during
the adminHub week-over-week trend investigation (which adds a second frontend call to this same
endpoint at `date − 7d`). That feature does NOT depend on a fix — its `shiftIsoDate` helper always
emits a valid `YYYY-MM-DD` — so this was deliberately not folded into that batch (rule 9). Severity
read: low — no live exploit path, existing authenticated branch-scoped endpoint, missing input
hygiene only. Described here for Chief to assign an ID and prioritise separately; do not self-number.
Confirmed-ID: F-201
Confirmed: 29 Aug 2026

### guest-occupancy-parallel-generation-transaction-exhaustion
Batch: F-195 Phase 1 (admin-web toolchain upgrade — dependency-only)
Surfaced: 29 Aug 2026
Description: `computePoolGuestOccupancy` (`services/slot-engine/src/index.ts:616`) fans every pool's
on-demand window generation out in parallel with no concurrency bound —
`await Promise.all(pools.map((pool) => ensureAvailabilityWindowsForDate(pool.id, date)))` (`:625`).
Each `ensureAvailabilityWindowsForDate` (`services/slot-engine/src/availabilityGeneration.ts:153`)
opens its own interactive `prisma.$transaction` holding a connection + a `FOR UPDATE` row lock
(`availabilityGeneration.ts:184`). So one `GET /branches/:id/guest-occupancy?date=<uncached date>`
request opens N concurrent interactive transactions where N = pool count. On a branch with many
pools this exceeds Prisma's connection/transaction-slot pool and the surplus transactions fail with
`P2028: "Transaction API error: Unable to start a transaction in the given time."` → HTTP 500.
Live-fire evidence (29 Aug 2026, dev stack, real `badminton_db`):
  - courtowner1 branch `22222222-2222-2222-2222-222222222222`, **88 resource pools** (test-data
    pollution from prior F-183/F-184/F-186 regression runs), date needing generation:
    - single request → `200 OK`
    - **two concurrent requests → both `500` with `P2028`** (request/response pair captured)
  - JBC branch `6c9c1e5e-...`, **1 pool**, same date, two concurrent requests → both `200 OK`
Exposure path: the adminHub week-over-week trend feature (F-201's batch) adds a *second* concurrent
`guest-occupancy` call (`date` and `date − 7d`) from `Overview()`, and React `<StrictMode>` in dev
double-invokes each `useQuery`, so a single dev page load can fire up to 4 concurrent requests →
4 × N transactions. Production is not StrictMode-doubled, and a real tenant has 1–2 pools, so this
is **dev-visible / large-pool-count-visible, not a general production 500** — but the unbounded
`Promise.all` is a real latent scalability bug in the endpoint regardless of the adminHub feature.
Pre-existing; not introduced by F-195 Phase 1 (proven: 1-pool concurrent = 200, and Phase 1 changes
no backend code). Not fixed here — scope discipline (rule 9). Likely fix direction: bound the
fan-out (`p-limit` / sequential-with-small-concurrency) in `computePoolGuestOccupancy`, and/or skip
generation for pools that already have windows for the date. Revisit if courtowner1 becomes a real
second demo tenant with a realistic pool count (that removes the "just test pollution" mitigation).
Confirmed-ID: F-202
Confirmed: 29 Aug 2026

## Promoted (audit trail)

### tenant-module-entitlement-system
Batch: F-206 close-out
Surfaced: 31 Aug 2026 (discovery-admin-v2-slice2-guest-booking-mgmt.md §8; consolidated into
the Slice-2 Chief→Technical Lead handover as "F-206 — Module entitlement system", sized "Large",
sequenced ahead of F-207 because F-220 must land already entitlement-gated per Chief's Q7)
Description: `Tenant.plan` was a decorative string with zero enforcement; no feature-flag/module
concept existed. Delivered: `TenantModule` enum + `ModuleEntitlement` model (one row per
(tenant, module), `@@unique`, no row = not entitled / fail-closed). State computed from
(now, startDate, endDate, disabledAt) via `resolveEntitlementState` in `@badminton/shared-types`
(shared by both services, no new dependency edge), never stored — active / read-only wind-down /
hidden. slot-engine: `requireModuleEntitlement` composed into the existing getInternalOrAdminAuth
chain on 18 admin-config endpoints (internal-key bypass); `GET /branches/:id/resource-pools` made
caller-aware (guest tokens pass, admin tokens gated) since it serves both audiences — Bala's call,
applying the handover's Decision 2 correctly rather than leaving a "never UI-only" gap.
tenant-management: grant/renew (internal-key), read (any admin), Owner-only early wind-down.
admin-v2: `AdminTenantContext` entitlements fetch + `nav.ts` module tags + sidebar/bottom-nav/
overflow filtering (null fetch = hide nothing). Guest-facing booking endpoints deliberately not
gated (larger scope, own future finding). JBC's two entitlement rows seeded by a migration that
ships atomically with the gate. One plan-accuracy correction folded in: pre-F-206 regression
sections that hit gated routes with admin JWTs needed the regression tenant seeded with an ACTIVE
entitlement + `tenantId` on the fixture tokens. Verified: whole-repo typecheck + build clean;
full 5-service regression green (slot-engine 68/68, tenant-management 9/9, +12 new sections);
live-fire on the dev stack against real JBC data (entitled 200, no-row/lapsed 403, wind-down
read-200/write-403, caller-aware endpoint); browser pass on admin-v2 (7 destinations entitled,
"Manage Members" hidden when MEMBER_MANAGEMENT lapses, restored on re-grant).
Confirmed-ID: F-206
Confirmed: 31 Aug 2026

### slot-exhaustion-ux-date-level
Batch: F-212 close-out
Surfaced: 31 Aug 2026 (discovery-admin-v2-slice2-guest-booking-mgmt.md; consolidated into the
Slice-2 Chief→Technical Lead handover, "F-212 — Slot-exhaustion UX, date level")
Description: F-187 auto-advances an empty period tab to the first non-empty one within a day, but
a fully-exhausted date only showed a generic "No slots available on this date" message — no
pointer to which date actually has availability. Fixed: new unauthenticated
`GET /resource-pools/:id/next-available-date?from=<YYYY-MM-DD>` — forward-only server-side search,
returns `{ date: <first date with a bookable window> }` or `{ date: null }`. The per-window
bookability rules were factored out of `GET /availability`'s loop into a shared `windowBookable`
helper (no behaviour change to that route); `poolHasAvailabilityOnDate` short-circuits on the
first free window. Search ceiling is `min(from + 14, today + guestOpenWindowDays)`, not the
handover's flat 14 — a date past `today + guestOpenWindowDays` is one `GET /availability` itself
rejects (BROWSE_AHEAD_LIMIT_EXCEEDED), so returning it would mislead; 14 stays only as an outer
cap. Frontend (`CourtBooking.tsx`): a fetch-completed effect calls the endpoint on an empty
date, auto-navigates, and shows an announced inline notice (not F-187's silent jump — Bala's
call, 2 Sep 2026). Guards mirror F-187: one search per distinct date, no re-search off the
endpoint's own navigation, any manual pick re-arms. `{ date: null }` / failed call → the generic
message stays. Verified: whole-repo typecheck + build clean; full 5-service regression green,
slot-engine 60/60 (55 + 5 new `next-available-date.regression.ts` sections); live-fire against
the local dev stack (real JBC Coimbatore branch, `badminton_db`) — exact free date returned with
a DB read-back, `{ date: null }` when exhausted and when `from` is past the horizon, 400 on a bad
date; browser pass on all paths including the fallback (no search loop). One implementation
deviation from the plan, reported not hidden: the plan's §2 asked for a per-query call-count
assertion proving `poolHasAvailabilityOnDate` short-circuits, which the HTTP black-box regression
harness cannot express without a unit-test framework slot-engine does not have — covered instead
by a correctness section (earliest window full → later free window on the same date still makes
the date count) plus the 1-line `return true` being visible in the diff.
Confirmed-ID: F-212
Confirmed: 31 Aug 2026

### court-slot-index-guest-ui-display
Batch: 20 (surfaced), F-189 close-out (implemented)
Surfaced: 26 Aug 2026
Description: F-186 shipped courtSlotIndex as a backend field only, and F-205 later added a real
assigned Resource — but no guest-facing UI anywhere displayed the court to the guest.
`GET /bookings/:id` and `GET /bookings/my` returned the scalars but never the related `Resource`
row. Fixed: `resource: true` added to the `include` on both endpoints (additive, no schema change,
no new route); `BookingConfirmation.tsx` shows a "Court" row between Venue and Players,
`BookingHistory.tsx` a hash-icon row per card. One fallback expression on both: real `resource.name`
(F-205), else the cosmetic `Court N` from `courtSlotIndex` (F-186), else no row (a legacy
pre-F-205 booking with both null). `BookingPay.tsx` deliberately unchanged; `main.tsx` "Upcoming
Slots" widget out of scope (F-188). Verified: whole-repo typecheck + build clean; slot-engine
regression 55/55 unchanged; live-fire against the local dev stack (real JBC Coimbatore pool in
`badminton_db`) — real negotiated POOLED booking assigned "Court 1", DB read-back + raw API
responses on both endpoints carried `resource.name`, legacy `resourceId: null` booking fell back
correctly; browser pass on both screens.
Confirmed-ID: F-189
Confirmed: 26 Aug 2026

### slot-engine-pooled-booking-real-court-assignment
Batch: F-205 close-out
Surfaced: 30 Aug 2026 (discovery-admin-v2-slice2-guest-booking-mgmt.md §3)
Description: POOLED booking creation hardcoded `resourceId: null` in both booking-creation flows
(`POST /bookings` and `POST /bookings/negotiated`), so per-court identity was never tracked at the
booking level despite the pools having real Resource rows. 21 live JBC POOLED bookings carried
resourceId=null. Fixed: `assignPooledCourt` picks the first free real Resource (stable createdAt
order) across the booking's window(s); courtSlotIndex is derived from its position so F-186's
cosmetic number and the real court always agree; graceful fallback to resourceId:null + F-186's
occupancy scan when a pool's Resource count != capacity. Two plan corrections folded in during
implementation (two code paths not one; two live JBC pools not one) — scope-precision, not new
findings. courtSlotIndex/Resource consistency was a design decision (force agree), settled with
Bala. Verified: CI regression 55/55 (its own run on the merge commit), +5 new sections with real
DB read-backs on both JBC pool shapes and both flows, whole-repo typecheck + build clean.
Confirmed-ID: F-205
Confirmed: 30 Aug 2026

### admin-v2-enrollpasskeyprompt-render-phase-setstate-crash
Batch: Phase 0 close-out
Surfaced: 31 Aug 2026
Description: `EnrollPasskeyPrompt` called `onResolved()` — a setter on the parent `App` component
— synchronously during render when `!passkeysSupported()`, the "update a different component
during render" anti-pattern that desyncs React's reconciler from the real DOM and throws
`NotFoundError: Failed to execute 'removeChild' on 'Node'` on the next unmount. Pre-existing
Slice-1 defect, not new code from sub-slice 0.1 — surfaced because 0.1's live-fire was the first
real device pass since the defect landed. 100% reproducible on every mobile device tested:
`passkeysSupported()` returns false without a secure context, and Android testing runs over
`http://192.168.x.x:5175` (LAN IP, not HTTPS/localhost), so `window.PublicKeyCredential` is
undefined and the bad branch fires on every sign-in. Intermittent on desktop (localhost is a secure
context, so the branch doesn't normally fire; StrictMode's double-mount plus 0.1's new
`AdminTenantProvider` render widened the timing window enough to trip it occasionally). Not seen
during Slice 1 itself because a `localStorage` dismissal flag skipped this screen once dismissed;
clearing site data while chasing a separate bug (the SW stale-cache defect, described separately)
removed that flag and exposed the transition fresh. Fixed:
`EnrollPasskeyPrompt.tsx` resolves from a `useEffect`, guarded by a `canEnrol` boolean, never during
render; `App.tsx`'s `onResolved` is now a `useCallback`-stable reference. Verified: forced
`window.PublicKeyCredential` undefined in sandbox — clean flow, no crash; 2 real Android devices +
desktop Chrome/Edge clean; Playwright e2e criteria 3-5 (this exact transition) pass.
Confirmed-ID: F-215
Confirmed: 2 Sep 2026

### admin-v2-service-worker-stale-vite-dev-module
Batch: Phase 0 close-out
Surfaced: 31 Aug 2026
Description: `public/sw.js`'s `isShellRequest()` matched any `.js`/`.css` path too broadly,
including Vite's pre-bundled dependency bundles at `/node_modules/.vite/deps/*.js`, routing them
through `cacheFirst`, which does `cache.match(request, { ignoreSearch: true })`. Vite's deps carry a
`?v=<hash>` query string that rotates on re-optimization; `ignoreSearch: true` matches a `?v=NEW`
request against a cached `?v=OLD` response. Sub-slice 0.1 added a new export (`hexToOklch`) to
`@badminton/ui-shared` — any device with a pre-0.1 cached dependency bundle kept being served the
old one, so `applyAccentRamp.ts`'s import failed with `Uncaught SyntaxError: ... does not provide an
export named 'hexToOklch'` and the whole module graph died, producing a blank page. Confirmed via
direct `curl` against the stale dep URL, which returns Vite's own `504 Outdated Optimize Dep` signal
— the service worker's `cacheFirst` served the cached `200` instead, so the app never saw the signal
to reload. Pre-existing Slice-1/F-197-adjacent defect (the minimal install-ready service worker),
dev-only in practice — production builds emit nothing under the affected paths, confirmed not
assumed. Fixed: `isShellRequest()` now excludes `/node_modules/`, `/@`, `/src/` from `cacheFirst`;
`activate()` also purges any already-cached dev-module entries so affected devices self-heal on next
load. Verified: e2e service-worker cache-naming + stale-cache cleanup suite passes; confirmed on a
real device after one cache clear, automatic thereafter.
Confirmed-ID: F-216
Confirmed: 2 Sep 2026

### admin-v2-tailwind-preflight-img-height-override-audit
Batch: Phase 0 close-out
Surfaced: 31 Aug 2026
Description: Tailwind v4's preflight ships `img, video { max-width: 100%; height: auto }` in
`@layer base`. An HTML `height` *attribute* has CSS specificity 0, so `height: auto` from preflight
silently wins over it; `width` is unaffected by preflight, so a square asset with both attributes
survives by coincidence, not design. Sub-slice 0.1's `LandingPage.tsx` tenant-logo `<img>` used
`height={24}` only; once 0.1 made `tenant.logo` resolve to a real, existing asset for the first time
(previously 404ing), the logo rendered at its full 512px intrinsic height instead of 24px. Fixed at
the two sites 0.1 touched (`LandingPage.tsx`, `TokenKitchenSink.tsx`) — sizing moved into inline
`style={{ height: 24, width: 'auto' }}`. **Left deliberately unfixed and flagged as its own item,
per rule 9**: `LoginScreen.tsx`'s `/icon-192.png` (`width={48} height={48}`) is the one other
instance of this pattern in admin-v2, currently safe only by coincidence (square asset + surviving
`width` attribute). Chief independently confirmed (2 Sep 2026) that `AppShell.tsx`'s own header
logo, built later in sub-slice 0.3, already sizes via `style` and does not carry this trap — so the
open scope is narrower than "every future logo site," specifically `LoginScreen.tsx` plus a
systemic grep-based audit across admin-v2 and guest-member-pwa (same Tailwind v4 preflight) before
more logo/icon instances land elsewhere.
Confirmed-ID: F-217
Confirmed: 2 Sep 2026

### admin-v2-google-identity-services-detached-dom-mount
Batch: Phase 0 close-out
Surfaced: 31 Aug 2026
Description: `LoginScreen` originally passed a React-managed `<div ref>` directly to
`google.accounts.id.renderButton()`, which injects/mutates DOM inside it directly — a known
fragility class when React later reconciles or unmounts that subtree (third-party DOM injection
colliding with React's own commit cycle). A `?nogis` isolation switch used while diagnosing F-215
(the render-phase crash) proved GIS was *not* the actual cause of that blank screen — the
fragility is real and well-documented as a class of bug, but nothing live actually broke because of
it during this project. Not a proven defect — a proactive hardening made while the area was already
open, made explicit rather than presented as a fix for a confirmed symptom. Fixed:
`LoginScreen.tsx`'s effect now creates a detached `<div>` (`document.createElement`), appends it to
the React-managed host, hands that detached node to `renderGoogleButton`, and removes it on cleanup
with try/catch. React only ever sees a host with zero children; GIS's own DOM churn is fully
isolated from React's reconciliation. Chief's ruling (2 Sep 2026): keep, not revert — F-215 is
itself the argument for keeping this, since it's the same underlying risk category (a render-phase/
DOM-reconciliation desync) that produced a 100%-reproducible real crash elsewhere; foreclosing the
same risk class here costs nothing. Verified: e2e login-screen and transition criteria pass; real
desktop + Android sign-in via both Google and the dev-token path clean.
Confirmed-ID: F-218
Confirmed: 2 Sep 2026

### admin-v2-identity-pipeline-discards-google-name-photo
Batch: Phase 0 close-out
Surfaced: 2 Sep 2026
Description: Admin-v2's identity pipeline captures no real display name or profile photo anywhere,
for either the Google-login or dev-login path — `AdminUser`
(`apps/admin-v2/src/lib/claims.ts`) is `{ userId, email, phone, tenantId, userType, roles }`, no
`name`, no `picture`. Traced to source: `verifyGoogleIdToken`
(`services/identity-auth/src/adminGoogleAuth.ts:53-84`) extracts only `email` and `sub` from the
verified Google ID token — Google's real `name`/`picture` claims are present in that same token
(this is the plain `accounts.id` ID-token button flow, no scope restriction, so Google's default
profile claims should already be arriving in every token — a code-level read, not yet live-fire
confirmed) and are simply never read, never stored on the `User` row, never forwarded into the JWT.
Surfaced while building a topbar account-menu addendum for sub-slice 0.3 — not an admin-v2 UI issue,
a systemic identity-auth gap that would affect any future consumer of `AdminUser`, not just one
topbar. Full remediation plan already written, not just described:
`claude/technical-lead-plan-admin-v2-identity-name-photo.md` — persists `displayName`/`photoUrl` on
the `User` row (chosen over a JWT-only forward, which would visibly flicker: appear after a fresh
Google login, then silently revert to initials on the next token refresh or passkey login, since
neither re-touches Google). Real migration, cross-service, own sign-off track — deliberately not
folded into the topbar addendum itself, per rule 9.
Confirmed-ID: F-219
Confirmed: 2 Sep 2026

### admin-v2-build-initiative
Batch: 25 (Slice 1; track opened Batch 24)
Surfaced: 29 Aug 2026
Description: Umbrella track for the admin console rebuild. Originally the "adminHub build track"
in `batch-log.md` Batch 24 — a retrofit of the existing `apps/admin-web`. Superseded mid-course
by the decision to build a wholly separate PWA, `apps/admin-v2`, on its own domain
`admin.elitecourts.duckdns.org`. The original 9-sub-area `admin-web` investigation (guest
bookings, inventory, ledger, analytics, member management, …) stays valid as reference material,
feeding the new app one slice at a time — it is not being implemented on `admin-web`. Stays
Open / in-progress: Slice 1 (login foundation — Google OAuth F-203, WebAuthn step-up F-196,
installable PWA + service worker F-197, landing page) delivered in Batch 25; further slices ahead.
Honest note (30 Aug 2026): F-195 has been used as a work-track ID in `batch-log.md` since Batch 24
and in the Slice 1 plan/handover documents and commit messages since 29 Aug 2026, but no
`Confirmed-ID` line or register row existed for it until this entry. Chief confirmed the number
as-is (no renaming) on 30 Aug 2026 during Slice 1 close-out. Recorded as a dated append, not a
silent backfill.
Confirmed-ID: F-195
Confirmed: 30 Aug 2026

### admin-v2-real-google-oauth
Batch: 25
Surfaced: 29 Aug 2026
Description: New capability — real Google OAuth for admin sign-in, replacing (not extending) the
dev-mock as the only admin login method (no phone/OTP for admin, confirmed decision). New
`POST /auth/admin/google/verify` in `identity-auth`, separate from the members/staff mock.
Client-side ID-token flow: Google Identity Services issues the token to the browser,
`identity-auth` verifies the signature against Google's JWKS via `jose` and checks `iss`/`aud`/
`exp`; only the Client ID is needed, no server-side code exchange. `src/adminGoogleAuth.ts` (pure,
unit-tested): `resolveAdminUser()` matches `User` by `googleId` OR `email` with no `tenantId`
filter, then `roleAssignment.count` scoped explicitly to `(userId, that user's own tenantId)` with
`role in (OWNER, BRANCH_MANAGER)` — zero-match / role-excluded / multiple-tenant each a distinct
rejection code, never a silent tenant pick. `NODE_ENV !== 'production'` dev fallback
(`dev-admin-token-<email>`) so CI/e2e never touches live Google. First `vitest` in the repo
(package-local to `identity-auth`). Frontend: `apps/admin-v2` login screen (Google button only,
no phone/OTP) + landing page showing the signed-in email and role.
Honest note (30 Aug 2026): implementation (commit `8979467`, 29 Aug 2026), its commit message,
and the `.env.example` / `docker-compose.yml` comments all cite F-203 — written before any
`Confirmed-ID` line existed for the number (the register's confirmed IDs ran F-194 → F-201 at the
time). Chief confirmed F-203 as-is on 30 Aug 2026 during Slice 1 close-out. Recorded as a dated
append, not a silent backfill.
Confirmed-ID: F-203
Confirmed: 30 Aug 2026

### admin-v2-webauthn-fingerprint-stepup
Batch: 25
Surfaced: 29 Aug 2026
Description: New capability — WebAuthn / passkey step-up for admin-v2. Step-up, not a replacement:
Google OAuth (F-203) stays primary/fallback; a passkey is a device shortcut enrolled by an
already-authenticated admin, and a successful assertion re-checks the OWNER/BRANCH_MANAGER gate
before a session is issued. New `WebAuthnCredential` model + `User` back-relation + migration
`20260829120000_webauthn_credential_f196` (additive `CREATE TABLE`; `prisma migrate diff` against
the applied schema is empty). `@simplewebauthn/server` 13. Four routes under
`/auth/admin/webauthn/`: register options+verify (admin JWT), login options+verify (unauthenticated,
discoverable credentials). Challenge round-tripped in a 5-minute signed httpOnly cookie — no
challenge table. Cloned-authenticator replay guard (`assertCounterProgress`). `resolveRpConfig`
env-driven (`WEBAUTHN_RP_ID`/`_ORIGIN`/`_NAME`), localhost dev default, prod
`admin.elitecourts.duckdns.org`, throws on a non-suffix rpID. Session issuance extracted to a
shared `issueAdminSession` helper used by both the Google and WebAuthn login paths so they cannot
drift.
Honest note (30 Aug 2026): implementation (commit `7638695`, 29 Aug 2026), its commit message,
the migration filename, and the schema comments all cite F-196 — written before any `Confirmed-ID`
line existed for the number. Chief confirmed F-196 as-is on 30 Aug 2026 during Slice 1 close-out.
Recorded as a dated append, not a silent backfill.
Confirmed-ID: F-196
Confirmed: 30 Aug 2026

### admin-v2-pwa-installability-and-service-worker
Batch: 25
Surfaced: 29 Aug 2026
Description: New capability — admin-v2 PWA installability plus a real (non-stub) service worker.
Installability: static `public/manifest.json` (fixed "Slotflow Admin" branding, `standalone`,
192/512 icons), `<link rel="manifest">` in `index.html`, root-scope `sw.js` registration from
`main.tsx`. Service worker (plan §7, added retroactively after the step-4 pass-through stub):
cache name `admin-v2-shell-<build-sha>` stamped post-build by `scripts/stamp-sw.mjs`; `activate()`
deletes every other `admin-v2-shell-*` cache; cache-first shell with clone-to-cache; network-first
`/api/*`; both-miss returns a real 503 `Response`; `push`/`notificationclick` listeners wired for
F-044 Phase B (no backend trigger yet). Notification opt-in — the `POST /devices/register` flow —
is explicitly deferred out of Slice 1 per the acceptance criteria, so F-197 stays Open for that
half.
Honest note (30 Aug 2026): `sw.js`'s own header, the §7 plan amendment (commit `e3909f9`), and
the step-4a commit (`1d35b84`) all cite "F-197 / §7" — written before any `Confirmed-ID` line
existed for the number. Chief confirmed F-197 as-is on 30 Aug 2026 during Slice 1 close-out.
Recorded as a dated append, not a silent backfill.
Confirmed-ID: F-197
Confirmed: 30 Aug 2026

### admin-v2-walkin-booking-manual-payment
Batch: 25 (ID confirmed — not yet implemented)
Surfaced: 29 Aug 2026
Description: New capability, scoped and specified, not built. Admin creates a walk-in booking and
records a manual payment. Final minimal shape (from the corrected Slice 1 handover): no QR
handling of any kind in our system — the venue shares whatever QR they already have, entirely
outside the app. Two fields only — payment mode (`cash` or `upi`) and a free-text reference
number (required only when mode is `upi`). Booking created at the standard listed price, no
custom-pricing logic. Not part of admin-v2 Slice 1 — sequenced later, independent of it.
Honest note (30 Aug 2026): F-204 appears in the Slice 1 plan/handover finding table as an
already-numbered item, but no `Confirmed-ID` line or register row existed for it. Chief confirmed
F-204 as-is on 30 Aug 2026; its register row reflects Open / not-yet-implemented. Recorded as a
dated append, not a silent backfill.
Confirmed-ID: F-204
Confirmed: 30 Aug 2026

### deploy-pipeline-consolidation
Batch: 23
Surfaced: 28 Aug 2026
Description: Chief-directed, not surfaced during batch work — the ID was assigned in the F-193
implementation handover brief itself (from the Chief thread). Every deploy to the GCP VM was
fully manual: build locally, hand SHA-check, SSH, retag, bump .env, eyeball the UI; and
locally every code change meant standing the whole stack up and tearing it down. Four
sub-batches, each with its own plan → sign-off → live-fire evidence: (1) local compose files
(docker-compose.dev.yml hot-reload loop, docker-compose.gcp-verify.yml shipped-stack overlay,
Caddyfile.dev); (2) CI pipeline (.github/workflows/ci.yml — checks / regression / integration
jobs, register:check + diagram:verify made real gates, Node 22 + pnpm 11); (3) Docker Hub
push from the integration job (:<svc> movable + :<svc>-<full-sha> immutable, every main
push); (4) deploy/gcp-vm/promote.sh — one script consolidating the reference doc's steps 5-10.
Two pre-existing masked gates surfaced and fixed as separate commits (lint debt, typecheck
needing a workspace build). Two readiness races (CI Wait-for-Caddy, promote.sh verify step)
caught and fixed. Base-image digest-pinning raised as a separate finding for Chief.
Confirmed-ID: F-193
Confirmed: 28 Aug 2026

### guest-pwa-organic-migration-completion
Batch: 22
Surfaced: 27 Aug 2026
Description: Completes the guest-member-pwa visual migration onto the Organic design system that
F-190 (Batch 21) started. F-190 migrated the six booking-flow screens but left the venue-selection
path (BranchSelect, BranchDashboard, BranchAbout), the dashboard (MainDashboard body,
renderMemberSessionCard), the tenant-resolution loading/error screens (TenantContext, shared),
and PwaInstallPrompt still on the F-146 palette, and CourtBooking only half-migrated (F-190 Slice
2a/2b did shape/layout but the slot-state colours still resolved through --brand-primary).
Migration only — no new capability. Six review-gated slices A-F: A = foundation tokens (additive),
B = tenant-resolve screens + BranchSelect + a shared dark band via the Layout header, C =
BranchDashboard + BranchAbout, D = CourtBooking completion (the --slot-* token repoint), E =
BookingPay + a stacked-dark-band cleanup (Slice B's shared band had made CourtBooking's and
BookingPay's own local dark headers redundant), F = MainDashboard/renderMemberSessionCard/the
Booking* loading-error states/CancelBookingModal/LoginScreen band/PwaInstallPrompt. End state:
zero --brand-primary styling consumers anywhere in the app (both the bg-[var(--brand-primary)]
and the brand-primary Tailwind-class forms); the variable stays defined and set at runtime by
TenantContext, fully dormant, not aliased. Real fixes found along the way, not assumed from the
plan: the stacked-dark-band regression (Slice E); a WCAG contrast failure on the reserve button
(2.25:1 -> 6.83:1, Slice D); a sub-44px close-target on the cancel modal (Slice F); two hotlinked
Unsplash photo fallbacks replaced with an honest empty state (Slice C); Razorpay's checkout
overlay showing a hardcoded 'Badminton Hub' / '#e11d48' instead of the real tenant name/theme
(Slice E). Discharges F-167 (the weak 10% selected-slot tint it describes is exactly what Slice
D's solid-fill replacement fixes). Wireframe frames 03 (NEW name-capture modal) and 04 (NEW
dashboard restructure) confirmed as genuinely new feature work with no existing code or design to
build against -- deferred, needs its own scoping pass when scheduled.
Confirmed-ID: F-192
Confirmed: 27 Aug 2026

### fast-grid-guest-booking-visual-revamp
Batch: 21
Surfaced: 26 Aug 2026
Description: Full visual revamp of guest-member-pwa's booking flow (LoginScreen, CourtBooking,
BookingPay, BookingConfirmation, BookingHistory, CancelBookingModal) adopting the Organic design
system's shape language and typography (Caprasimo/Figtree, spacing/radius scale, pill buttons,
.card/.field/.dialog component shapes) from the Claude Design wireframe. Real architectural
conflict surfaced and resolved during investigation, not assumed: ds.css's accent colors are a
fixed JBC-specific palette, but the app is genuinely multi-tenant (--brand-primary set at runtime
from Tenant.themeColor, packages/ui-shared/src/context/TenantContext.tsx:115, confirmed used
across 6+ components) — adopting the wireframe literally would have hardcoded JBC's terracotta for
every tenant. Resolved: --color-accent becomes tenant-derived via a new OKLCH ramp-generation
utility (9 steps, 100-900, built new — today's runtime theming is a single hex swap only, no ramp
logic exists yet); --color-accent-2 (sage) stays fixed/universal across tenants, preserving the
existing "one tenant-derived color, everything else universal" convention rather than doubling it.
Six build slices, each stopping for review before the next: Slice 0 (foundation tokens + the ramp
generator, no screen changes), Slice 1 (LoginScreen), Slice 2 (CourtBooking, largest), Slice 3
(BookingPay), Slice 4 (BookingConfirmation), Slice 5 (BookingHistory/CancelBookingModal). Confirmed
correctly excluded: 1a/1c picker variants (Chief already ruled out), courtSlotIndex court-chip
display (F-189's own scope, not this), player +/- stepper (F-114/MVP, already absent), booking
code/PDF receipt/directions (no backend support or already exists elsewhere per F-157). Wireframe's
literal copy for daily-cap ("one booking per number per day") and cancellation refund examples
explicitly overridden to render from real BookingRule fields, never hardcoded text, per F-187's
own established decisions #4/#5.
Confirmed-ID: F-190
Confirmed: 26 Aug 2026
27 Aug 2026 filing correction: this entry sat under "Promoted" once already, with no
`findings_register.md` row ever written for it — breaking the pattern F-183/F-184/F-186/F-187 each
correctly followed. Moved back to "Awaiting confirmation" to correct the record honestly (see
`docs/plans/batch-log.md` Batch 21 and commit `1785967`), and only re-promoted here in the same
commit as its real register row, which also corrected the row's `Resolved` date to 27 Aug 2026 —
the date the final commit (`93218ad`) actually landed, not the 26 Aug 2026 filing date, since the
work genuinely crossed the IST midnight boundary.

### fast-grid-guest-booking-integration
Batch: 20
Surfaced: 26 Aug 2026
Description: Guest booking PWA redesign (Organic design system, Claude Design wireframe) —
Fast Grid slot picker with Morning/Afternoon/Evening period grouping, a duration stepper wired to
F-183's existing (previously unpopulated) additionalWindowIds parameter, daily-cap and
cancellation-policy copy read directly from BookingRule fields already included on the
existing GET /branches/:id/resource-pools response (no new fetch, no backend change), a visual
reskin of the existing dev-mock Google sign-in flow (real OAuth explicitly deferred to its own
future kickoff), graceful guest-facing handling for both GOOGLE_LOGIN_ONLY_FOR_MEMBERS and
PHONE_VERIFICATION_REQUIRED rejection codes (previously surfaced as raw errors, F-034's failure
pattern), default token-based splash/loading/confirmation states (badminton-specific illustration
work explicitly deferred), and multi-window (F-183) display support in BookingConfirmation.tsx and
BookingHistory.tsx — surfaced during investigation as a real pre-existing gap the duration stepper
would otherwise immediately expose, not optional follow-on scope. All changes confined to
CourtBooking.tsx, LoginScreen.tsx, BookingConfirmation.tsx, BookingHistory.tsx — no backend routes
touched, no migration, since every underlying capability already exists and is already fetched.
26 Aug 2026 correction, added during implementation: two deviations from the approved four-file
scope, both confirmed via blast-radius check and explicit sign-off before proceeding — (1)
GET /bookings/:id and GET /bookings/my needed an additive `include: { childBookings: { include:
{ window: true } } }` (no schema change, no new route) since neither previously returned child
booking rows past the initial creation response; (2) BookingPay.tsx was added to the file list for
the same multi-window display gap as BookingConfirmation.tsx/BookingHistory.tsx, one screen earlier
in the guest flow, on the direct payment-decision screen. main.tsx's dashboard "Upcoming Slots"
widget has the same gap and was deliberately left out of this batch.
Confirmed-ID: F-187
Confirmed: 26 Aug 2026

### court-slot-index-pooled-display
Batch: 20
Surfaced: 26 Aug 2026
Description: New capability — a display-only courtSlotIndex (Int, nullable) on Booking, giving
guests a stable "Court N" number on POOLED pools that have no real per-court resourceId tracking.
Assigned once per booking: union the occupied courtSlotIndex values across every AvailabilityWindow
the booking touches (not just the first, since F-183 multi-window bookings span several
independently-checked windows), assign the lowest index in 1..pool.capacity absent from that union
to the parent and every child identically. If no common index exists across the full span, the
booking is NOT rejected — the underlying per-window capacity check already independently confirms
validity — courtSlotIndex is left null instead, degrading to today's no-court-shown state rather
than displaying an unstable or per-segment-different number. Mirrors, without copying, F-183's
FIXED_INSTANCE resource-continuity check: same shape (one value must hold across every window in a
multi-hour booking), different failure mode (FIXED_INSTANCE hard-rejects via RESOURCE_MISMATCH
because a specific resource was explicitly requested; here the index is a cosmetic convenience over
generic capacity, so it degrades gracefully). Also applied to POST /bookings/negotiated's creation
transaction — same pool of capacity as self-service, confirmed at services/slot-engine/src/index.ts,
so a staff-created booking with no index would otherwise be invisible to self-service's
occupied-index computation.
Confirmed-ID: F-186
Confirmed: 26 Aug 2026

### booking-branchid-unvalidated-client-scalar
Batch: 19
Surfaced: 26 Aug 2026
Description: `Booking.branchId` (services/slot-engine/src/index.ts:2277, :2584, :2616) is a bare
scalar destructured directly from POST /bookings' and POST /bookings/negotiated's request bodies
and written to the Booking row with no cross-check against the resourcePool it actually belongs
to (pool.branchId). Pre-existing, not introduced or touched by F-183 or F-184. Surfaced during
F-184's investigation because its own cross-pool daily-cap query deliberately avoids this column,
joining Booking → AvailabilityWindow → ResourcePool.branchId instead — the untrusted column is
why that join path is correct, not incidental. Not fixed here — scope discipline (rule 9).
Confirmed-ID: F-185
Confirmed: 26 Aug 2026

### daily-booking-cap-guest-per-branch
Batch: 19
Surfaced: 26 Aug 2026
Description: New capability, not a bug — supersedes the original multi-court group booking
discovery, which would have required linked-booking atomicity and a real pricing-model fork.
Reframed after investigation showed nothing currently prevents a guest from booking multiple
courts sequentially today; the actual gap was an upper bound, not a missing capability. Guest-only
cap of maxDailyBookingsPerGuest (Int, default 3, admin-configurable per BookingRule, same
per-pool-not-per-branch precedent as F-183's maxAdditionalWindows) on active (HELD + CONFIRMED)
Booking rows per guest per branch-local calendar day, counted across every pool in the branch via
Booking → AvailabilityWindow → ResourcePool.branchId (not the untrusted Booking.branchId scalar —
see the separate candidate finding filed alongside this one). Enforced inside POST /bookings'
existing transaction, gating on HELD + CONFIRMED (not CONFIRMED-only) specifically to prevent a
guest holding several bookings in parallel and getting them all confirmed independently via
separate payment webhooks after the cap should have blocked the later ones. F-183 parent/child
rows count as one reservation toward the cap (parentBookingId: null filter), matching the
GET /bookings/admin and GET /bookings/my precedent — a guest's extended-duration booking isn't
penalized relative to the same guest making several short separate bookings. POST /bookings/negotiated
deliberately left unguarded — staff retain override capacity, and the row-count approach still
correctly caps a guest's own next self-service attempt even against a mix of negotiated and
self-service bookings. Real corrections during investigation, preserved: an initial insertion-point
proposal referenced a variable (horizonTimeZone) before it was actually in scope at that point in
the transaction — caught before implementation, moved to the correct location. Original evidence
anchor for the superseded multi-court discovery (Playo comparison, 10-player scenario) carries
forward as this feature's anchor too — founder judgment and market comparison, not an observed JBC
complaint.
Confirmed-ID: F-184
Confirmed: 26 Aug 2026

### multi-slot-time-booking-phase1-contiguous-extension
Batch: 18
Surfaced: 26 Aug 2026
Description: New capability, not a bug — single-court contiguous booking extension (base 1 hour,
extendable in fixed 60-minute increments up to an admin-configurable `maxAdditionalWindows` cap
on `BookingRule`). Evidence anchor: market comparison (Playo and other EU booking platforms
support 2-hour+ bookings) plus founder judgment that additional duration options help the
business — explicitly not a direct JBC guest request or an observed booking failure, built ahead
of confirmed demand deliberately. Design: hybrid parent/child `Booking` rows — one billable
parent (real price, idempotencyKey, existing HELD→CONFIRMED lifecycle, one PaymentIntent) plus
N-1 lightweight child rows (new nullable `parentBookingId` self-relation, price/idempotencyKey
null) occupying the remaining windows so every existing windowId-keyed availability/capacity
query stays correct unmodified. New `$transaction` wrappers added to /confirm, /cancel, /check-in
(none existed previously) to cascade parent→children atomically, each also gaining a guard that
rejects a direct call on a child booking id (`400 CHILD_BOOKING_NOT_MUTABLE`) — added after
catching that a guest could otherwise call `/cancel` directly on their own child row's id (passes
the existing ownership check, since they do own it) and free that court's capacity while the
parent booking silently kept the full paid price with no refund computed. `GET /bookings/admin`
and `GET /bookings/my` both filter out `parentBookingId`-carrying rows; `cancel-preview` rejects
child rows with 400. All N AvailabilityWindow rows locked FOR UPDATE in startTime ASC order in
one transaction at booking creation — all-or-nothing. Cancellation is whole-booking-only in Phase
1 (parent + all children together), no partial refund logic needed. `FIXED_INSTANCE`
resourceId-continuity guard included per Chief decision (both real JBC pools are POOLED with null
resourceId today — guard is dormant but scoped for correctness on any future FIXED_INSTANCE
tenant). Non-contiguous multi-select explicitly deferred to a possible Phase 2, not built now.
Confirmed-ID: F-183
Confirmed: 26 Aug 2026

### dateOnly-silent-calendar-overflow
Batch: F-176/F-173 fix pass
Surfaced: 22 Aug 2026
Description: `dateOnly()` (`services/slot-engine/src/index.ts:303`) has the same vulnerability class
as F-176: it parses a date-only string via `new Date(`${value}T00:00:00.000Z`)` and only checks for
`NaN`, with no calendar-range validation, so an invalid day-of-month silently normalizes to a
different real date rather than being rejected. Live-fire confirmed directly: `dateOnly("2026-02-30")`
returns `2026-03-02T00:00:00.000Z`; `dateOnly("2026-04-31")` returns `2026-05-01T00:00:00.000Z`.
Callers: `datesInRange` (`index.ts:320-321`), used by `fromDate`/`toDate` on both
`POST /resource-pools/:id/availability-overrides` and its `GET` counterpart's query filter
(`index.ts:1477-1478`) — both admin-scoped, gated by `requirePoolScope`. Unlike F-176's own two
endpoints, `availability-overrides` is genuinely wired into the live `/scheduling` admin-web page
today. Real-world exposure is softened because a native `<input type="date">` element normally cannot
produce an invalid calendar date, so the realistic trigger is direct API access rather than a UI typo
— the same caveat F-176 itself carries. Two other call sites of `dateOnly()` (`index.ts:2106`, passing
a `Date` object; `index.ts:2136`, also a `Date` object by that point) go through the safe
object-input branch and are not affected. Surfaced during F-176/F-173's blast-radius investigation;
deliberately not fixed as part of that pass — described here for Chief to assign an ID and prioritize
separately.
Confirmed-ID: F-179
Confirmed: 22 Aug 2026

### production-db-credential-exposure-two-mechanisms
Batch: 13-15 close-out
Surfaced: 22 Aug 2026
Description: Production DB credential exposure via two independent mechanisms during a
deployment close-out. A `sed` mask searching for `postgres://` against the real
`postgresql://` scheme silently failed to match, allowing plaintext passthrough; separately,
`sudo`'s command-line audit logging to `/var/log/auth.log` captured inline secrets regardless
of the command's own output — two distinct leak vectors, not one. Resolved via a third
rotation using heredoc/stdin exclusively, confirmed clean end-to-end across sed-mask,
sudo-log, and session-transcript surfaces by tracing the real log/transcript data directly.
Tracing itself surfaced a third incident (`sed -i` orphaning `rsyslogd`'s open file
descriptor, recovered via `/proc/<pid>/fd/` and a `SIGHUP`). Two `deploy/gcp-vm/CLAUDE.md`
traps added for the original vectors (7, 8), a third (9) for the `sed -i`/rsyslog incident.
Residual: two dead passwords remain in the local session transcript and the systemd journal,
both inert and accepted as reasonable residual risk given genuine technical constraints
against safe per-entry scrubbing.
Confirmed-ID: F-180
Confirmed: 22 Aug 2026

### health-endpoint-liveness-not-readiness
Batch: 17
Surfaced: 22 Aug 2026
Description: `/health` on all 7 components reports `{status:"ok"}` while database
authentication is actively failing platform-wide. Discovered during the 22 Aug 2026
`jbc.elitecourts.duckdns.org` outage: for roughly 2 hours, every DB-backed request on
`tenant-management` (and, by the same mechanism, the other 4 `DATABASE_URL`-consuming
services) failed with Prisma `P1000` — a stale credential left in the running containers'
environment after Batch 15's third Postgres rotation updated `.env` without recreating
them (exact repeat of `deploy/gcp-vm/CLAUDE.md` trap 10). `/health` on every affected
service kept returning `200 {"status":"ok"}` throughout, confirmed live at the same moment
`/api/tenant/tenants/by-subdomain/jbc` was returning `500` with the raw Prisma auth-failure
message. The check verifies the service process is running and answering HTTP, not that
its actual dependencies — here, database authentication — are functional, so it masked a
platform-wide P0 for its full duration; discovery was a user report, not the health check
that should have caught it first. Fix direction: `/health` (or a companion readiness check)
should exercise a real DB query, not just process liveness.
Confirmed-ID: F-181
Confirmed: 22 Aug 2026

### branch-schedule-schema-weak-client-regex
Batch: 16
Surfaced: 22 Aug 2026
Description: `branchScheduleSchema`'s `workingHoursStart`/`workingHoursEnd`
(`apps/admin-web/src/main.tsx:193-196`) validate with the same digit-count-only regex
(`/^\d{2}:\d{2}$/`) F-174 fixed on `patternSchema`/`overrideSchema` — accepts out-of-range values
like `25:99` client-side. Same file, immediately adjacent to F-174's two schemas, single consumer
(`main.tsx:817`, `PATCH /tenant/branches/:id` via `saveBranch`). Now correctly backstopped
server-side by `tenant-management`'s `WORKING_HOURS_RE` (`services/tenant-management/src/index.ts:219`,
added under F-175/F-177 in Batch 11) — `/^([01]\d|2[0-3]):([0-5]\d)$/`, explicitly commented as
mirroring `slot-engine`'s `validateTimeString`. Natural continuation of the domain sweep's own
pattern: F-175 tightened the server side of this exact field back in Batch 11, but the client-side
regex was never revisited to match — same class of cosmetic papercut as F-174 itself, just surfacing
on a field that only recently got its own server-side backstop. Surfaced during F-174's investigation
(Batch 16), deliberately not folded into that fix or self-numbered — described for Chief to assign an
ID separately.
Confirmed-ID: F-182
Confirmed: 22 Aug 2026

### branch-settings-special-hours-guest-booking-entitlement-gate
Batch: F-220 §1b (Special Hours)
Surfaced: 3 Sep 2026
Description: Branch Settings (`/branch-settings`, F-210) was deliberately designed with no F-206
module gate — branch operating hours/closures aren't a sellable module, same reasoning as
Dashboard/Communications/Ledger/Inventory (F-220 v2 plan, Decision 3). That's true at the
navigation layer: the route and its nav entry carry no `module` in `nav.ts`, always visible. It is
not true at the API layer for the Special Hours card (F-220 §1b): every real backend route it
depends on — `GET /branches/:id/resource-pools` and all four
`/resource-pools/:id/availability-overrides` routes (`services/slot-engine/src/index.ts`) — calls
`requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, ...)` for any owner/branch_manager
caller, inherited from these routes' other, guest-booking-facing callers. A tenant whose
`GUEST_BOOKING` entitlement is inactive would see the Special Hours card render (no UI gate) but
get a 403 on every list/add/edit/delete call — directly contradicting the "branch hours aren't a
sellable module" premise the screen was built on. Confirmed directly by reading
`requireModuleEntitlement`'s call sites, not assumed. Dormant for JBC specifically: the F-206 seed
migration (`20260902120100_seed_jbc_module_entitlements_f206`) grants JBC's tenant `GUEST_BOOKING`
from 1 Jan 2025 to 1 Jan 2030, so this doesn't affect the real customer today. Real fix is backend
surgery — either exempt admin (owner/branch_manager) callers to these specific routes from the
`GUEST_BOOKING` check, or split "browse a branch's pools for operational config" from "browse a
branch's pools to book a guest slot" into genuinely separate authorization paths — not something
to improvise as a side effect of the §1b UI hand-off. Bala's call (3 Sep 2026): track now, resolve
after §1b ships and is verified, not before — doesn't block or risk JBC today.
Confirmed-ID: F-221
Confirmed: 3 Sep 2026

### branch-settings-special-hours-no-booking-conflict-awareness
Batch: F-220 §1b (Special Hours)
Surfaced: 3 Sep 2026
Description: Creating a Special Hours override (`AvailabilityOverride`, `CLOSED` or `MODIFIED`)
has no awareness of existing bookings. Confirmed by tracing every read/write site of
`availabilityOverride` in `services/slot-engine`: it is only ever consulted at future
slot-generation time, never against `Booking` rows that already exist. An admin closing a branch
or shortening its hours for a date that already has confirmed guest or member bookings gets no
warning, and nothing cancels, flags, or notifies the affected bookings — real notification
infrastructure exists (`services/notification`, a real event-type/channel-policy matrix) but no
event type or call site exists for this case. Related but distinct from F-191
(a `CLOSED` override not retroactively hiding already-generated, still-empty windows — a
supply-visibility gap): this is about bookings that already exist, not slots that are still open.
Real fix needs a write-time conflict query, a product decision on outcome (auto-cancel+refund vs.
block-until-resolved vs. notify-only), a new notification event type, and admin review UX before
committing a change — genuine scope, not improvised here. Bala's call (3 Sep 2026): ship a
read-only stopgap as part of §1b itself (a non-blocking booking count shown in the Add/Edit
modal, backed by a new `GET /resource-pools/:id/booking-conflicts` route, no auto-action, no
notification — see the F-220 plan doc's §1b spec for the exact design), and resolve this finding
for real once real guest-slot volume exists to design and validate against, not before.
Confirmed-ID: F-222
Confirmed: 3 Sep 2026

### branch-settings-special-hours-owner-gate-ui-only-not-backend-enforced
Batch: F-220 §1b (Special Hours) — small patch before §2
Surfaced: 3 Sep 2026
Description: Special Hours' Add/Edit/Delete controls are now gated to `isOwner` in the UI
(`SpecialHours.tsx`), matching Operating Hours/Open days' existing owner-only editability on the
same `/branch-settings` screen. Confirmed directly this only closes the gap in the UI, not all the
way down: Operating Hours/Open days' real save route (`PATCH /branches/:id`,
`services/tenant-management/src/index.ts`) enforces a genuine server-side check
(`verifyTenantOwnerOrInternal` — a non-owner caller gets a real 403 `FORBIDDEN`, "Owner privilege
required"). Special Hours' backend routes (`requirePoolScope` + `requireModuleEntitlement` on
`services/slot-engine/src/index.ts`'s `availability-overrides` CRUD) authorize by branch scope
only, with no owner check — a `branch_manager` who calls these routes directly (not through the
UI) can still create, edit, or delete Special Hours overrides today, unchanged by the UI patch.
Low risk for JBC specifically (no real `branch_manager` account is expected to call the API
directly), but a real inconsistency with how the sibling Operating Hours/Open days fields are
actually enforced. Bala's call (3 Sep 2026): ship the UI-only patch now, track this gap
separately rather than block the patch on a backend change.
Confirmed-ID: F-223
Confirmed: 3 Sep 2026
