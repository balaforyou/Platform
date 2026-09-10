# F-229 Step 3 — `POST /bookings/manual` (payment) — implementation plan

**Status:** plan-mode, awaiting sign-off. Steps 0–2 signed off; branch `f229-manual-booking` at `478b5f8`.
**Scope:** the manual-booking route in the payment service — `cash`, `upi_qr`, `razorpay_link`. No UI (Step 5), no ledger route (Step 4). This is new money-handling code — the plan below is deliberately explicit about the three-way branch, the `PaymentIntent` shape, and every internal call.

---

## 1. Real code checked (rule 8 — every citation re-verified against the branch)

| Thing | Location (verified) | Notes |
|---|---|---|
| `requirePaymentLinkAdmin` | `services/payment/src/index.ts:704` | internal key → `null`; else JWT, `roles.some(r => r==='owner' \|\| r.startsWith('branch_manager:'))`, 403 else. Same file — reuse directly. |
| `/payment-links/negotiated` | `services/payment/src/index.ts:957` (hand-off said `:957` — correct) | `requirePaymentLinkAdmin` → require `Idempotency-Key` header → validate body → **per-branch** role check (`isOwner \|\| branch_manager:${branchId}`) at `:989` → `fetch ${slotEngine}/bookings/negotiated` (`:1007`) → `createPaymentLinkForHeldBooking` (`:1041`) → `reply.status(reused ? 200 : 201)`, returns `{ booking, paymentLink, description }`. |
| `createPaymentLinkForHeldBooking` | `services/payment/src/index.ts:769` | checks `paymentIntent.findFirst({ where: { referenceId: bookingId } })` first — `captured` → **400 `PAYMENT_ALREADY_CAPTURED`**, else returns existing link (`reused:true`). Fresh: `amountPaise = Math.round(Number(amount) * 100)` (`:818`), `plink_mock_<sha256(idempotencyKey).slice(0,16)>` deterministic id (`:813`), `paymentIntent.create({ tenantId, userId, amount: amountPaise, purpose: 'guest_booking', referenceId: bookingId, status: 'pending', gatewayRef: paymentLinkId })` (`:821`), P2002 catch → re-read by `gatewayRef`, return existing (`:835`). |
| slot-engine `POST /bookings/negotiated` | `services/slot-engine/src/index.ts:3140` (Chief doc said `:3140` — correct; the F-225 comment is at `:3281`) | `requireInternalKey`, requires `Idempotency-Key`, idempotent on `booking.idempotencyKey` (returns existing, 200), creates a **`HELD`** booking, `isMemberBooking: false` hardcoded (`:3313`), `price: new Prisma.Decimal(negotiatedPrice)`, POOLED auto-assigns a court via `assignPooledCourt` **without `{ guestOnly }`** (`:3281` comment — deliberate, untouched by this step), `reply.status(201)`. P2002 on idempotencyKey → returns existing 200. |
| slot-engine `POST /bookings/:id/confirm` | `services/slot-engine/src/index.ts:3344` (hand-off said `:3344` — correct) | `requireInternalKey`; returns booking unchanged if already `CONFIRMED` (**idempotent**); **400** if not `HELD`; **400 `CHILD_BOOKING_NOT_MUTABLE`** on a child id; `$transaction`: `booking.update` → `updateMany({ where: { parentBookingId: id } })` — **F-183 child cascade, atomic**. |
| Razorpay webhook `payment.captured` | `services/payment/src/index.ts:405` (hand-off said `:405` — correct) | on capture: `paymentIntent.update({ status: 'captured' })` then `fetch ${slotEngine}/bookings/${intent.referenceId}/confirm` with `Bearer ${internalKey}`, body `{}`. **This is the exact call `cash`/`upi_qr` will make.** |
| directly-`captured` PaymentIntent precedent | `services/payment/src/index.ts:543` (autopay `subscription.charged`) | `paymentIntent.create({ ..., status: 'captured', gatewayRef: 'mock-razorpay-autopay-<eventId>' })` — creating an intent already-captured (no `pending` stage) is an existing, shipped pattern. |
| `PaymentIntent` model | `packages/database/prisma/schema.prisma:525` | `{ id, tenantId, userId, amount Int /* paise */, purpose String, referenceId String, status String, gatewayRef String @unique, refunds, createdAt, updatedAt }` — **no `branchId`, no `method` column.** `gatewayRef @unique` is the dedupe key. |
| `/payment-links/negotiated` consumers | `apps/admin-web/src/main.tsx:1768`, `services/payment/src/regression/negotiated-link.regression.ts:56` | both must keep working byte-for-byte after the §3 refactor. |

## 2. What gets built

### 2a. Refactor — extract `createHeldNegotiatedBooking` (behaviour-preserving)

The inline `fetch ${slotEngine}/bookings/negotiated` block in `/payment-links/negotiated` (`:1005–1039`) becomes a named helper:

```
async function createHeldNegotiatedBooking(
  { tenantId, branchId, resourcePoolId, resourceId, windowId, userId, negotiatedPrice, coPlayers },
  idempotencyKey: string,
  reply: any,
): Promise<any>   // the HELD booking row
```

Body moved **verbatim** — same headers, same error mapping (`reply.status(bookingRes.status)`, `NEGOTIATED_BOOKING_FAILED`, `'Slot Engine communication failure'`). `/payment-links/negotiated`'s handler then reads `const booking = await createHeldNegotiatedBooking(body, idempotencyKey, reply)`. **Zero behaviour change** — `negotiated-link.regression.ts` is the guard, plus a live-fire regression check (§5).

### 2b. New route `POST /bookings/manual` (payment), placed right after `/payment-links/negotiated`

**Auth:** `requirePaymentLinkAdmin(request, reply)` — same as the sibling route. Then the **same per-branch role check** `/payment-links/negotiated` does (`:989–1000`): when `decoded` present, require `roles.includes('owner') || roles.includes('branch_manager:'+branchId)` else 403.

**Headers:** require `Idempotency-Key` (the internal `/bookings/negotiated` call needs it; also the dedupe anchor for the intent).

**Body:** everything `/payment-links/negotiated` takes —
`tenantId, branchId, resourcePoolId, resourceId?, windowId, userId, negotiatedPrice, coPlayers?` — **plus:**
```
paymentMethod: 'cash' | 'razorpay_link' | 'upi_qr'
upiTransactionId?: string     // required & non-empty iff paymentMethod === 'upi_qr'
```
Validate: same required-field check as `:981`; `paymentMethod` in the enum → else 400 `BAD_REQUEST`; `upi_qr` without a non-empty `upiTransactionId` → 400 `UPI_TRANSACTION_ID_REQUIRED`.

**Branch 1 — `razorpay_link` (thin pass-through, no new logic):**
```
const booking = await createHeldNegotiatedBooking(body, idempotencyKey, reply);
const paymentLink = await createPaymentLinkForHeldBooking({
  bookingId: booking.id, tenantId: booking.tenantId ?? tenantId,
  userId: booking.userId ?? userId, amount: Number(negotiatedPrice),
  idempotencyKey, reply,
});
reply.status(paymentLink.reused ? 200 : 201);
return { booking, paymentLink, paymentMethod: 'razorpay_link' };
```
Identical to `/payment-links/negotiated`'s own body — same helper calls, same status logic.

**Branch 2 — `cash` and `upi_qr` (the immediate-capture sequence):**
```
1. const booking = await createHeldNegotiatedBooking(body, idempotencyKey, reply);   // HELD

2. // guard: an intent may already exist for this booking id
   const existing = await prisma.paymentIntent.findFirst({ where: { referenceId: booking.id } });
   if (existing?.status === 'captured') -> 400 PAYMENT_ALREADY_CAPTURED   (same as the link path)
   if (existing) -> 400 BOOKING_HAS_PENDING_INTENT
        // a dangling razorpay_link intent for this booking — admin must resolve that first.
        // Cannot happen from Step 5's UI (fresh booking per submit); only via a method switch
        // on an Idempotency-Key retry. Flagged as a decision in §4.

3. const amount = Math.round(Number(negotiatedPrice) * 100);   // verbatim from :818
   const gatewayRef =
     paymentMethod === 'cash'
       ? `cash_${sha256(idempotencyKey).slice(0,16)}`     // deterministic — retry-safe
       : `upi_${upiTransactionId.trim()}`;                 // admin-entered, must be unique

4. try {
     intent = await prisma.paymentIntent.create({ data: {
       tenantId: booking.tenantId ?? tenantId,
       userId:   booking.userId ?? userId,
       amount,
       purpose: 'guest_booking',
       referenceId: booking.id,
       status: 'captured',          // directly — no webhook will ever fire (precedent :543)
       gatewayRef,
     }});
   } catch P2002 {
     // same-key retry (cash) or resubmitted UPI txn id — return the row that won
     intent = await prisma.paymentIntent.findUnique({ where: { gatewayRef } });
     if (!intent) throw;
   }

5. // HELD -> CONFIRMED via the EXACT call the webhook makes
   const confirmRes = await fetch(`${slotEngine}/bookings/${booking.id}/confirm`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
     body: JSON.stringify({}),
   });
   if (!confirmRes.ok) -> 502, log the body   (same failure handling as the webhook, :477)
   const confirmed = (await confirmRes.json()).data ?? ...;

6. return { booking: confirmed, payment: {
     intentId: intent.id, status: intent.status, amount: intent.amount,
     gatewayRef: intent.gatewayRef, method: paymentMethod,
   }};
   reply.status(201);
```

**No new `booking.update({ status: CONFIRMED })` anywhere** — step 5 is the same internal call the real webhook uses; F-183 child cascade + non-HELD rejection + idempotency all belong to that route, not this one.

**Method is never persisted as a column** — the Cash/UPI/Link distinction lives entirely in the `gatewayRef` prefix (`cash_` / `upi_` / `plink_mock_`), which Step 4's ledger derives from. Schema untouched.

## 3. Blast radius

| Touched | Consumers | Effect |
|---|---|---|
| **new** `POST /bookings/manual` | none yet (Step 5 UI is first) | additive |
| **new** `createHeldNegotiatedBooking` helper | `/payment-links/negotiated` (refactored to call it) + `/bookings/manual` | behaviour-preserving extraction |
| `/payment-links/negotiated` handler | `apps/admin-web/src/main.tsx:1768`, `negotiated-link.regression.ts:56` | **must stay byte-for-byte** — verified by that regression suite + a live-fire re-run (§5). The only existing code path this step modifies. |
| slot-engine `/bookings/negotiated`, `/bookings/:id/confirm` | many | **not touched** — called as-is over the internal key |
| `PaymentIntent` schema | — | **not touched** |
| payment regression `run.ts` | +1 section import | additive |

## 4. Decisions for the reviewer

1. **`cash`/`upi_qr` when a `pending` intent already exists for the booking (§2b step 2).** Proposed: **400 `BOOKING_HAS_PENDING_INTENT`** — cannot arise from Step 5's UI (each submit is a fresh booking via a fresh Idempotency-Key), only from a deliberate method-switch on a key retry. Alternative: silently supersede the pending link intent (update it in place to `captured` + new `gatewayRef`). Recommend the 400 — a switched-method retry is a real ambiguity an admin should see, not something to paper over silently, and it keeps this route from having to reason about Razorpay link cancellation.
2. **`confirm` failure after the `captured` intent already exists (§2b step 5).** If `/bookings/:id/confirm` returns non-OK *after* we've written a `captured` `PaymentIntent`, the booking is HELD-but-paid — same window the real webhook has (`:477` throws too, leaving the intent captured). Proposed: return 502 with the intent id in the body and log loudly; the booking's 5-minute `heldUntil` means it either gets manually re-confirmed or expires and the intent is then a real refund case. This matches existing webhook behaviour rather than inventing compensation logic. Flagging, not proposing to solve it here.
3. **Response status for `cash`/`upi_qr`:** `201` (a booking + an intent were created). `razorpay_link` keeps `/payment-links/negotiated`'s `200|201` (reused vs new).

## 5. Verification (live-fire, before reporting back — extra rigor per the reviewer)

Direct API calls against the dev stack (payment :3004, slot-engine :3001) with a **real `badminton_db` JBC pool + a fresh availability window**, internal-key path:

- **`cash`:** POST → capture the response; then read the booking from slot-engine **before is impossible (already confirmed)** so instead: log the intermediate — a variant call that stops after `createHeldNegotiatedBooking` to show `status: HELD`, then the full call to show `status: CONFIRMED` + `PaymentIntent { status: 'captured', amount == round(price*100), gatewayRef ^= 'cash_' }`, all via DB read-back. **Explicitly report the before (HELD) / after (CONFIRMED) booking state around the `/bookings/:id/confirm` call**, per the reviewer's request.
- **`upi_qr`:** same, `gatewayRef == 'upi_<the exact txn id sent>'`; then **re-POST with the same `upiTransactionId`** → no duplicate row, no 500, returns the same intent (P2002 path).
- **`upi_qr` without `upiTransactionId`** → 400 `UPI_TRANSACTION_ID_REQUIRED`.
- **multi-window (F-183) booking via `cash`** if a co-booking pool allows it → confirm cascade reaches the child booking (`parentBookingId` rows also `CONFIRMED`). If JBC pools can't express multi-window negotiated here, note it and cover in regression instead.
- **`razorpay_link`:** produces a real working `plink_mock_...` + `rzp.io/l/mock-...`, `PaymentIntent status: 'pending'`, `gatewayRef ^= 'plink_mock_'` — **explicit regression check that this is unchanged from `/payment-links/negotiated`.**
- **`/payment-links/negotiated` itself** re-run post-refactor → identical behaviour (idempotency retry → same booking + intent, member JWT → 403).
- **auth:** non-admin JWT → 403; wrong-branch `branch_manager` → 403; no auth → 401.
- All test bookings/intents/users deleted from `badminton_db` afterwards, `SELECT count(*) == 0` confirmed — no demo-data pollution.

New regression suite `services/payment/src/regression/manual-booking.regression.ts` covering all three methods + the UPI-resubmit + auth, added to `run.ts`. Then `pnpm -r build` (rebuild — suites run from `dist`), whole-repo typecheck/lint, full 5-service regression against `badminton_db_test`.

## 6. Commit / push / sign-off

One commit `F-229 Step 3: POST /bookings/manual (payment)` + `docs(F-229): batch-log Batch 37`. Push to `f229-manual-booking`, report raw evidence — including the HELD→CONFIRMED before/after around every real `/bookings/:id/confirm` call — for independent re-verification **before Step 4**. No PR to `main` yet. **No commit until this plan is signed off.**
