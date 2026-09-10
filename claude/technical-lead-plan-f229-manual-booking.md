# Technical Lead Plan — F-229 (admin-assisted-manual-booking-cash-payment)

**Status:** Investigation complete against real `main` (`0fb9337`, current as of the F-220 close-out
merge). Chief's handover (`claude/claude-code-handover-f229-manual-booking.md`) and the discovery
doc (`claude/discovery-unified-login-manual-booking.md`) were not taken on their word — every real-
code citation in both was independently re-checked (rule 8), and this pass surfaced one genuinely
new fact neither document had (§2.6 below) plus two of the handover's own flagged uncertainties
now resolved with certainty (§2.1, §2.2). §2.6's decision is resolved (Option B, Bala's call, 10
Sep 2026). The approved mockup (`https://claude.ai/code/artifact/48b82ce8-aa5d-4daf-878a-
bd946cedaf66`, "F-229 Manual Booking" — two artboards, "Reservations — Walk-in Booking" and
"Ledger") was read and reviewed against this plan (§2.7) — it surfaced one real new capability
neither source document scoped, now resolved with Bala. **The plan below is complete and ready to
hand to Claude Code.**

---

## 1. What's confirmed real, unchanged from the handover

All independently re-verified directly against `services/slot-engine/src/index.ts`,
`services/payment/src/index.ts`, `services/identity-auth/src/index.ts`,
`packages/database/prisma/schema.prisma`, and `apps/admin-v2/src/screens/GuestManagementScreen.tsx`
on real `main`:

- `POST /bookings/negotiated` (slot-engine, internal-key only) — real, does everything F-229's
  booking-creation step needs, no changes required.
- `POST /payment-links/negotiated` (payment) — real, `requirePaymentLinkAdmin` dual-path auth
  (`INTERNAL_SERVICE_KEY` OR JWT with `owner`/`branch_manager:<branchId>` role) confirmed exactly
  as described. This is the auth helper F-229's two new routes should reuse as-is.
- `POST /refunds/override`'s audit pattern (adminId always from `request.jwtVerify()`, never the
  body) — real, correct precedent for the new cash-confirm route.
- `guestStandardRate`/`guestPeakRate`/`guestPeakWindows` on `Branch`, `resolveGuestBlanketRate` —
  real and live, correct source for the price pre-fill.
- `Booking.isMemberBooking` — real field, correct filter for the Ledger's Guest tab.
- `GuestManagementScreen.tsx`'s Reservations tab is a real, honest `EmptyState`, its own source
  comment naming F-204 verbatim.
- `phone_tenantId` find-or-create in `/auth/otp/verify` — real, correct precedent.
- `/ledger` is a real `StubScreen` today ("Subscription Ledger" — genuinely mis-scoped copy,
  confirmed), no module gate — matches the handover.

## 2. What this investigation resolved or corrected

### 2.1 `User.name` — confirmed absent, not just "unconfirmed"

Read the full `User` model directly: `id, tenantId, phone, email, googleId, isPhoneVerified,
isEmailVerified, userType, createdAt, updatedAt` plus relations. **No `name` field exists at
all.** The handover flagged this as "confirm before assuming" — confirmed: a new nullable `name
String?` column is real, required schema work, not a maybe.

### 2.2 No generic `Payment` model — reuse `PaymentIntent`, and the exact shape to use

There is no `Payment` model in the schema — only `PaymentIntent`, `Subscription`, `Refund`. The
handover flagged "check `Payment` model shape before designing this row structure." Resolved: the
cash-confirm route creates a `PaymentIntent` row directly, matching the exact shape
`createPaymentLinkForHeldBooking` (`services/payment/src/index.ts:769`) already uses for the link
path, with two fields set differently:

- `amount`: same rupees→paise conversion as the real code does today —
  `Math.round(Number(negotiatedPrice) * 100)`. **Real unit fact worth stating plainly**:
  `Booking.price`/`negotiatedPrice` are `Decimal` rupees; `PaymentIntent.amount` is `Int` paise.
  Getting this conversion right (by copying the existing line verbatim, not re-deriving it) avoids
  a real class of bug this project has hit before with mismatched units.
- `gatewayRef`: needs a synthetic, unique value since there's no real Razorpay reference — same
  naming shape as the existing `plink_mock_<hash>` convention, prefixed by method so the Ledger
  (§2.4) can derive a real badge from it without a new column: `cash_<uuid or hash>` for cash,
  `upi_<the admin-entered UPI transaction ID>` for the QR path added in §2.7. Must satisfy the
  real `@unique` constraint on this column — for the UPI case specifically, reuse the exact
  P2002-catch-and-return-existing pattern `createPaymentLinkForHeldBooking` already has (§2.2's
  cited function), since a real UPI transaction ID is admin-typed and could plausibly be
  resubmitted.
- `status: 'captured'` set directly at creation (skipping `'pending'`) — this is the one real
  difference from the link path, and it's exactly what makes this a *manual* capture: no webhook
  will ever fire for a cash or UPI-QR payment, so the intent has to be born already-captured.
- `purpose: 'guest_booking'` — matches the existing convention for all three payment paths (cash,
  UPI-QR, link); `purpose` describes what the payment is for, not how it was paid, so it doesn't
  vary by method.

### 2.3 The real HELD→CONFIRMED transition primitive already exists — reuse it, don't reimplement

Read the real Razorpay webhook handler (`services/payment/src/index.ts:405`) end to end: on
`payment.captured`, it marks the `PaymentIntent` captured, then calls
`POST /bookings/:id/confirm` (slot-engine, internal-key only, `services/slot-engine/src/
index.ts:3344`) — which is idempotent, correctly rejects a non-`HELD` booking, and correctly
cascades the transition to F-183 child bookings atomically. **The cash-confirm route should call
this exact same internal endpoint the same way the webhook does** — not write its own
`booking.update({ status: CONFIRMED })`. This is a real, proven, already-tested code path;
duplicating its logic would be exactly the kind of reinvention rule 3 exists to prevent.

**Resolved sequence for the cash-confirm route:**
1. Call `POST /bookings/negotiated` internally (same call `payment-links/negotiated` already
   makes) → `HELD` booking.
2. Create the `PaymentIntent` row per §2.2, `status: 'captured'` from the start.
3. Call `POST /bookings/:id/confirm` internally (same call the webhook makes) → `CONFIRMED`.

Three real, already-tested primitives, composed — no new booking-state logic anywhere. **This same
three-step sequence also serves the UPI-QR path added in §2.7** — identical except for the
`gatewayRef` prefix (§2.2) and the request body's admin-entered UPI transaction ID; there is no
fourth path, cash and UPI-QR are the same mechanism with a different reference source.

### 2.4 `GET /bookings/admin` cannot serve the Ledger's Guest tab as-is — a new route is genuinely needed

Read the real route (`services/slot-engine/src/index.ts:4157`): it requires a `userId` query param
and returns one user's bookings. There is no existing route that lists a branch's bookings across
users with payment status joined. Confirms the handover's flagged uncertainty — **a new listing
route is required**, not a rename or a filter added to an existing one. Resolved shape: new
`GET /resource-pools/:id/guest-ledger` (or branch-scoped equivalent — TL's call at implementation
time) in slot-engine, filtered `isMemberBooking: false`, joined to `PaymentIntent` by
`referenceId` for amount/method/status display. Owner/branch_manager JWT-gated, same
`getInternalOrAdminAuth`-style pattern already used at `/bookings/admin`.

**Method badge, resolved (folds in §2.7's UPI addition):** no new `PaymentIntent` column — derive
the Ledger's Cash/UPI/Link badge purely from the `gatewayRef` prefix already established in §2.2
(`cash_`/`upi_`/`plink_mock_`). Reuses real, already-written data rather than adding a schema
field for something the gatewayRef convention already encodes.

### 2.5 `GET /users/lookup` — confirmed real, phone-only, admin-JWT-gated

Read directly (`services/identity-auth/src/index.ts:90`): JWT-verified, tenant-matched,
owner/branch_manager-only, phone-only (no email search). Matches the discovery doc's claim
exactly. Confirms F-228's dependency framing is accurate — email-based search-or-create is
genuinely F-228 scope, not something F-229 can shortcut around. F-229's walk-in flow needs only
the phone path, which is real today.

### 2.6 New finding, not in either source document — the F-225 guest-court filter does not apply to admin-negotiated auto-assignment, by explicit existing design

Read `POST /bookings/negotiated`'s auto-court-assignment block directly
(`services/slot-engine/src/index.ts:3277`) and found a real, already-written code comment:

> `// F-225: NO { guestOnly } here — this is the admin/negotiated path. A court reserved from
> walk-in guests must still be assignable by an admin acting for a member.`

This is a deliberate, pre-existing design choice (not a bug) — `assignPooledCourt` is called
*without* the `guestOnly` flag on this path, so if F-229's Reservations UI lets auto-assignment
pick a court (no explicit `resourceId`), it can land on a court F-225 explicitly marked *not*
guest-bookable. The discovery doc's §8.4 claim — "reuse the real availability grid (respects
F-225's authorized-guest-court filter)" — is not accurate for that case; the filter only ever
applies on the self-service guest path.

**Resolved with Bala, 10 Sep 2026 — Option B.** The Reservations tab's court picker defaults to
`guestBookable: true` courts only, with an explicit "show all courts" toggle for the rare case an
admin genuinely needs to override (e.g. a member's court is free right now and the guest is
standing there). This closes the real gap for this specific walk-in flow rather than carrying it
forward into new code — cheap to build, since the pool's own `resources[].guestBookable` field is
already fetched wherever `useAvailability`/`usePools` reads pool data. **The backend's own
auto-assignment behavior (§2.6's quoted comment) is untouched** — this is a frontend-only
guardrail on top of it, not a change to `POST /bookings/negotiated`'s existing, intentional
`{ guestOnly }`-less behavior, which other callers (e.g. a real admin-for-member booking) still
rely on.

### 2.7 Mockup review — one real new capability neither source document scoped: UPI-QR immediate-confirm

Read both artboards in full (`Main.dc.html` — "Reservations — Walk-in Booking", `Ledger.dc.html` —
"Ledger"). The Reservations flow matches this plan closely and needed no changes: the three-state
guest lookup (not-searched → found existing user, or not-found → inline name entry, matching
`GET /users/lookup` + `POST /users/walk-in` from §3 exactly), the court picker's default-to-
guest-bookable-with-a-"show all courts"-toggle (matches §2.6's Option B exactly, including
labelling a non-guest-bookable court "Reserved"), and the price field pre-filled-but-editable
(matches §2's `resolveGuestBlanketRate` pre-fill).

**One real addition, not in Chief's handover or the discovery doc:** under the "Payment link"
choice, the mockup has a second sub-mode alongside "Send Razorpay link" — **"Already paid via
your QR"**, where the admin enters a UPI transaction ID and confirms the booking immediately,
for the case where Razorpay is down or the guest scans the branch's own static UPI QR directly
instead of a per-booking Razorpay link. Mechanically this is **not** the link path — it never
creates a Razorpay Payment Link or waits on a webhook. It's the exact same immediate-capture
mechanism as cash (§2.3's three-step sequence), just with a real, admin-entered, guest-provided
reference instead of no reference at all.

**Resolved with Bala, 10 Sep 2026 — distinct UPI badge, not lumped into Cash.** The Ledger shows
three method badges (Cash / UPI / Link), not two. Rationale: the UPI transaction ID is a real
reference the admin can reconcile against the branch's own bank/UPI statement later — collapsing
it into "Cash" would silently discard that traceability, and it costs nothing extra to keep
distinct (§2.2/§2.4's gatewayRef-prefix convention already carries it for free).

**Consequence for §3's route shape, folded in below:** `POST /bookings/manual`'s `paymentMethod`
is three-valued (`cash | razorpay_link | upi_qr`), not two — `razorpay_link` is the only one that
still branches to the existing, unchanged `payment-links/negotiated` logic; `cash` and `upi_qr`
both run §2.3's three-step sequence, differing only in the `gatewayRef` prefix and a required
`upiTransactionId` string on the `upi_qr` request body.

## 3. Resolved technical shape

**New schema:** `User.name String?` (nullable, no migration risk — every existing row gets `null`).

**New routes:**
- `POST /users/walk-in` (identity-auth) — owner/scoped-branch_manager JWT-gated (reuse
  `requirePaymentLinkAdmin`'s exact auth shape). Body `{ phone, name, tenantId }`. Find-or-create
  via `phone_tenantId` (§1). Creates `userType: GUEST`, `isPhoneVerified: false`.
- `POST /bookings/manual` (payment) — same auth. Body carries everything `payment-links/negotiated`
  takes, plus `paymentMethod: 'cash' | 'razorpay_link' | 'upi_qr'` (§2.7) and, for `upi_qr` only, a
  required `upiTransactionId` string. `razorpay_link` branches to the exact existing
  `payment-links/negotiated` logic (§1, unchanged). `cash` and `upi_qr` both run the 3-step
  sequence in §2.3, differing only in the `gatewayRef` prefix built in §2.2.
- `GET /resource-pools/:id/guest-ledger` (slot-engine) — owner/branch_manager JWT-gated, per §2.4.

**Frontend (admin-v2):**
- `GuestManagementScreen.tsx`'s Reservations tab: replace the `EmptyState` with branch/pool/date/
  window picker (reuse `useAvailability(poolId, date)` — already real, already in
  `guestManagement/queries.ts`, no new hook needed), a phone-based search-or-create (new UI,
  `GET /users/lookup` + `POST /users/walk-in`, both real/new per above), a court picker defaulting
  to `guestBookable: true` courts with a "show all courts" override toggle (§2.6, Option B),
  price field pre-filled from `resolveGuestBlanketRate`'s real inputs (editable), and a Cash/
  Payment-link choice — the latter revealing a "Send Razorpay link" vs. "Already paid via your
  QR" sub-choice per §2.7 — calling `POST /bookings/manual`. **Build this to the approved mockup**
  (`Main.dc.html`, artifact above): the three-state guest-lookup pattern, "Reserved" court
  labelling, and the dynamic submit-button copy ("Confirm & mark paid" / "Create booking & send
  link" / "Confirm — paid via QR") are all real, considered UI decisions worth matching exactly,
  not just a loose visual reference.
- `/ledger`: `Tabs`-based rebuild (reuse the exact `Tabs` component `GuestManagementScreen.tsx`
  already uses) — real **Guest** tab backed by §2.4's new route, rendered with the existing
  `Table` component (already in `apps/admin-v2/src/components/`, no new table primitive needed),
  showing distinct Cash/UPI/Link method badges per §2.4/§2.7; greyed, clickable **Members**/
  **Students** placeholder tabs per Chief's handover §3d and the approved mockup (`Ledger.dc.html`),
  unchanged.

## 4. Explicitly out of scope (unchanged from Chief's handover)

Real Google/Gmail login work (F-228). Member dues/subscription billing (F-207/F-209). The
"Students module." Automatic membership expiry, "change my mobile number." None of these are
touched by this plan.

## 5. Delivery sequencing

Given this touches three services plus two frontend surfaces, following this project's own
established pattern (F-220 v2's section-by-section delivery) rather than one large diff:

1. **Schema** — `User.name` migration, alone, smallest possible first step.
2. **`POST /users/walk-in`** (identity-auth) — independently testable via direct API call before
   any UI exists.
3. **`POST /bookings/manual`** (payment), cash path first, link path second (link path is mostly
   already-proven code, lower risk) — independently testable the same way.
4. **`GET /resource-pools/:id/guest-ledger`** (slot-engine) — independent of the above three,
   can build in parallel.
5. **Reservations tab UI** — once 2 and 3 are real and verified.
6. **`/ledger` rebuild** — once 4 is real and verified.

Each step: implement → rebuild → real live-fire pass against real JBC data (or a safe UAT
equivalent for the cash-payment path specifically, given rule 2) → report back for this thread's
independent re-verification → next step, same discipline as every other finding this session.

## 6. Verification bar

`POST /users/walk-in` correctly finds an existing user by phone rather than duplicating (real DB
check, not just a 200); a fresh cash booking goes `HELD → CONFIRMED` for real, a `PaymentIntent`
row exists with `status: captured`, correct paise amount, `gatewayRef` prefixed `cash_`, DB
read-back; a UPI-QR booking does the same with `gatewayRef` = `upi_<the real entered transaction
ID>`, and resubmitting the same transaction ID is handled by the P2002 reuse path (§2.2), not a
duplicate row or a 500; a `razorpay_link` booking still produces a real, working Razorpay Payment
Link (regression check — nothing about the existing `payment-links/negotiated` behavior changes);
the Ledger's Guest tab shows real bookings with three visually distinct Cash/UPI/Link badges,
correct amount/status, `isMemberBooking: true` bookings correctly excluded; Members/Students tabs
render as honest, clickable, greyed placeholders, never fake data; whole-repo typecheck/build/lint
clean; 5-service regression green at each step per rule 7 (rebuild before testing).

## 7. Sign-off

§2.6 resolved (Option B). §2.7's mockup review resolved (distinct UPI badge). Plan complete,
ready to hand to Claude Code.
