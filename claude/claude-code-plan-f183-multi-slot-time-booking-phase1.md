# F-183 — Multi-Slot-Time Booking, Phase 1 — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** Commits `bcaa329` (pending-findings.md filing), `19da595` (implementation, direct to
`main`, no PR found for F-183 via `gh pr list --repo balaforyou/Platform --state all --search "F-183"`),
and `dce5b8b` (register close-out) all landed without a plan file committed alongside them, against this
project's own standing practice of committing one for any finding with a real design decision — and this
is the flagship gap in this backfill batch, since a real billing-integrity/IDOR bug was found and designed
around mid-plan. Written 2026-09-25, reconstructed from the actual saved plan-mode file this work was
implemented against (`zazzy-jumping-river.md`, heading "F-183 — Multi-Slot-Time Booking, Phase 1
(corrected, full document)"), cross-checked against `docs/findings_register.md`'s F-183 row (register:227)
and `docs/plans/batch-log.md`'s Batch 18 entry — not from the diff alone, since the diff only carries the
"what."

**Status:** already implemented, merged (direct to `main`), and deployed. Nothing here changes code or the
register — this is documentation catching up to already-shipped, already-verified work.

---

## 1. Context and what was found

Guests could only book one 1-hour `AvailabilityWindow` per `Booking`. Phase 1's ask: let a guest extend a
booking by whole contiguous hours (e.g. 6-7pm plus 7-8pm) as a single purchase, up to an admin-configurable
cap, without breaking any existing `windowId`-keyed availability/capacity query. Evidence anchor for
building this at all was market comparison (Playo and other EU booking platforms support 2-hour+ bookings)
plus founder judgment — explicitly **not** a direct JBC guest request or an observed booking failure, built
ahead of confirmed demand deliberately (the same evidence class F-184/F-186 later reused).

Two real corrections landed during the investigation itself, before the plan was even finished, confirmed
directly against the running code rather than assumed:

- Neither real JBC pool is `FIXED_INSTANCE` — both are `POOLED`, `resourceId` null on every real window,
  confirmed against `badminton_db`. This mattered because the original brief asked for an empirical check
  ("do consecutive `FIXED_INSTANCE` windows share a `resourceId`?") that could not be answered as posed.
- `/bookings/:id/confirm`, `/cancel`, `/check-in` do **not** currently run inside a `prisma.$transaction` —
  the plan's cascade design had assumed one existed to extend; each was in fact a single bare
  `prisma.booking.update(...)` call, so new `$transaction` wrappers were required, not extensions of
  existing ones.

A third correction — the one that matters most in this whole document — surfaced on final review before
sign-off, covered in full in §4 below.

## 2. The data-model choice: hybrid parent/child rows, and what was rejected

**What shipped:** one billable parent `Booking` (real price, `idempotencyKey`, the existing
`HELD`→`CONFIRMED` lifecycle, one `PaymentIntent`) plus N-1 lightweight child rows (new nullable
`parentBookingId` self-relation, `price: null`, `idempotencyKey: null`) occupying the remaining windows.

The plan is explicit about *why* this won over the alternative of a single row spanning the full duration
(e.g. one `Booking` with a `durationMinutes` or an `endWindowId` field covering the whole multi-hour span):
**every existing query in the codebase is keyed on a single `windowId` per booking** — browse availability,
the `FIXED_INSTANCE` concurrency check, the `POOLED` capacity check, `computePoolGuestOccupancy`'s
`groupBy`, `courtSlotIndex` occupancy computation (F-186), the daily booking cap count (F-184) — all
confirmed directly to filter and group on a one-`windowId`-per-`Booking` assumption. A single wide row would
have required rewriting every one of those consumers to understand a duration/range instead of a point,
each one a real regression risk on already-shipped, already-tested logic. The hybrid design instead adds
*more rows of the same existing shape* — each child is a completely ordinary `windowId`-keyed `Booking` row,
just with `price`/`idempotencyKey` null and a pointer back to its parent — so every one of those consumers
keeps working unmodified. The real cost the plan accepted in exchange: cascading state transitions
(confirm/cancel/check-in) now have to fan out from parent to children explicitly, since Postgres has no
native concept of "this row's status implies that row's status." That cost, and how it was paid, is §3.

No third data-model alternative is discussed in the plan file — the two live options were "one row per
window, linked" versus "one row spanning the range," and the decision was made on the query-compatibility
argument above, not on a broader survey.

## 3. Blast-radius check (rule 3a)

The plan's own investigation, before implementation, listed every consumer that would need to keep working
unmodified under the hybrid model, and every mutation path that would need to learn about the new
parent/child relationship:

**Read paths that had to keep filtering/grouping correctly with no schema-awareness change** (confirmed
`windowId`-scoped, confirmed unaffected by adding child rows as long as they use the same `windowId`
convention): browse availability (`index.ts:2222`), the `FIXED_INSTANCE` concurrency check (`index.ts:2433`),
the `POOLED` capacity check (`index.ts:2446`), `computePoolGuestOccupancy`'s `groupBy` (`index.ts:643`).

**Mutation/read paths that had to be actively changed to know about `parentBookingId`:**
- `POST /bookings/:id/confirm`, `/cancel`, `/check-in` — each gained a new `$transaction` cascade (parent
  update + every child update, atomically) plus the `CHILD_BOOKING_NOT_MUTABLE` guard (§4).
- `GET /bookings/admin` (`index.ts:3440`) — filter out `parentBookingId`-carrying rows.
- `GET /bookings/my` (`index.ts:3520-3549`) — same filter; found to have **no filter of any kind** in the
  original plan draft (see §4).
- `GET /bookings/:id/cancel-preview` (`index.ts:3553`) — reject a child id with 400 instead of silently
  computing a confident-looking `{refundAmount: 0, refundPercent: 0}`.
- `POST /refunds/override` (`services/payment/src/index.ts:1062`) — investigated and confirmed to need
  **no** change: it requires a captured `PaymentIntent` matching the exact `bookingId`, and only the parent
  ever gets one, so a child id already hard-fails with `400 PAYMENT_INTENT_NOT_FOUND` before and after this
  feature, without any new guard.
- `POST /booking-rules` and `PUT /resource-pools/:id/booking-rule` — `maxAdditionalWindows` added to the
  existing `BOOKING_RULE_INTEGER_FIELDS` validation/create list (the F-068 pattern reused), confirmed as the
  one deviation from the signed-off plan document (the plan's Task B did not name this wiring step; it was
  added during implementation because without it the field would only ever be settable by hand against the
  database, contradicting the register/plan's own description of it as admin-configurable).

Explicitly out of scope, stated in the plan rather than discovered as a gap later: non-contiguous
multi-window selection (deferred to a possible Phase 2), partial cancellation, any change to
`POST /refunds/override` (confirmed safe as-is), any change to `apps/admin-web`'s ad-hoc guest-release or
negotiated-booking-creation flows, and guest-PWA nested display of parent+child as one visual booking
(noted as a follow-up product/UI question, not folded into this plan — later picked up by F-187).

## 4. The billing-integrity / IDOR bug found mid-plan — the most important content in this document

**Where it was found:** on final review before sign-off, tracing the actual exploit rather than reasoning
abstractly about "ownership checks." This was not part of the plan's first draft — the plan file records it
explicitly as a correction found late in the process, after the data model and cascade design were already
settled.

**The exploit, precisely:** a guest's child `Booking` row carries the **same `userId`** as its parent (it
has to — both rows represent one purchase by one guest). F-071's existing IDOR ownership check
(`requireBookingAccess`) authorizes any request where the caller's `userId` matches the booking's `userId`.
Before this fix, nothing distinguished a child booking id from an ordinary booking id at the point where
that check runs — `parentBookingId` didn't previously exist as a concept the mutation routes checked. So a
guest who legitimately owns a 2-hour (parent + 1 child) booking could call `POST /bookings/:childId/cancel`
directly on the **child's own id** and the request would pass the existing ownership check cleanly, because
they do, legitimately, own that row.

**What that call would then do, traced step by step against the real code:**
1. The child's `price` is `null` by design (§2 — only the parent is billable). The refund-calculation guard
   at `index.ts:2830` (`if (matchedTier && booking.price)`) silently evaluates false on a null price, so no
   refund is computed for the child at all.
2. The child flips to `CANCELLED` with `refundAmount: null`. Nothing about this touches the parent row —
   the parent stays `CONFIRMED`, still holding the full price summed across every window at booking
   creation time (§2 step 9 of the plan's `POST /bookings` design: `price = sum(resolvePrice(...))` across
   all windows).
3. The child's `AvailabilityWindow` becomes bookable again in **every** status-filtered query that excludes
   `CANCELLED` — confirmed directly against browse availability (`index.ts:2222`), the `FIXED_INSTANCE`
   concurrency check (`index.ts:2433`), the `POOLED` capacity check (`index.ts:2446`), and
   `computePoolGuestOccupancy`'s `groupBy` (`index.ts:643`) — none of those `status: { in: [...] }` filter
   sets include `CANCELLED`.

**Net effect, stated plainly:** the guest keeps a receipt (and the paid-for right to use) 2 hours' worth of
court time, walks away with no refund issued for the "cancelled" hour (because the null-priced child never
triggers refund logic), and the platform simultaneously re-opens that same hour for someone else to book and
pay for again. This is not a display bug or an edge-case inconvenience — it is a real billing-integrity and
double-booking exposure reachable by any guest with a completely ordinary multi-window booking, using
nothing more than the booking id they were legitimately issued, requiring no privilege escalation and no
malformed input. The same gap was live on `/confirm` and `/check-in` too, though the practical exploit path
above (`/cancel`) is the one with the direct financial consequence.

**The fix — `CHILD_BOOKING_NOT_MUTABLE`:** each of the three routes (`/confirm`, `/cancel`, `/check-in`)
fetches its target `booking` by `:id` exactly as before, and immediately after the existing IDOR/ownership
check passes (deliberately *after* that check, not before, so an unauthorized caller can't use this guard's
presence/absence to probe which booking ids are children versus parents) — and before the existing
idempotent-status early return — adds: `if (booking.parentBookingId) → 400 CHILD_BOOKING_NOT_MUTABLE`,
directing the caller to the parent id instead. `/confirm` is internal-key-only today (no guest path), but
the plan applies the same guard there regardless, on the reasoning that a bug or a bad internal caller could
otherwise hit the identical gap. This closes the gap at the mutation layer itself — the second half of the
fix, closing it at the discovery layer, is `GET /bookings/my`'s new `parentBookingId: null` filter (§3):
verified directly to have **no filter of any kind** before this fix, meaning a guest previously had no way
to even learn a child booking id existed through their own booking history, but the mutation-layer guard is
the real backstop regardless of how a child id might otherwise leak to a client.

## 5. The dormant `FIXED_INSTANCE` guard, built ahead of demand

`POST /bookings` validates that all windows in a multi-window request share the same `resourceId` for
`FIXED_INSTANCE` pools (`400 RESOURCE_MISMATCH` on mismatch) — guarding against a guest's multi-hour booking
silently spanning two different physical courts if a `FIXED_INSTANCE` pool's per-window `resourceId`
assignment isn't actually contiguous-court-stable across hours. The plan is explicit that this was built
**now, not deferred**, per Chief's decision, even though the investigation confirmed both real JBC pools are
`POOLED` with `resourceId` null on every real window — meaning there is no real `FIXED_INSTANCE` data today
that this guard actually protects. The stated reasoning: it is the only real safety net for the exact case
this feature targets (a multi-hour booking silently crossing courts), and there is no real continuity data
to lean on instead if it were deferred — building it blind now, scoped correctly, was judged cheaper than
retrofitting it once a `FIXED_INSTANCE` tenant exists and the gap becomes real. The regression suite proves
this guard against a purpose-built two-court `FIXED_INSTANCE` fixture (real JBC data can't exercise it),
confirming the logic is correct even though it has no live tenant to protect yet.

## 6. What was actually built

Matches the corrected plan (Task B) in full, confirmed against the register's Resolution text and commit
`19da595`:

- **Migration**, additive-only, confirmed against real schema before writing: `Booking.parentBookingId`
  (nullable self-relation, `onDelete: Cascade` — confirmed inert in current practice, since no
  `booking.delete`/`deleteMany` call exists anywhere in any service), plus `BookingRule.maxAdditionalWindows`
  (`Int`, default 1). Applied to both `badminton_db` and `badminton_db_test`. `idempotencyKey`'s existing
  `@unique` confirmed live (not just reasoned) to accept multiple `NULL`s.
- **`POST /bookings`** gained optional `additionalWindowIds: string[]`, validated inside the existing
  transaction: combine and sort `[windowId, ...additionalWindowIds]` by `(startTime ASC, id ASC)`; lock each
  `AvailabilityWindow` `FOR UPDATE` in that order (never client-supplied order — the concrete
  deadlock-avoidance mechanism for two concurrent multi-window requests); `maxAdditionalWindows` cap check
  (`400 INVALID_WINDOW_COUNT`); single `resourcePoolId` across all windows (`400 MIXED_RESOURCE_POOL`);
  contiguity check, each window's `startTime` equal to the previous window's `endTime`
  (`400 NON_CONTIGUOUS_WINDOWS`); `FIXED_INSTANCE` `resourceId` match (§5, `400 RESOURCE_MISMATCH`); the
  existing per-window checks (browse-ahead horizon, blocked-window overlap, slot-already-started, capacity)
  run for every window, not just the first; price summed per window via the existing `resolvePrice`; one
  parent `Booking` created (first window, summed price, real `idempotencyKey`) plus one child per remaining
  window (`parentBookingId` set, `price`/`idempotencyKey` null).
- **`/confirm`, `/cancel`, `/check-in`** each gained a new `$transaction` wrapper cascading the identical
  status transition to every child, plus the `CHILD_BOOKING_NOT_MUTABLE` guard (§4).
- **`GET /bookings/admin`** and **`GET /bookings/my`** both filter `parentBookingId: null`.
- **`GET /bookings/:id/cancel-preview`** rejects a child id with `400 CHILD_BOOKING_NOT_PREVIEWABLE`.
- **`POST /refunds/override`** confirmed to need no change (§3).
- **`maxAdditionalWindows`** wired into `POST /booking-rules` and `PUT /resource-pools/:id/booking-rule`
  (the one deviation from the signed-off plan document, §3).
- Cancellation is whole-booking-only in Phase 1 (parent + all children together) — no partial-refund logic
  built, matching the plan's explicit out-of-scope list.

## 7. Verification

New regression coverage (`services/slot-engine/src/regression/multi-slot-booking.regression.ts`, 8
sections, real HTTP calls and database read-backs throughout, per the register row and commit message):
happy-path create-with-`additionalWindowIds` cascading through confirm and check-in; cancel via the parent
cascading to the child with a single nonzero refund computed only on the parent; **direct `/cancel`,
`/check-in`, `/confirm` on a child id all rejected**, with the child's window confirmed still occupied in
browse availability after the rejected cancel attempt — i.e. the exact exploit path in §4, proven closed,
not just asserted closed; `GET /bookings/my` confirmed excluding child rows; the `maxAdditionalWindows`,
contiguity, and `FIXED_INSTANCE` guards each proven with a real 400 and the correct error code (the
`FIXED_INSTANCE` case against the purpose-built two-court fixture per §5, since no real JBC data can
exercise it); and an ordinary single-window booking confirmed byte-for-byte unaffected (unchanged price,
`windowId`, and an empty `childBookings` array).

Full 5-suite regression green, **37/37 slot-engine sections**, rebuilt from `dist` first (per this project's
own rebuild-before-testing rule), against `badminton_db_test`. Whole-repo typecheck and build clean.
`pnpm register:check` and `pnpm diagram:verify` both green before the register close-out commit (`dce5b8b`).

## 8. Honesty check — gaps between the plan and what shipped

- The plan's Task B (the consolidated implementation design) does not itself list wiring
  `maxAdditionalWindows` into `POST /booking-rules`/`PUT /resource-pools/:id/booking-rule` as a step — the
  register row for F-183 names this as "the one deviation from the signed-off plan document," added during
  implementation once the gap (field validated as admin-configurable but with no route ever writing a
  non-default value) was noticed. Flagged, not smoothed over: this is exactly the class of drift rule 8
  ("check current state before trusting a finding's text") exists for, and it was caught and fixed in the
  same batch rather than left stale.
- No PR was found for F-183's implementation (`19da595`) via `gh pr list --repo balaforyou/Platform --state
  all --search "F-183"` — it appears to have gone directly to `main`, consistent with `docs/plans/
  batch-log.md`'s Batch 18 entry describing a single continuous batch (filing → Chief sign-off →
  implementation → close-out) with no PR-review step mentioned at any stage.
- The guest-PWA nested-display follow-up noted in §3 (showing parent+child as one visual "2-hour booking"
  entry) was correctly deferred out of this plan's scope and was picked up later, by F-187 — confirmed
  against the register's F-187 row, which explicitly credits F-183 for the underlying `additionalWindowIds`
  capability it wires up client-side. No gap here; noting it only to confirm the deferral was honored rather
  than dropped.
- No other gap between the plan's Task B and the shipped commit was found — the migration, validation
  sequence, cascade/guard design, and read-path filters all match what commit `19da595` and the register's
  Resolution text describe.

## 9. Sign-off

Already implemented (`19da595`), merged direct to `main`, and register-closed (`dce5b8b`), under the review
flow this project already runs (Claude Code investigate-and-implement → Technical Lead spot-check and
gatekeep → independent re-verification before Chief consolidation) — the plan file itself records Chief's
sign-off on the corrected design before implementation began. This backfill doc requires only doc-level
sign-off before merging — no code change, no register change, no re-verification of already-green
regression evidence.
