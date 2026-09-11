# Handover to Claude Code — F-229, Admin-Assisted Manual Booking (Cash / UPI-QR / Payment Link)

**Status:** Plan-mode complete, signed off by Bala 10 Sep 2026. Full grounding, every real-code
citation, and the resolved design decisions are in the attached
`technical-lead-plan-f229-manual-booking.md` — read that in full before starting; this is the
condensed, actionable version. The attached `claude-code-handover-f229-manual-booking.md` (Chief's
original handover) and `discovery-unified-login-manual-booking.md` (Chief's Business Discovery
Checklist, including the real 10 Sep 2026 finding-ID assignment — see Step 0) are background —
where anything here differs from those two, this document and the plan doc are the current,
corrected version.

**Correction, 10 Sep 2026 — real process gap found and fixed before this hand-off proceeds.**
Your prior report was right to stop: F-229 (and F-228) exist only inside these attached documents
— none of it was ever relayed into `docs/plans/pending-findings.md`/`docs/findings_register.md`,
so from the real git checkout it correctly looked unlogged. That's a real gap in how this got to
you (the relay step the discovery doc itself calls for in its own §10 never happened), not
something to build around. **One correction to your report, independently re-verified against a
fresh clone of `main` @ `0fb9337` just now:** F-227 is real and already in the register (line 150)
— it's F-226/F-228/F-229 that are genuinely absent, not "everything above F-225." Doesn't change
your conclusion, just the exact shape of the gap. **Step 0 below is the fix — apply it first.**

**Supersedes F-204** (`Walk-in booking + manual payment recording`, Open, never implemented) —
mark F-204's register entry superseded by F-229 as part of Step 0, pointing to
`discovery-unified-login-manual-booking.md`.

---

## Step 0 — Relay Chief's real F-229 assignment into git (prerequisite, not part of the 6-step build)

This is a mechanical transcription of a decision Chief already made and dated, not a new decision
and not self-assignment — same posture as the F-224/F-227 register-row hand-offs earlier this
session ("no plan-mode round needed — closing an already-decided gap"). The source is
`discovery-unified-login-manual-booking.md` §10, written by the Chief Architect thread, 10 Sep
2026: *"F-229 assigned — `admin-assisted-manual-booking-cash-payment`... Supersedes F-204... Relay
instruction, same mechanism as F-221–F-227: whoever has repo write access — write new entries into
`docs/plans/pending-findings.md` with `Confirmed-ID: F-229` and `Confirmed: 10 Sep 2026` already
applied... Mark F-204's own entry as superseded by F-229."* That relay never happened until now.

**0. Commit the four attached docs into `claude/` in this repo, unchanged, same filenames** —
`technical-lead-plan-f229-manual-booking.md`, `claude-code-handover-f229-manual-booking.md`,
`discovery-unified-login-manual-booking.md`, `claude-code-handover-f229-implementation.md` (this
file). This is the other half of the same gap your report caught: `claude/` already holds real,
committed docs through F-220/F-207.1/F-205/F-189 — every prior finding's register/pending-findings
rows cite a real file at that path. F-229's rows below do the same; committing these four now is
what makes those citations resolve to something real instead of a second version of the same gap.

**1. Add to `docs/plans/pending-findings.md`, under "Promoted (audit trail)"** (same section/shape
as the existing F-206 entry):

```
### admin-assisted-manual-booking-cash-payment
Surfaced: 10 Sep 2026, Business Discovery Checklist
(`claude/discovery-unified-login-manual-booking.md`, §9–§10) — Chief Architect thread.
Supersedes [[F-204]] (`Walk-in booking + manual payment recording`, Open, never implemented) —
same real gap F-204 always named, now fully scoped: an admin can book a court for a guest who's
physically present or on the phone, with real cash and UPI-QR capture (immediate confirm, no
webhook) plus a Razorpay-payment-link fallback, replacing F-204's narrower two-field/no-QR/
standard-price-only scope. Depends softly on F-228 (`unified-gmail-login-guest-member-identity`,
also Chief-assigned 10 Sep 2026, not yet relayed into git — separate finding, not part of this
hand-off) for its shared search-or-create identity component; the capture route itself has no
hard dependency and sequences first here.
Confirmed-ID: F-229
Confirmed: 10 Sep 2026
```

**2. Add F-229's Open row to `docs/findings_register.md`**, 5-column Open shape (verify every
technical claim against real code before using verbatim, same discipline as every other row):

```
| F-229 | 10 Sep 2026 | Business Discovery Checklist (`claude/discovery-unified-login-manual-booking.md`), Chief-assigned | Admin-assisted manual/walk-in booking — an admin can book a court for a guest who's physically present or on the phone, with real cash and UPI-QR capture (immediate confirm, no webhook) plus a Razorpay-payment-link fallback. Real JBC need: guests routinely show up in person or call ahead with no way to record the booking today. Supersedes [[F-204]] (Open, never implemented — that entry's narrower "no QR, standard price only, two fields" scope is superseded by this finding's fuller, closed-form design; see [[F-204]]'s own row). Depends softly on F-228 (unified Gmail-first login, also Chief-assigned, not yet relayed) for its shared search-or-create identity component — no hard dependency on it. | In progress — plan-mode complete, signed off by Bala 10 Sep 2026. New `User.name` column; new `POST /users/walk-in` (identity-auth); new `POST /bookings/manual` (payment — cash/UPI-QR/Razorpay-link); new `GET /resource-pools/:id/guest-ledger` (slot-engine); Reservations tab + `/ledger` rebuild (admin-v2). |
```

**3. Mark F-204's existing row superseded** — append a clause to its Impact/Action field (its own
row, line ~146, don't otherwise touch its text): `**Superseded by [[F-229]]** — this entry's
narrower scope (no QR, standard price only) has been absorbed into F-229's fuller, closed-form
design; see that finding for the current plan.` Keep F-204's row in place as a historical marker
rather than deleting it — same "corrections get recorded, never silently applied" convention this
project uses everywhere else.

**4. Batch-log entry** — a short docs-only entry noting Step 0 relays a real, already-dated Chief
decision into git; no code changes in this step.

**5. Run `pnpm register:check` / `pnpm diagram:verify`, report the real resulting counts** (don't
state them from memory), same as every prior register-touching hand-off. Report back before
starting Step 1 — this is a genuine checkpoint, not a formality, since Step 1 depends on F-229
actually being a real, git-visible ID.

---

**Mockup (approved by Bala):**
`https://claude.ai/code/artifact/48b82ce8-aa5d-4daf-878a-bd946cedaf66` — two artboards,
"Reservations — Walk-in Booking" and "Ledger." Build the Reservations tab and `/ledger` to this
mockup's real, considered UI decisions (the three-state guest-lookup pattern, "Reserved"
court-chip labelling, the dynamic submit-button copy, the Cash/Payment-link method cards with the
link sub-choice) — not as a loose visual reference.

**This is genuinely new backend surface across three services** (identity-auth, payment,
slot-engine) plus two admin-v2 frontend surfaces (Reservations tab, `/ledger` rebuild). Per this
project's established delivery discipline (F-220 v2), build and hand off **one step at a time**,
each independently verified before the next starts — not one large diff. Order below.

---

## Step 1 — Schema: `User.name`

`packages/database/prisma/schema.prisma` — add `name String?` to `model User`. Nullable, every
existing row gets `null`, no backfill needed. Confirmed directly: `User` has no name field today
(`id, tenantId, phone, email, googleId, isPhoneVerified, isEmailVerified, userType, createdAt,
updatedAt` — that's the whole model). Migration only, nothing else in this step.

## Step 2 — `POST /users/walk-in` (identity-auth)

New route. Auth: reuse `requirePaymentLinkAdmin`'s exact dual-path shape
(`services/payment/src/index.ts:704`) — `INTERNAL_SERVICE_KEY` OR JWT with `owner`/
`branch_manager:<branchId>` role. Body: `{ phone, name, tenantId }`.

Find-or-create via the real `phone_tenantId` unique key, same pattern already used in
`/auth/otp/verify` (`services/identity-auth/src/index.ts`, `where: { phone_tenantId: { phone,
tenantId } }`) — if found, return the existing user (do not overwrite `name` on an existing
record without being asked to; that's not this route's job). If not found, create with
`userType: GUEST`, `isPhoneVerified: false` (this account never proves phone ownership itself —
the admin is the trust boundary, not an OTP exchange), the given `name`.

Independently testable via a direct API call before any UI exists — verify both branches (existing
phone found vs. genuinely new) with real DB read-back before moving on.

## Step 3 — `POST /bookings/manual` (payment)

New route, same auth as Step 2. Body carries everything `POST /payment-links/negotiated`
(`services/payment/src/index.ts:957`) already takes (`tenantId, branchId, resourcePoolId,
resourceId, windowId, userId, negotiatedPrice, coPlayers`), plus:

```
paymentMethod: 'cash' | 'razorpay_link' | 'upi_qr'
upiTransactionId?: string   // required when paymentMethod === 'upi_qr'
```

**`razorpay_link`**: branch to the exact existing `payment-links/negotiated` logic, unchanged —
this route's `razorpay_link` case is a thin pass-through, not a reimplementation.

**`cash` and `upi_qr`** both run this real, already-proven three-step sequence — do not write a
new `booking.update({ status: CONFIRMED })` anywhere, reuse what exists:

1. Call slot-engine's `POST /bookings/negotiated` internally (same internal call
   `payment-links/negotiated` already makes) → creates a `HELD` booking.
2. Create a `PaymentIntent` row directly — same shape `createPaymentLinkForHeldBooking`
   (`services/payment/src/index.ts:769`) already builds, with these fields:
   - `amount`: `Math.round(Number(negotiatedPrice) * 100)` — copy this conversion verbatim, don't
     re-derive it. `negotiatedPrice`/`Booking.price` are `Decimal` rupees; `PaymentIntent.amount`
     is `Int` paise — getting this wrong is a real, easy-to-hit bug class this project has hit
     before.
   - `gatewayRef`: `cash_<uuid or hash>` for `cash`; `upi_<the admin-entered upiTransactionId>`
     for `upi_qr`. Must be unique (real schema constraint) — for `upi_qr` specifically, wrap the
     create in the same P2002-catch-and-return-existing pattern
     `createPaymentLinkForHeldBooking` already has, since a real UPI transaction ID is
     admin-typed and could plausibly be resubmitted.
   - `status: 'captured'` set directly at creation — no `'pending'` stage, since no webhook will
     ever fire for either of these two methods.
   - `purpose: 'guest_booking'` — same as every other path, purpose doesn't vary by method.
3. Call slot-engine's `POST /bookings/:id/confirm` internally
   (`services/slot-engine/src/index.ts:3344`) — the exact same internal call the real Razorpay
   webhook handler (`services/payment/src/index.ts:405`) makes on `payment.captured`. This route
   is already idempotent, already rejects a non-`HELD` booking correctly, and already cascades to
   F-183 child bookings atomically — do not duplicate any of that logic here.

Independently testable via direct API calls for all three `paymentMethod` values before any UI
exists. Verify: `cash` and `upi_qr` both reach `CONFIRMED` with a `captured` `PaymentIntent`,
correct paise amount, correct `gatewayRef` prefix; `razorpay_link` still produces a real working
Payment Link (regression check — this path must be byte-for-byte unchanged behavior).

## Step 4 — `GET /resource-pools/:id/guest-ledger` (slot-engine)

New route (or branch-scoped equivalent — your call on the exact path/scoping unit at
implementation time, as long as it serves "every guest booking for this branch/pool with its
payment status"). Owner/branch_manager JWT-gated, same `getInternalOrAdminAuth`-style pattern
already used at `GET /bookings/admin` (`services/slot-engine/src/index.ts:4157` — note that route
itself cannot be reused as-is, it's scoped to one `userId`, not a branch). Filter
`isMemberBooking: false`, join to `PaymentIntent` by `referenceId` for amount/status/gatewayRef.

**Do not add a `method` column anywhere.** Derive the Cash/UPI/Link label purely from the
`PaymentIntent.gatewayRef` prefix set in Step 3 (`cash_` / `upi_` / `plink_mock_`) — either in this
route's response shaping or in the frontend, your call, but the schema stays untouched.

Independently testable via direct API call, can build in parallel with Steps 2–3 since it has no
dependency on them beyond reading data Step 3 will start producing.

## Step 5 — Reservations tab UI (admin-v2)

Once Steps 2 and 3 are real and independently verified. Replace `GuestManagementScreen.tsx`'s
Reservations `EmptyState` (the one naming F-204) with the form from the approved mockup
(`Main.dc.html`):

- Branch/pool/date/window picker — reuse `useAvailability(poolId, date)`, already real, already in
  `apps/admin-v2/src/screens/guestManagement/queries.ts`. No new hook needed for this part.
- Guest lookup, phone-based, three real states matching the mockup exactly: not-searched (phone
  input + Search button) → `GET /users/lookup`; found → show the resolved name/phone with a "try
  another" reset; not found → inline name field, "Creates a guest account... no OTP needed"
  copy, calls `POST /users/walk-in` (Step 2) on submit.
- Court picker: default to `guestBookable: true` courts only (the pool's own
  `resources[].guestBookable`, already fetched wherever `useAvailability`/`usePools` reads pool
  data), with a "Show all courts" toggle that reveals every court, labelling non-guest-bookable
  ones "Reserved" — matches the mockup exactly. **This is a frontend-only filter** — it does not
  change slot-engine's `POST /bookings/negotiated`, which deliberately has no `{ guestOnly }` on
  this path (real, existing comment at `services/slot-engine/src/index.ts:3277` — leave that
  code untouched, other real callers rely on it).
- Price field, pre-filled from the pool's real `resolveGuestBlanketRate` inputs
  (`guestStandardRate`/`guestPeakRate`/`guestPeakWindows` on `Branch`), editable.
- Payment method: Cash / Payment-link cards, matching the mockup. Selecting Payment-link reveals
  the "Send Razorpay link" vs. "Already paid via your QR" sub-choice; the QR sub-choice shows the
  UPI-transaction-ID input. Submit button label changes dynamically per the mockup: "Confirm &
  mark paid" (cash) / "Create booking & send link" (link, send mode) / "Confirm — paid via QR"
  (link, QR mode). All three call `POST /bookings/manual` (Step 3) with the matching
  `paymentMethod`.

## Step 6 — `/ledger` rebuild (admin-v2)

Once Step 4 is real and independently verified. Replace the current `StubScreen` ("Subscription
Ledger" — genuinely mis-scoped copy) with a `Tabs`-based screen, reusing the exact `Tabs`
component `GuestManagementScreen.tsx` already uses:

- **Guest** tab: real, backed by Step 4's route, rendered with the existing `Table` component
  (`apps/admin-v2/src/components/Table.tsx` — no new table primitive needed). Columns per the
  mockup: Date, Guest, Court, Amount, Method (Cash/UPI/Link badge, derived per Step 4), Status.
- **Members** / **Students** tabs: greyed but clickable, each an honest one-line teaser matching
  the mockup's copy exactly — "Member Ledger — launching with the Membership module" /
  "Student Ledger — coming with the Students module." Never fake data, never a disabled-looking
  tab (Bala's explicit demo-value call, 10 Sep 2026 — this is deliberate, not a placeholder to
  "finish later").

## Explicitly out of scope — don't build these, don't ask about them mid-implementation

Real Google/Gmail login work (F-228, separate finding). Member dues/subscription billing
(F-207/F-209). The "Students module" itself. Automatic membership expiry, "change my mobile
number." Editing the mockup's Members/Students styling beyond matching its two-badge-plus-UPI
pattern to a third — a reasonable third color/style is your call, not a blocker.

## Verification bar (report back after every step, not just at the end)

Step 2: existing-phone-found and genuinely-new-phone branches both verified with real DB
read-back, not just a 200. Step 3: `cash` and `upi_qr` both reach `CONFIRMED`, `PaymentIntent`
`status: captured`, correct paise amount, correct `gatewayRef` prefix, DB read-back; resubmitting
the same UPI transaction ID is handled by the reuse path, not a duplicate row or a 500;
`razorpay_link` still produces a real, working Payment Link — explicit regression check. Step 4:
real branch bookings returned with correct payment join, `isMemberBooking: true` rows excluded.
Step 5: a real walk-in booking end-to-end for all three payment methods against real (or safe
UAT-equivalent) JBC data, court picker correctly defaults to guest-bookable and correctly reveals
reserved courts on toggle. Step 6: Ledger Guest tab shows real data with three distinct method
badges; Members/Students render as honest greyed placeholders. Whole-repo typecheck/build/lint
clean and 5-service regression green at **every** step, not just the last one (rule 7 — rebuild
before testing). Report back after each step for this thread's independent re-verification before
the next one starts, same cadence as every other finding this session.
