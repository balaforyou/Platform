# Chief handover — F-320: PDF receipt's Time row drops chain windows

**From:** Chief (reviewer thread)
**Date:** 30 Sep 2026
**Status:** Assigned, plan-mode investigated with a real correction mid-flight, implemented,
live-verified with real downloaded PDF bytes, landed.

## Context

Bala reviewed a real downloaded booking receipt PDF for a single-slot booking and asked whether a
multi-slot, multi-court booking would render correctly. Investigated by reading
`apps/guest-member-pwa/src/lib/receipt.ts` directly and comparing it against the three on-screen
components that already handle multi-window chains correctly.

## Root cause

`buildBookingRows` (`receipt.ts:9-31`) built the "Time" row from `booking.window` alone and never
read `booking.childBookings` -- unlike `BookingConfirmation.tsx`, `BookingPay.tsx`, and
`BookingHistory.tsx`, which all already render every window in a chain (base + `childBookings`,
F-187) via `formatWindowRangesLabel`. For a multi-window chain booking (F-183/F-317), the PDF
receipt's Time row silently dropped every window after the first, while "Amount Paid" (F-317's
`resolvedPrice`) correctly showed the total across the whole chain -- making the receipt actively
misleading: one listed hour, full multi-slot price.

## A real correction made mid-investigation

The initial relay also claimed the "Court" row was incomplete, on the theory that court assignment
can differ per window within one chain -- citing `assignPooledCourt(sibling, active)` at
`slot-engine/index.ts:5872`. Chief's own independent read initially confirmed that same line. Both
readings were wrong: line 5872 sits inside `tryRelocateBooking` (F-207.2), a function that moves a
single existing booking to a *different resource pool entirely* when its own pool fills -- it has
nothing to do with how windows within one chain, in one pool, get their court.

The actual chain-creation path (`index.ts:4406-4487`) computes a single `assignPooledCourt(pool,
active)` result **once per chain** -- unioning active bookings across every window the request
touches -- and reuses that one `resourceId`/`courtSlotIndex` pair for the parent booking and every
child booking in the loop. A multi-window chain is always on one court, by design; there is no
per-window assignment anywhere in this path.

Confirmed live, twice, on the real JBC dev stack:
- A fresh 06:00-07:00 + 07:00-08:00 chain landed on Court 1 for both windows.
- A second fresh 09:00-10:00 + 10:00-11:00 chain, with Court 1 deliberately pre-occupied at
  10:00-11:00 by a throwaway single-slot booking beforehand, still landed on Court 2 for **both**
  windows -- not a split assignment -- because the algorithm looks for one court free across the
  whole requested set, not one independently per window.

Chief re-read `index.ts:4400-4487` directly against `origin/main` and confirmed the correction
before the plan was written. This is the project's own self-detected-contradiction discipline in
action: a wrong premise, independently "confirmed" once already, caught and corrected rather than
left to stand or quietly re-litigated later.

## Revised scope

Because court assignment is uniform across a chain, the "Court" row showing one court for the whole
booking is correct as written -- no fix needed there, and `describeCourtAssignment` (F-263's
territory) stays untouched, per rule 9. The fix is the Time row only.

## Fix

`buildBookingRows`'s Time row now calls `formatWindowRangesLabel` the same way the three on-screen
components already do:

```ts
formatWindowRangesLabel(
  [{ window: booking.window }, ...(Array.isArray(booking.childBookings) ? booking.childBookings : [])],
  branchAbout?.timezone,
)
```

No backend change -- `booking.childBookings` was already present on every `booking` object passed
into `receipt.ts` today, the same shape the on-screen components already consume.

## Blast radius

`buildBookingRows` is shared by both PDF generators in `receipt.ts`:
- `downloadBookingReceipt` -- called from `BookingConfirmation.tsx` and `BookingHistory.tsx`
- `downloadCancellationReceipt` -- called from `CancelBookingModal.tsx` and `BookingHistory.tsx`

Both fixed by the one change. No other consumers of `buildBookingRows` exist (confirmed via
full-repo grep).

## Real evidence, byte-level

The actual downloaded PDF's raw content was read directly, not inferred from the on-screen
confirmation or the code: `URL.createObjectURL` was monkey-patched in the live browser session to
capture the real `application/pdf` `Blob` jsPDF hands the browser before triggering the download,
and its raw bytes parsed for `Tj` text-draw operators -- the literal strings jsPDF actually drew.

- **Pre-fix:** a real two-window chain (`BK-D5566F28`, 09:00-10:00 + 10:00-11:00, Court 2, ₹800)
  downloaded with `Time: "09:00 AM - 10:00 AM"` only -- the second window silently gone;
  `Amount Paid: Rs. 800` unaffected.
- **Post-fix, three cases, same live dev stack:**
  1. A fresh equivalent chain (`BK-4A4F68EF`) downloaded with
     `Time: "09:00 AM - 10:00 AM, 10:00 AM - 11:00 AM"` -- both windows present, comma-joined,
     matching the on-screen confirmation's own format exactly.
  2. A single-window booking (`BK-EDFE1152`) downloaded with `Time: "11:00 AM - 12:00 PM"` --
     identical in shape to the pre-fix single-window format, confirming no regression.
  3. Cancelling the fixed multi-window chain and downloading its cancellation receipt showed the
     same corrected two-window Time string, confirming the shared-helper fix covers both PDF
     generators, not just `downloadBookingReceipt`.
- Whole-app typecheck and build clean, verified twice (pre-branch-split working tree, then
  re-verified on the real PR branch branched fresh off `origin/main`'s real post-PR-#121 tip).

## Sign-off

Plan approved as written, including the corrected scope (Time row only, Court row untouched).
Cleared to implement; report back with the real re-verification evidence (chain PDF bytes showing
both windows, single-window PDF unchanged, cancellation-receipt case) before requesting merge
sign-off.
