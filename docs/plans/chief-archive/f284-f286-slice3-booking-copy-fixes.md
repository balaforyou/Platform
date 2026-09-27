# Handover to Claude Code — Slice 3: guest-member-pwa booking/payment copy (F-284, F-286)

**From:** Chief Architect thread
**Status:** Kickoff. Both product decisions already made (below) — investigate first if anything
is stale (rule 8), implement, real evidence, stop for sign-off before merge (rule 6).

Both touch guest-member-pwa's booking/payment area but different files — fine to ship in one
PR/branch, each keeps its own ID/evidence per rule 9.

## F-284 (Medium) — "X seats" wording

Re-confirmed this session, current `main`: identical logic in both
`BranchBooking.tsx:678` and `CourtBooking.tsx:727`:
```tsx
{isAlmostFull ? `${slot.remainingCapacity} left` : `${slot.remainingCapacity} seats`}
```
**Chief's decision, already made**: reword, don't remove the count. "Seats" is the wrong domain
word (a court isn't a seat) and ambiguously suggests player-count rather than remaining
bookable-court capacity. Change the non-almost-full case to **"X courts open"**, keep the
existing **"X left"** for the already-implemented `isAlmostFull` branch as-is (that one already
reads correctly as "spots remaining"). Apply identically in both files — same logic, same fix,
don't let one drift from the other.

## F-286 (Medium) — cancellation receipt PDF fabricates a payment/refund cycle for HELD bookings

Re-confirmed this session, current `main`: `CancelBookingModal.tsx` already computes `isHeld`
(line 26) and already branches the on-screen success copy correctly (lines 124-129: "Hold
released... No payment was ever taken for this booking" for HELD, the real refund-amount
sentence otherwise). The "Download Cancellation Receipt (PDF)" button (lines 132-146) renders
**unconditionally** for both cases and calls `downloadCancellationReceipt(booking, branchAbout,
preview, ...)` with no `isHeld` check — `receipt.ts` then unconditionally renders Amount
Paid/Original Price/Refund Percent/Refund Amount straight from `preview`, which is the same
known-nonsensical-for-HELD shape the on-screen fix already worked around.

**Chief's decision, already made (Bala's own instinct, confirmed)**: don't render the "Download
Cancellation Receipt" button at all when `isHeld` is true — there's genuinely nothing to receipt
(no charge, no refund, just a released hold). Simpler and safer than making the PDF
HELD-aware, and permanently removes the fabricated-figure risk rather than patching its content.
Gate the button on `!isHeld`, leave the `cancelled`/non-HELD success path and its receipt download
completely untouched.

## Real evidence required before sign-off (rule 2)

- F-284: real screenshots of both `BranchBooking.tsx` and `CourtBooking.tsx` slot cards showing
  "X courts open" for a normal-capacity slot and the unchanged "X left" for a near-full one
  (real data, dev-stack is fine).
- F-286: real screenshot/walkthrough of a HELD-booking cancel showing no download button at all;
  confirm a real paid-booking cancel still shows the button and the PDF still downloads correctly
  with real refund figures (unchanged behavior for that path).
- `npx tsc --noEmit` / build clean for guest-member-pwa.
- Full regression suite rebuilt from `dist` (rule 7) — confirm clean per standing discipline.

## Close-out

Batch-log entry citing both IDs with their own evidence each. Register rows for each. Branch cut
fresh off current `main`, PR opened, stop for sign-off before merge (rule 6).
