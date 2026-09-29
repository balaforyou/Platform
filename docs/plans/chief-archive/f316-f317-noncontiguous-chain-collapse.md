# Chief decision — F-317: collapse non-contiguous multi-slot booking into F-183's single-booking chain model, deprecating `POST /booking-orders`

**Date:** 28 Sep 2026
**Decided by:** Chief + Bala
**Supersedes:** F-310's Phase 1/2 architecture (`orderId`-linked independent `Booking` rows via
`POST /booking-orders`). Resolves F-316 (N-separate-checkouts friction) by eliminating its root
cause rather than building combined order-level payment.

## Decision

Reuse F-183's existing parent/child `Booking` chain model (`parentBookingId`, one real
`PaymentIntent` on the parent) for non-contiguous slot selection, rather than the independent-rows
model F-310 shipped. Concretely: relax `NON_CONTIGUOUS_WINDOWS` only — keep `MIXED_RESOURCE_POOL`
as-is (same pool required, matches real usage so far). One booking, one payment, one cancellation
for the whole selection.

## Why this reverses F-310's own architecture call

F-310's original kickoff deliberately chose a new, independent route specifically to keep F-183's
hardened chain path untouched. That reasoning was sound at the time — it's being revisited because
real, live testing (Bala's 3-slot order, `BK-8275B7BF`/`BK-C157FE00`/`BK-78D24C8B`) surfaced the
actual cost of the independent-rows choice (F-316: 3 separate Razorpay checkouts for one guest
action) in a way the original design review couldn't have felt in advance.

## Addendum, 28 Sep 2026 — Bala's answers to the open implementation questions

1. **Cascade-cancel: target behavior is a single cascaded delete.** Cancelling the parent of a
   chain must cancel every child in one action. If F-183's existing cancel path already does this,
   confirm it with a real test and reuse as-is. If it doesn't (the F-310 Phase 1 handover's own
   text implied per-row independent cancellation even for F-183 chains, modeled on the F-207.2
   sweep precedent), **build it as part of F-317** — this is a real, in-scope requirement of the
   decision, not optional. Either way, confirm the real current behavior first per rule 2 before
   writing the plan; don't assume either direction.
2. **Don't remove `POST /booking-orders`/`orderId`/the whole-order daily-cap logic/
   `BranchBooking.tsx`'s multi-select submit path.** Mark them clearly as deprecated-but-kept —
   e.g. a header comment block: "DEPRECATED as of F-317 (28 Sep 2026) — superseded by F-183 chain
   reuse for non-contiguous booking. Not wired into any active UI path. Kept for possible
   extraction into a generic multi-booking component in a future project." Not deleted, not
   silently orphaned — discoverable and explained for whoever finds it later.
3. **No data migration needed.** Still in UAT — the small number of real `Booking` rows created
   via `POST /booking-orders` during F-310's own testing (JBC + courtowner1) don't need handling.
   Leave as-is or clean up ad hoc; not a blocker or a planned step.

## Real cost, stated plainly, not glossed over

This deprecates real, shipped, tested code from F-310 Phase 1/2 (PRs #114/#116, merged) — kept per
point 2 above, not deleted, but no longer the active mechanism.

## Assignment

**F-317** — Chief-assigned, rule 5. Collapse non-contiguous multi-slot booking into F-183's
single-booking chain model; deprecate (not delete) `POST /booking-orders`/`orderId`. Status: Open,
plan-mode investigation authorized now, informed by the addendum above. Supersedes F-310 Phase 1/2's
shipped mechanism. Resolves F-316 by elimination — F-316 closes as "superseded by F-317" once F-317
lands.

## Next step

Plan-mode investigation, per rule 1 — real code read + real test to confirm/build single
cascaded-cancel behavior, plus blast radius of relaxing `NON_CONTIGUOUS_WINDOWS`. No implementation
until the plan comes back and is signed off.

---

## Handover — F-317 plan-mode investigation kickoff

**From:** Chief
**Date:** 28 Sep 2026
**Status:** Cleared to start the investigation and write a real plan. Stop after the plan for
explicit sign-off before implementing anything, per rule 6.

**Finding ID:** F-317 (Chief-assigned, rule 5). Supersedes F-310 Phase 1/2's `orderId`/
`POST /booking-orders` mechanism. Resolves F-316 by elimination (close F-316 as "superseded by
F-317" once this lands, not built separately).

### What's decided already — don't re-litigate these

- Reuse F-183's existing parent/child `Booking` chain model for non-contiguous slot selection.
  Relax `NON_CONTIGUOUS_WINDOWS` only — keep `MIXED_RESOURCE_POOL` as-is (same pool required).
- Cascade-cancel is a hard requirement, not optional: cancelling the parent of a chain must cancel
  every child in one action. Confirm the real current behavior first (don't assume) — if F-183
  chains already cascade-cancel, reuse it and prove it with a real test; if they don't (Phase 1
  handover text implied they don't), build it as in-scope work here.
- Don't delete anything from F-310 Phase 1/2. `POST /booking-orders`, `orderId`, the whole-order
  daily-cap logic, `BranchBooking.tsx`'s multi-select submit path via booking-orders — all kept,
  marked deprecated with a clear header comment (name F-317, the date, "not wired into any active
  UI path", "kept for possible extraction into a generic multi-booking component in a future
  project").
- No data migration. Still UAT — the real `Booking` rows already created via `POST
  /booking-orders` during F-310's own testing don't need handling.
- The slot-selection UI in `BranchBooking.tsx` does not change. `toggleSlotSelection`, the
  multi-select grid, the per-slot panel (rows + summed price), the capacity-display logic — all
  stay exactly as built. Guests select non-contiguous slots exactly the way they do today.

### What actually changes — scope this for real in the plan

1. `doReserve`'s `> 1` branch: stops calling `POST /booking-orders`. Instead creates a real
   F-183-style chain — same pattern as the existing single/contiguous path, with
   `NON_CONTIGUOUS_WINDOWS` relaxed for this call. Confirm the real mechanics of how
   `POST /bookings` (or whatever the real chain-creation entry point is) builds a parent +
   children today before assuming the new call shape.
2. Post-submit navigation for multi-slot reserve: should now behave like the single-slot path —
   navigate straight to one `/bookings/:id/pay` (the parent's id) — since there's genuinely one
   booking and one payment, not an order needing a held/rejected summary screen. The inline
   held/rejected banner UI from F-310 Phase 2 is no longer the right post-submit experience for
   this path; scope what replaces it (does a chain-create call need its own partial-failure
   handling given `MIXED_RESOURCE_POOL`/same-pool booking, or is that not a real scenario for a
   single-pool chain the way it was for cross-pool orders?).
3. `BookingHistory.tsx` display: confirm for real (not assumed) that the existing
   `childBookings`-based F-187 rendering correctly displays a non-contiguous chain once one
   exists — it predates F-310 and shouldn't care about contiguity, but prove it with a real chain
   booking before relying on it. If it does work, F-310's "Order of N" `orderId`-grouping code is
   unnecessary for new bookings and gets marked deprecated alongside the rest, not replaced.
4. Blast radius of relaxing `NON_CONTIGUOUS_WINDOWS`: every real consumer of that check, confirmed
   against current code (rule 3a) — not just the one call site assumed at F-310 Phase 1 kickoff
   time.

### Verification bar for the eventual plan (real evidence, per rule 2)

Real chain booking with genuinely non-contiguous, same-pool windows created; real cascade-cancel
proven with a DB read-back showing every child row transitions on one cancel call; real payment
through the existing single-`PaymentIntent` flow to `CONFIRMED` on the whole chain; real
confirmation that `BookingHistory.tsx` renders it correctly via existing F-187 code with no new UI
work, or real evidence of exactly what small gap needs filling if it doesn't. Full regression suite
green, rebuilt from `dist` per rule 7, including confirmation that F-183/F-186/F-187/F-207/F-268's
existing coverage is unaffected by relaxing `NON_CONTIGUOUS_WINDOWS`.

### Sign-off

Investigation and plan only for now. No commit without explicit sign-off, per rule 6 — report back
with the real plan, especially the cascade-cancel finding, before implementation starts.
