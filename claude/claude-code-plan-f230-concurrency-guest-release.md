# F-230 — walk-in guest per-court authorization + concurrency live-fire proof — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** Commit `42f26e7` (merged on `f229-manual-booking` → PR #21) shipped the fix without a
plan file committed alongside it, against this project's own standing practice of committing one for any
finding with a real design decision. Written 2026-09-25, reconstructed from the actual saved plan-mode
file this work was implemented against (`abstract-wobbling-meteor.md`, heading "F-230 fix + concurrency
live-fire test"), cross-checked against `docs/findings_register.md`'s F-230 row and
`docs/plans/batch-log.md`'s Batch 44 entry — not from the diff alone, since the diff only carries the
"what."

**Status:** already implemented, merged, and deployed. Nothing here changes code or the register — this
is documentation catching up to already-shipped, already-verified work.

---

## 1. Context and what was found

F-230 was reviewer-confirmed 11 Sep 2026 directly in the Technical Lead thread, against
`f229-manual-booking` post-merge-review — not self-discovered.

`POST /bookings/manual` ([[F-229]], the walk-in-guest booking route) reuses
`createHeldNegotiatedBooking` (`services/payment/src/index.ts:854`), which calls slot-engine's
`POST /bookings/negotiated`. That route was built by [[F-225]] for **admin-negotiated bookings on
behalf of a member**, and therefore intentionally calls `assignPooledCourt(pool, active)` with **no**
`{ guestOnly: true }` — an admin negotiating for a member may legitimately use a court a branch has
reserved away from walk-in guests. `/bookings/manual` is a real walk-in-**guest** path, not the
member-negotiated path, so it silently inherited the same unfiltered call: a real walk-in guest booked
through it could be assigned a court the branch had deliberately reserved away from guests via [[F-225]]'s
own `guestBookable` gate — exactly the authorization [[F-225]] built for the guest self-service path
(`POST /bookings`) and never extended to `/bookings/manual`.

A second, unrelated ask rode along in the same handoff (not code-change related to Part 1's bug): a
live-fire proof that the existing `FOR UPDATE` window lock in `/bookings/negotiated` actually serializes
two genuinely concurrent walk-in cash bookings competing for the last remaining slot — real evidence
that the lock holds under real concurrency, not reasoning about it from reading the code.

## 2. Blast-radius check (rule 3a)

`grep -r "bookings/negotiated"` across the repo found only two non-doc call sites:

- `services/slot-engine/src/index.ts:3226` — the route itself.
- `services/payment/src/index.ts:854` (`createHeldNegotiatedBooking`) — the **only** function that calls
  it, itself called from exactly 3 places, all in `services/payment/src/index.ts`:
  - `POST /payment-links/negotiated` (:1058) — member-negotiated, must stay unaffected (no `guestOnly`).
  - `POST /bookings/manual`, `razorpay_link` branch (:1169) — walk-in guest, needs `guestOnly: true`.
  - `POST /bookings/manual`, cash/upi_qr branch (:1183) — walk-in guest, needs `guestOnly: true`.

Both `/bookings/manual` branches share one `bookingFields` object (built once, before the branch split),
so adding `guestOnly: true` there covers both call sites from a single edit. No other route, service, or
regression helper calls `/bookings/negotiated` directly except the regression suites' own test helpers
(`court-slot-index.regression.ts`'s `bookNegotiated`, `daily-booking-cap.regression.ts`) — neither passes
a `guestOnly` field today, so a default-false, opt-in flag leaves every existing test's request body and
expected behavior unchanged. `assignPooledCourt` (`slot-engine/src/index.ts:116`) already accepted
`opts?.guestOnly` from [[F-225]] — no signature change needed there, only a new caller passing it through.

## 3. Alternative considered and rejected: filter the resource list before `assignPooledCourt` sees it

The plan file does not present this as a live design debate for F-230 itself — F-225 had already made
and documented this call when it built `assignPooledCourt`'s `guestOnly` option, and F-230 is explicitly
threading that existing, proven mechanism to a caller that had been left out, not re-litigating it. Worth
recording here because it is the load-bearing reason the fix is a one-line opt-in flag rather than a new
filtering layer: a naive pre-filter of the resource list (drop non-`guestBookable` courts before
`assignPooledCourt` runs) breaks the `ordered.length === pool.capacity` capacity gate and desyncs
`courtSlotIndex`'s position-based "Court N" numbering from the real court — the exact trap [[F-225]]'s own
register row calls out. F-230 reuses that already-hardened, already-tested code path (guest-only
filtering applied *inside* `assignPooledCourt`'s existing `findIndex`) rather than inventing a second,
independent filtering mechanism for this one caller. No other alternative locking/retry strategy is
discussed in the plan file for Part 1 — this is a straight authorization-parity fix, not a concurrency
redesign.

For Part 2 (the concurrency proof), the plan is explicit that the mechanism under test — Postgres
`FOR UPDATE` row-locking the `AvailabilityWindow` row inside the booking transaction — is pre-existing,
not newly designed by F-230. The alternative the plan implicitly rejects is proceeding on **reasoning
from the code alone** ("the lock is there, so it must serialize correctly") instead of firing two
genuinely concurrent requests and reading back the database. That is rule 2 in this project's own
CLAUDE.md, applied directly: F-230's handoff called for real evidence over inferred correctness, and the
plan's entire Part 2 is built around producing that evidence rather than certifying the lock by
inspection.

## 4. What was actually built (Part 1 — the fix)

Matches the plan's proposal in full, confirmed against the register's Resolution text and commit
`42f26e7`:

- `services/payment/src/index.ts` — `createHeldNegotiatedBooking`'s `fields` param gains
  `guestOnly?: boolean`, forwarded as `guestOnly: fields.guestOnly === true` in the JSON body sent to
  `POST /bookings/negotiated` (explicit `=== true` keeps the wire value a real boolean and defaults to
  `false` for every caller that omits it). `/bookings/manual`'s one shared `bookingFields` object now
  sets `guestOnly: true`, covering both its `razorpay_link` and cash/upi_qr branches from that one
  change. `/payment-links/negotiated`'s own object is untouched — `guestOnly` is never sent, so
  slot-engine's destructure defaults it to `false`, byte-identical to pre-fix behavior.
- `services/slot-engine/src/index.ts` — `POST /bookings/negotiated` destructures `guestOnly` from the
  request body and passes `{ guestOnly: guestOnly === true }` into the POOLED branch's
  `assignPooledCourt` call (previously `assignPooledCourt(pool, active)` with no options object). An
  absent/falsy value behaves exactly as before the fix.
- No schema change, no new endpoint, no admin-v2 contract change — `guestOnly` is an internal flag
  `/bookings/manual` sets when calling into the shared negotiated-booking primitive; the browser never
  sends it.

New regression section in `services/payment/src/regression/manual-booking.regression.ts`, mirroring
[[F-225]]'s own "no authorized court free → `resourceId: null`" test shape
(`court-slot-index.regression.ts:567`) but exercised through `/bookings/manual` instead of guest
self-service `POST /bookings`: a POOLED pool (capacity 2, only court 1 marked `guestBookable`), first
walk-in guest lands on the one guest-authorized court, second walk-in guest (same window, capacity still
open) gets `resourceId: null` — the honest [[F-186]] fallback, not the reserved court 2. Captured failing
for real against the pre-fix code (the second guest landed on court 2, the reserved court) before the fix
was applied, then re-run green after.

## 5. What was actually built (Part 2 — concurrency live-fire test)

The plan specified this as an **ad-hoc verification script, deliberately not committed to the regression
suite** — run against the live dev stack (payment on `localhost:3004`, slot-engine on `localhost:3001`,
backed by `badminton_db`), using a disposable tenant/branch/pool created fresh for the test and cleaned up
afterward, never touching JBC's or `courtowner1`'s real rows. Design per the plan:

1. Fresh disposable UUIDs for tenant/branch, not reused from any fixture file.
2. Seed via Prisma: `tenant.upsert` + `branch.upsert`, then via HTTP: a POOLED pool (capacity 1), a
   booking rule, and one availability window with `capacity: 1` (so `remainingCapacity: 1` needs no
   filler booking).
3. Fire two concurrent `POST /bookings/manual` calls via `Promise.all` (not sequential `await`s) — same
   `windowId`/`resourcePoolId`, two different walk-in guest `userId`s, two different `Idempotency-Key`
   headers, both `paymentMethod: 'cash'`, internal-key auth.
4. Record timestamps immediately before firing and immediately after each resolves, to prove real
   overlap, and report both full response bodies + status codes verbatim.
5. DB read-back via Prisma: exactly one `CONFIRMED` booking on the window, exactly one captured
   `PaymentIntent` with a `cash_`-prefixed `gatewayRef`, and an explicit check that no stray `HELD`
   booking exists for the loser (the loser must never persist anything, because the `FOR UPDATE` lock on
   the `AvailabilityWindow` row is expected to serialize the two transactions before either creates a
   row).
6. Cleanup: delete every row created by id, then confirm `count(*) = 0` against each affected table
   filtered by the disposable tenant/branch id.

Per the plan, this part ran only after Part 1's fix was in place, rebuilt, and its own regression section
was green — i.e. it tests the corrected code's concurrency behavior, not the pre-fix code.

**Gap, flagged honestly rather than smoothed over:** the plan file specifies this script in full detail
and states it produces no commit — "a verification script, not a code change... nothing to sign off on
except the evidence itself." Neither the register's F-230 row nor the Batch 44 batch-log entry
(`docs/plans/batch-log.md`, "Batch 44 — F-230") mentions Part 2 at all — both cover only the Part 1 fix,
its regression section, and the slot-engine/payment suite counts. No raw two-response-body /
timestamp / DB-count evidence block for the concurrency proof exists in any committed file (`claude/`,
`docs/plans/batch-log.md`, or the register) as of this backfill. This backfill cannot confirm from
committed evidence whether Part 2 was actually executed, executed but not written up, or dropped — only
that it was planned in this level of detail and that nothing in the repo documents its outcome. Raising
this rather than asserting Part 2 shipped is deliberate, per this project's own rule against smoothing
over a plan/reality gap.

## 6. Verification (as it exists in committed evidence)

- Part 1 regression: captured red pre-fix (second walk-in guest landed on the reserved court), green
  post-fix (`resourceId: null` fallback). Full suite counts post-fix: slot-engine **75/75** (F-225's own
  three sections unaffected, confirming `/payment-links/negotiated` and guest self-service both stayed
  byte-identical), payment **20/20** (19 pre-existing + this one new section).
- Whole-repo typecheck clean on both touched packages (`tsc --noEmit`).
- `pnpm register:check` + `pnpm diagram:verify` green (per the Batch 44 batch-log entry).
- Part 2: no committed raw evidence found (see gap above) — the plan's own verification gate for Part 2
  ("raw two-response-body + timestamp + DB-read-back-count evidence reported back verbatim, disposable
  rows fully cleaned up and re-verified at `count = 0`") is not something this backfill can confirm was
  met, only that it was the specified bar.

## 7. Sign-off

Already merged (commit `42f26e7`, on `f229-manual-booking` → PR #21) and deployed under the review flow
this project already runs (Claude Code investigate-and-implement → Technical Lead spot-check and
gatekeep → independent re-verification before Chief consolidation). This backfill doc requires only
doc-level sign-off before merging to `main` — no code, no register change. The Part 2 evidence gap noted
in §5 is a documentation finding about this backfill, not a claim that the concurrency behavior itself is
unverified or broken; it should be raised to Chief/Bala to decide whether the live-fire script needs to
be re-run and its output committed, or whether it was run and simply never written up.
