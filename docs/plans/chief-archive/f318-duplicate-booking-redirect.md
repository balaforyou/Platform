# Chief handover — F-318: duplicate-HELD-booking detection + redirect

**From:** Chief (reviewer thread)
**Date:** 29 Sep 2026
**Status:** Assigned, investigated in plan mode, implemented, live-fire verified, landed.

## Context

Surfaced during PR #118 review: a guest who reaches `/bookings/:id/pay` after a real hold and
navigates back (the Pay screen's own back arrow, `navigate(-1)`), then resubmits the same
selection, created a second, independent `HELD` booking — a fresh idempotency key per submit
bypasses the existing idempotency-key replay guard. Reproduced live before any fix: two real
`POST /bookings` calls, same guest/window, different idempotency keys, two independent `201`s,
two independent `HELD` rows, confirmed via DB read-back.

## Assignment

**F-318** — Chief-assigned. Severity: Medium-High, business-risk not security-risk. No exploit
path, but real: a guest hitting back and resubmitting (an easy, common mobile gesture) can
silently burn their own daily booking cap on a booking they never completed, and briefly lock
court capacity away from a real second guest for up to 5 minutes.

## Design decision: Option 1, not Option 2

**Option 1 (chosen): detect an existing unpaid `HELD` booking for the same guest/pool/exact
windows, redirect to its `/pay` screen.** Guest-intent-agnostic — closes the hole regardless of
how the guest ends up back at `doReserve` with the same selection (back button, browser refresh,
a second tab), without needing to decide what "back" means.

**Option 2 (rejected): auto-cancel the hold on back-navigation.** "Back" is also how a guest
legitimately double-checks something else without meaning to abandon their hold — auto-cancelling
on that gesture would surprise a guest who comes back expecting their hold intact. It also
doesn't fully solve the problem alone — a guest could still resubmit before the cancel completes.

## Scope

1. **Primary (required):** `services/slot-engine/src/index.ts`, `POST /bookings` — before
   creating a new chain, check for an existing unpaid `HELD` booking for the same guest on the
   same pool/exact window set; redirect to its `/pay` screen instead of creating a duplicate.
2. **Secondary (bundled, same root cause, low-risk):** persist `selectedSlots` to
   `sessionStorage` in `BranchBooking.tsx`, restored on mount — solves the "lost my selection"
   friction directly, reduces how often a guest even reaches the resubmit scenario.

## Verification bar (stated up front)

Reproduce the duplicate live — two real submits for the same selection, DB read-back showing two
independent `HELD` chains exist before the fix — then confirm the fix collapses that to one, with
the redirect landing correctly on the original chain's `/pay` screen.

## Real evidence delivered

- **Detection query shape investigated in plan mode**: exact window-ID-set equality (not
  "overlapping"), reusing the exact same `userId`/`status`/`parentBookingId: null` shape the
  existing daily-cap check (`index.ts:4209-4228`) already uses. Placed after the existing
  window-lock step so a genuine concurrent resubmit is naturally serialized by those same locks.
- **Pre-fix reproduction, real**: two real `POST /bookings` calls, same guest, same window,
  different idempotency keys → two real `201`s, two independent `HELD` rows (DB read-back).
- **Post-fix collapse, real**: second submit returns `200` with the same `booking.id`; DB
  read-back confirms exactly one row. Re-proven a second time live against the real post-#118-merge
  `main`, on JBC's real data.
- **No false positive**: a genuinely different window selection for the same guest still creates
  a new, independent chain (`201`).
- **A pre-existing concurrency test's reuse of one user ID across two of three "concurrent"
  requests was corrected** (`guest-booking.regression.ts`) — F-318 correctly turned that test's
  old premise (duplicates weren't deduplicated yet) into a duplicate-resubmit case; fixed with a
  genuinely distinct third user, preserving the test's real 3-way-capacity-contention intent.
- **`sessionStorage` restore**: a real race was found and fixed during verification — the
  write-through effect fired before the async restore attempt resolved, wiping the saved
  selection before it could ever be restored. Fixed with a `restoreAttemptedRef` gate. Also
  found and fixed: the selection was being cleared on successful submit, defeating the entire
  point of the fix (the guest needs it restored specifically after reaching Pay and going back).
  Both bugs caught by live browser testing against the real Pay screen's `navigate(-1)` back
  arrow, not assumed correct from reading the code.
- **126/126 regression sections pass**, rebuilt from `dist`, run against `badminton_db_test`,
  confirmed on both the pre-merge working tree and the real post-#118-merge `main`.
- Whole-app typecheck and build clean for `slot-engine` and `guest-member-pwa`.

## Sign-off

Landed per Chief's explicit "no further sign-off needed for this sequence" handover (29 Sep
2026) — code already built and live-fire verified in a prior round; this pass re-verified it
against the real post-#118-merge `main` before commit, per rule 2.
