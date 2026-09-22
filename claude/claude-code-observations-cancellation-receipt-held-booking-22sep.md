# Observation — cancellation receipt PDF is wrong for a HELD (never-paid) booking

From: Claude Code
Context: Bala's real PDF download (`BK-AA1B0873-cancellation-receipt.pdf`) from a "Hold released"
cancellation on guest-member-pwa. Verified by reading the actual downloaded PDF and the generating
code. Described only, no ID assigned.

---

## The real evidence

The PDF's own content:
```
Status            CANCELLED
Amount Paid       Rs. 600
Original Price    Rs. 600
Refund Percent    100%
Refund Amount     Rs. 600
```

But the modal it was downloaded from (`CancelBookingModal.tsx:127-133`) correctly shows, for this
exact booking:
> "Hold released. Your hold has been released. **No payment was ever taken for this booking.**"

The receipt directly contradicts the screen it came from.

## Root cause, confirmed by code read

`CancelBookingModal.tsx:20-28` already documents this exact class of bug and already half-fixed
it:
> "F-241/F-243: a HELD booking was never paid for, so a refund-tier breakdown and refund-
> processing copy are both nonsensical here -- confirmed via cancel-preview... returning
> `refundPercent:100/refundAmount:price` for HELD regardless, which reads as 'you'll get back
> money that was never charged.'"

That fix was applied to the **on-screen** copy (`isHeld` branches to "No payment has been made...
nothing to refund" both pre- and post-cancel, lines 130-133 / 161-163). It was **not** applied to
the PDF path. The "Download Cancellation Receipt" button (line 135-148) renders unconditionally
for both HELD and real-payment cancellations, and calls `downloadCancellationReceipt(booking,
branchAbout, preview, ...)` — passing the exact same `preview` object the code comment above
already calls nonsensical for HELD, with no `isHeld` check anywhere in that call path.

`receipt.ts:87-106` (`downloadCancellationReceipt`) then unconditionally renders:
- `Amount Paid: Rs. ${booking.price}` (`buildBookingRows`, line 29) — `booking.price` is the
  booking's computed price field, not evidence a real charge happened. For a HELD booking this is
  always populated even though nothing was ever captured.
- `Original Price` / `Refund Percent` / `Refund Amount` straight from `refundPreview` (lines
  99-101) — the same known-nonsensical-for-HELD shape.

So the fix that already exists for the in-app UI simply never reached the PDF generator.

## What's not decided here

Two real directions, either reasonable, not mine to pick:
1. **Bala's instinct**: don't offer "Download Cancellation Receipt" at all for the HELD case —
   there's genuinely nothing to receipt (no charge, no refund, just a released hold).
2. **Make the PDF HELD-aware**, matching what the on-screen fix already does: swap the
   Amount-Paid/Original-Price/Refund-Percent/Refund-Amount block for the same honest "No payment
   was ever taken for this booking" statement the modal already shows.

Either removes the false "you paid ₹600 and got ₹600 back" implication; which one is the right
product call is for Bala/Chief.

---

## Summary for Chief

Real, confirmed, precisely located: `CancelBookingModal.tsx`'s own F-241/F-243 fix for HELD
bookings' refund-preview honesty was applied to on-screen copy but never extended to
`downloadCancellationReceipt` in `receipt.ts`, so the downloadable PDF still shows a fabricated
payment-then-refund cycle for a booking that was never actually charged. Not fixed here.
