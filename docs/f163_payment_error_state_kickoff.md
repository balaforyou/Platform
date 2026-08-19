# F-163 — stop a retry-able payment event from painting a failure screen

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Small and scoped: one component, one error-state split, plus the copy bug found alongside it.

## Context

A real-device report showed payment briefly displaying failure before correcting to success. The
investigation (F-163) established the mechanism and, importantly, the severity: **the backend was never
wrong.** Every PaymentIntent on the deployed database is `captured` or `pending`, not one row is
`failed` or `expired`, no code path writes `status: 'failed'`, and there are zero inconsistencies in
either direction between bookings and intents.

The defect is entirely in one component. `rzp.on('payment.failed')`
(`apps/guest-member-pwa/src/components/BookingPay.tsx:160`) fires for a **failed attempt while
Razorpay's checkout is still open and still recoverable**. Its handler calls `setError(...)`, and
because the render guard at `:180` is `error || !booking`, that single call **replaces the whole page
with a failure screen underneath the still-open modal**. The customer retries in the same session,
succeeds, and the app navigates onward — producing exactly the reported sequence. The error is never
cleared once set, since `setError(null)` runs only when the pay button is pressed, and that button is
no longer rendered.

Two distinct kinds of failure are being funnelled into one state: **fatal** (the booking or intent
could not load — the page genuinely cannot proceed) and **recoverable** (a payment attempt failed, the
customer can simply try again). Only the first should take over the page.

## The change — one file, `BookingPay.tsx`

**Reuse the pattern already proven in this repo rather than inventing one.** `CourtBooking.tsx` solves
exactly this: a separate `bookingError` state rendered as an inline banner at `:323-329`
(`bg-red-50 border border-red-200 … text-red-700` with a `ShieldAlert` icon) that never replaces the
page, and — the part `BookingPay` is missing — **is cleared at the start of each attempt** (`:122`) and
on re-selection (`:257`).

1. **Split the state.** Keep `error` for fatal load failures only; add a recoverable one alongside it,
   matching `CourtBooking`'s naming and banner markup.
2. **Route each existing `setError` call site to the right bucket:**
   - *Fatal, page-level:* the `initPayment` catch (`:39`) and the missing-Razorpay-key guard (`:110`) —
     the page genuinely cannot proceed, and with only these left the existing
     **"Failed to load booking details" heading finally becomes accurate**, which is the copy bug
     resolved by correct routing rather than by rewording.
   - *Recoverable, inline:* `payment.failed` (`:160`), the SDK-load failure (`:89`) and the
     create-order failure (`:165`) — all retry-able with the page intact.
3. **Clear the recoverable error** when a new attempt starts, mirroring `CourtBooking:122`, so a
   successful retry cannot leave a stale failure on screen.

No backend change. No change to `verify-payment`, the webhook, or the confirmation screen.

## Deliberately NOT folded in — flagged, not fixed

Both were found during this investigation and are **not** part of the reported bug. Recording them
rather than absorbing them silently:

- **The `handler` catch (`:140`) shows "Signature verification failed" on a client-side verify error —
  while the webhook may well have captured the payment anyway.** DECISION-006 makes those two paths
  independent by design, so the client failing does not mean the payment failed. Arguably it should
  route to the confirmation screen and let its poll resolve the true state. That is a **behaviour**
  change, unreported and unproven, so it needs its own decision rather than riding along here.
- **The confirmation screen's poll gives up after 30 seconds** (20 attempts at 1.5s,
  `BookingConfirmation.tsx:47-56`) leaving the benign amber "Confirming Payment…" spinner on screen
  indefinitely if capture takes longer. Real capture durations on the deployed data span 39s to 284s,
  though that measurement spans intent creation to capture and therefore includes customer think-time,
  so it is an upper bound and **not** evidence that capture itself is slow. Worth its own look.

## Verification

**Before/after by injecting the real event, per your decision.** The fix concerns how the app reacts to
`payment.failed`, not whether Razorpay emits it, so the proof dispatches that same event against the
**deployed** app and captures the rendered result:

| | Expected before | Expected after |
|---|---|---|
| Page | replaced by the failure screen | intact, summary and pay button still shown |
| Message | "Failed to load booking details" | inline red banner carrying Razorpay's real reason |
| Retry | impossible — the button is gone | pay button still present and usable |
| After a successful retry | — | banner cleared, navigates to confirmation |

Captured by reading the live DOM, so the evidence is the rendered result rather than a claim about it.

Then: whole-repo typecheck, build, all five regression suites — run with the ports free and against the
disposable database (F-151). Rebuild before testing (F-085).

**No database assertions needed here** and none will be claimed: the investigation already established
this path never writes to the backend, and this change does not alter that.

## Out of scope

The two flagged items above. Any change to `verify-payment`, the Razorpay webhook, or capture
idempotency. The confirmation screen. Razorpay's hosted overlay styling (F-154).
