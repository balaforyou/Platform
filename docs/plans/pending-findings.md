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

### court-slot-index-guest-ui-display
Batch: 20
Surfaced: 26 Aug 2026
Description: F-186 shipped courtSlotIndex as a backend field only — no guest-facing UI anywhere
actually displays "Court N" to the guest. Real follow-on if the Chief wants the field surfaced,
not assumed automatic from F-186 shipping.
Confirmed-ID: F-189
Confirmed: 26 Aug 2026
26 Aug 2026 filing correction: moved back here from "Promoted" — this finding is still genuinely
unimplemented (see Description above, "not assumed automatic"), so it does not belong in an audit
trail of resolved work. No `findings_register.md` row exists for it. `Confirmed-ID`/`Confirmed` kept
as-is; only the section changed.

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

### f043-claude-md-fixture-note-stale
Batch: F-195 Phase 2 (admin re-theme — surfaced during the Tier A e2e baseline check)
Surfaced: 29 Aug 2026
Description: `apps/guest-member-pwa/CLAUDE.md` states the e2e suite is pre-existing "4 passed /
4 failed / 1 skipped" and that "`f043` and `f061` expect fixtures like
`admin-seed-booking-refundable-cancelled` that nothing in the suite creates." For **`f043`** this
is no longer true — `f043-phase-c.spec.ts:108` now has a `seedF043()` function, called from
`beforeAll` (`:203`) and again in the test body (`:235`), that creates its own fixtures. Verified
across 4 isolated runs on the F-195 Phase 2 Tier A commit: `f043`'s **test body completes and
passes every run** (`F043_PHASE_C_EVIDENCE {…"bookingStatus":"HELD"}` — the last line of the test
— prints every time; all admin-web assertions green: `.success-box` "Pattern saved."/"Override
saved.", `#scheduling-pattern-panel`/`#scheduling-override-panel`/`#scheduling-preview-panel`,
`.preview-row` `toHaveCount(2)`). `f043`'s intermittent *spec* failure is entirely the `afterAll`
teardown timeout — see the finding below. The CLAUDE.md note should be corrected/removed so it
stops misdirecting the next reader into treating `f043` as unfixable fixture debt. (`f061` still
genuinely fails on a missing `admin-seed-*` fixture; `f041` on a missing
`admin-seed-branch-coimbatore` — those parts of the note stand.) Test-infra doc accuracy only, no
product code. Described for Chief to assign an ID; do not self-number.
Confirmed-ID: F-203
Confirmed: 29 Aug 2026

### f043-afterall-teardown-timeout-windows
Batch: F-195 Phase 2 (admin re-theme — surfaced during the Tier A e2e baseline check)
Surfaced: 29 Aug 2026
Description: `f043-phase-c.spec.ts`'s `test.afterAll` (`:222-230`) tears down the 5 processes it
spawned in `beforeAll` (3 tsx services + 2 Vite dev servers) with, on Windows,
`spawnSync('taskkill', ['/pid', <pid>, '/T', '/F'])` per child, sequentially. On this dev machine
that sweep exceeds Playwright's default 30 000 ms hook timeout, so the spec reports **failed** even
though the test body passed (see F-203). Reproduced 3-of-4 isolated runs (the 4th happened to
tear down fast enough). Not caused by or related to any Phase 2 change — it is a pre-existing
test-infra reliability issue that just wasn't isolated before, because `f043` was assumed to be
fixture debt (F-203). Likely fix: raise the `afterAll` hook timeout for this spec (e.g.
`test.setTimeout` / a per-hook timeout of ~90s), and/or run the `taskkill` calls concurrently
(`Promise.all` over the children) instead of one at a time. Low severity — pure test-infra, no
product code, e2e is non-blocking in CI. Described for Chief to assign an ID; do not self-number.
Confirmed-ID: F-204
Confirmed: 29 Aug 2026

## Promoted (audit trail)

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
