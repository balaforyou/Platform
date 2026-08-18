# F-037 — human-readable booking reference on the pre-payment screen

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Display-layer only. The booking UUID remains the primary key and is untouched in every API, URL
> and database path.

## Context

`BookingPay.tsx:218` renders `{booking.id.slice(0, 8)}...` under the label "Booking ID" — a truncated
raw UUID fragment, shown to a paying customer as `0ba261af...`. It is a fifth instance of the pattern
F-029 fixed in four other places and F-034 records as recurring.

---

## Investigation findings

### 1. Exact location — one line, and it is the only one left

`apps/guest-member-pwa/src/components/BookingPay.tsx:217-218`, inside the "Booking Summary" block. It
is already truncated to 8 hex characters plus an ellipsis, which is arguably worse than the full
value: meaningless to the customer *and* incomplete to quote.

A sweep of **both** apps for user-visible raw-ID renders found **no others in the guest PWA** — every
other `.id` use is a URL, an API path, a React key or an element id. So this is genuinely the last
customer-facing one.

### 2. Relationship to F-029 — same *pattern*, different *fix shape*

**F-029 is Resolved and does not need re-fixing.** Its four locations leaked raw **user** IDs and
were fixed by substituting the **phone number** — a value that already existed and was meaningful to
a human.

**That substitution is not available here.** A booking UUID has no human-meaningful equivalent
already in the data. F-037 therefore needs a *derived* display value, which F-029 never did. Calling
them "the same fix" would be wrong.

**Answering the scope question explicitly, as asked:** a single reusable approach is worth building,
but **not** because F-029's locations need revisiting — they are already correct. It is worth it
because this is the **second recurrence** of F-034's pattern, and the next one should have somewhere
obvious to go. The helper is small; the discipline is the point.

**F-029's own resolution left a caveat to check "next time that code is touched" — this is that
time, and the answer is: partially shared.** `admin-web` has a real helper,
`formatMemberContact()` (`main.tsx:294`), used by Assignments (`:1519`); the PWA does it inline
(`BookingHistory.tsx:213`). Not a defect, but it explains why the pattern keeps reappearing.

**One latent instance found in passing, not in F-037's scope:** `admin-web/src/main.tsx:1519` renders
`assignment.resourcePool?.name || assignment.resourcePoolId` — falling back to a **raw pool UUID**
whenever the name is missing. Admin-facing, not customer-facing, and currently invisible because
names are always set. Reporting it rather than folding it in.

### 3. Severity — the corrected read is accurate, and this is now polish

**Confirmed.** F-090, F-091 and F-097 are all **Resolved**, and F-071's `requireBookingAccess`
(`slot-engine/src/index.ts:221`) guards every booking-scoped route — cancel, get, cancel-preview and
check-in — enforcing tenant boundary *and* ownership-or-branch-admin, reading both facts from the
booking row rather than the request.

So knowing a booking ID grants **nothing**. It is no longer an attack parameter, and F-037's original
compounding effect on F-090 is gone. **This is a professionalism issue now, not a security one**, and
the resolution should say so rather than inheriting the original framing.

### 4. Backward compatibility — nothing depends on the raw ID being visible

The strongest evidence is that the admin path was *deliberately designed* to avoid it.
`GET /bookings/admin` exists precisely for this, and says so at `slot-engine/src/index.ts:3159-3160`:
*"Admin Web refund override needs a phone-first booking picker. This listing keeps raw booking UUIDs
out of the primary UI."* Admin-web's refund flow uses `UserLookup` (phone) and then picks a booking —
it never asks anyone to quote an ID.

So no support or admin workflow requires the customer to read this value back.

---

## The change

### A shared, derived reference — display only

Add `formatBookingReference(id: string): string` to `packages/ui-shared` (both apps already import
from it: `admin-web/src/main.tsx:25`, `BookingPay.tsx:3`). Derive deterministically from the UUID —
no new column, no data-model change, no storage:

```
formatBookingReference('0ba261af-a727-42ad-99b5-7146c73c02a3')  ->  'BK-0BA261AF'
```

Deriving from the real ID rather than inventing a random code is the load-bearing decision: it keeps
the displayed value **traceable back to the booking** by prefix match, so if support ever does need it,
it works — without the customer reading out a 36-character UUID.

Use it at `BookingPay.tsx:218`, relabelled from "Booking ID" to **"Booking Reference"**, since it is
no longer an ID and calling it one is what made the raw value feel appropriate to show.

### Consistency — decided, not left to accident

The other place a customer could compare against is the **confirmation screen**, which shows **no
identifier at all**. So there is no screen displaying a raw booking UUID for this to look inconsistent
against — the change removes the only one. No jarring mismatch is created.

I am **not** changing `BookingHistory` (shows no ID) or the admin fallback (§2, separate finding).

---

## Verification

- **Real before/after screenshots of the actual payment screen**, driven through a genuine booking in
  the browser, not a mock.
- **No functional change proven, not assumed**: the same booking id in the URL, the same
  `GET /slot-engine/bookings/:id` call, and the same `bookingId` in every payment-intent and
  order payload (`BookingPay.tsx:34`, `:56`, `:100`, `:103`). Only the rendered string differs —
  confirmed by checking the network calls, not just the pixels.
- Full regression across all five suites; whole-repo typecheck and build; rebuild before testing (F-085).
- Register: F-037 to Resolved **with the corrected severity recorded** — polish, not security, and why.

## Out of scope

F-029 (Resolved, correctly). F-034's broader sweep. The admin `resourcePoolId` fallback found in §2 —
reported for its own ID. Any change to the booking UUID itself or anything that consumes it.
