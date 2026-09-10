# F-229 Step 3 — `POST /bookings/manual` (payment) — implementation plan

**Status:** plan-mode, rev 2 — awaiting sign-off. Steps 0–2 signed off; branch `f229-manual-booking` at `2ad29e1`.
**Rev 2 (10 Sep 2026):** §2b Branch 2 and §5 rewritten after the reviewer caught a real bug — the first-draft
existing-intent guard would reject a legitimate Idempotency-Key retry, and its P2002 catch could confirm a
booking against another booking's payment intent (a reused admin-typed `upiTransactionId` → "free court").
Fix: compute `expectedGatewayRef` before the guard, branch on identity, and verify `referenceId` in the
P2002 catch (409 `UPI_TRANSACTION_ID_ALREADY_USED`, never confirm). §4 decisions all confirmed.
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

Revised after the reviewer caught a real bug in the first draft: `createHeldNegotiatedBooking` is idempotent on `Idempotency-Key`, so a legitimate retry (network timeout after the first call succeeded) returns the *same* `booking.id` and the first call's already-`captured` intent — the first-draft guard would 400 that retry immediately and never reach the P2002 path §5 expects to exercise. Worse: on the P2002 catch, a blind `findUnique({ gatewayRef })` return could hand back an intent whose `referenceId` points at a *different* booking (a reused admin-typed `upiTransactionId`), and step 5 would then confirm *this* booking against someone else's payment proof — a real "free court" path. The fix computes `expectedGatewayRef` **before** the guard and branches on identity, and the P2002 catch verifies `referenceId` before proceeding.

```
1. const booking = await createHeldNegotiatedBooking(body, idempotencyKey, reply);   // HELD (or, on an
                                                                                     // Idempotency-Key retry,
                                                                                     // the same row — possibly
                                                                                     // already CONFIRMED)

2. const amount = Math.round(Number(negotiatedPrice) * 100);   // verbatim from :818
   const expectedGatewayRef =
     paymentMethod === 'cash'
       ? `cash_${sha256(idempotencyKey).slice(0,16)}`     // deterministic — a genuine cross-booking
                                                          // collision needs an actual key reuse
       : `upi_${upiTransactionId.trim()}`;                // admin-typed, no crypto backing

3. // an intent may already exist for this booking id
   const existing = await prisma.paymentIntent.findFirst({ where: { referenceId: booking.id } });

   if (existing && existing.gatewayRef === expectedGatewayRef && existing.status === 'captured') {
     // SAME request being retried (same key -> same booking -> same derived ref). Not an error.
     // Fall straight through to step 5's confirm (idempotent) and return this intent.
     // This also self-heals §4 decision 2's HELD-but-paid window: a retry after a mid-flight
     // 502 now recovers automatically instead of needing an admin to notice.
     intent = existing;
     // -> go to step 5
   } else if (existing && existing.status === 'captured') {
     -> 400 PAYMENT_ALREADY_CAPTURED        // gatewayRef differs — booking already paid another way
   } else if (existing) {
     -> 400 BOOKING_HAS_PENDING_INTENT      // dangling razorpay_link intent — admin resolves that first
                                            // (can't arise from Step 5's UI; only a method-switch retry)
   } else {
     // 4. no intent yet — create it, already-captured (no webhook will ever fire; precedent :543)
     try {
       intent = await prisma.paymentIntent.create({ data: {
         tenantId: booking.tenantId ?? tenantId,
         userId:   booking.userId ?? userId,
         amount,
         purpose: 'guest_booking',
         referenceId: booking.id,
         status: 'captured',
         gatewayRef: expectedGatewayRef,
       }});
     } catch P2002 {
       // gatewayRef already exists on SOME intent. Re-read it and check whose booking it is.
       const raced = await prisma.paymentIntent.findUnique({ where: { gatewayRef: expectedGatewayRef } });
       if (!raced) throw;
       if (raced.referenceId !== booking.id) {
         -> 409 UPI_TRANSACTION_ID_ALREADY_USED   // cross-booking collision (realistically upi_qr only).
                                                  // NEVER fall through to confirm.
       }
       intent = raced;   // genuine same-booking race — safe to continue
     }
   }

5. // HELD -> CONFIRMED via the EXACT call the webhook makes (idempotent if already CONFIRMED)
   const confirmRes = await fetch(`${slotEngine}/bookings/${booking.id}/confirm`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
     body: JSON.stringify({}),
   });
   if (!confirmRes.ok) -> 502, log the body + intent id   (same posture as the webhook, :477)
   const confirmed = (await confirmRes.json()).data ?? ...;

6. reply.status(201);
   return { booking: confirmed, payment: {
     intentId: intent.id, status: intent.status, amount: intent.amount,
     gatewayRef: intent.gatewayRef, method: paymentMethod,
   }};
```

`referenceId` on a `PaymentIntent` is a bare `String` (no FK), so the `raced.referenceId !== booking.id` check is a plain string compare — cheap and exact.

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

## 4. Decisions — resolved with the reviewer

All three confirmed by the reviewer (10 Sep 2026), and the §2b logic above now reflects them:

1. **`cash`/`upi_qr` when a *pending* intent already exists for the booking** → **400 `BOOKING_HAS_PENDING_INTENT`**, not silent supersession. Silently superseding a dangling `razorpay_link` intent does not cancel the real Razorpay link, so the guest could still pay it later and double-capture — surfacing it to the admin is the safe default.
2. **`confirm` fails *after* the `captured` intent is written** → **502 + loud log + intent id in the body**, no compensation logic. Matches the webhook's own posture (`:477`). The §2b step-3 retry-detection branch now gives this a real self-healing path — a retried request with the same key re-runs the idempotent confirm instead of erroring.
3. **Response status for `cash`/`upi_qr`** → **`201`**. `razorpay_link` keeps `/payment-links/negotiated`'s `200|201` (reused vs new).

Plus, from the reviewer's bug catch: a **cross-booking `gatewayRef` collision** (a reused admin-typed `upiTransactionId`) → **409 `UPI_TRANSACTION_ID_ALREADY_USED`**, and the route must **never** confirm a booking against an intent whose `referenceId` is a different booking.

## 5. Verification (live-fire, before reporting back — extra rigor per the reviewer)

Direct API calls against the dev stack (payment :3004, slot-engine :3001) with a **real `badminton_db` JBC pool + a fresh availability window**, internal-key path:

To surface the **HELD → CONFIRMED** transition around the real `/bookings/:id/confirm` call (the reviewer's explicit ask), the live-fire script issues its **own** `POST ${slotEngine}/bookings/negotiated` first (internal key, a distinct Idempotency-Key) to hold a booking, reads it back (`status: HELD`), then calls that same route directly to show `status: CONFIRMED` — proving the primitive in isolation — *and* records the `/bookings/manual` response's booking status. It does not try to observe the mid-flight HELD state inside a single `/bookings/manual` call (there's no seam to do so), it demonstrates the transition the route composes.

- **`cash`:** POST `/bookings/manual` → 201; DB read-back: booking `CONFIRMED`, `PaymentIntent { status: 'captured', amount === Math.round(price*100), gatewayRef` starts `cash_`, `referenceId === booking.id }`. Separately: a standalone `/bookings/negotiated` → read `HELD` → `/bookings/:id/confirm` → read `CONFIRMED`, reported as the before/after pair.
- **`cash` retry** (same Idempotency-Key, same body) → 201, **same `booking.id` and same `intentId`**, exactly one `PaymentIntent` row for that booking (`SELECT count(*)`), booking still `CONFIRMED` (idempotent confirm re-run, no error).
- **`upi_qr`:** POST → 201, `gatewayRef === 'upi_<the exact txn id sent>'`, booking `CONFIRMED`.
- **`upi_qr` resubmit, same booking** (same Idempotency-Key + same `upiTransactionId`) → 201, same `intentId`, one row — the same-booking race branch.
- **`upi_qr` cross-booking collision:** a **second, different** booking (fresh Idempotency-Key, different window) with the **same `upiTransactionId`** → **409 `UPI_TRANSACTION_ID_ALREADY_USED`**; DB read-back: the second booking is **not** `CONFIRMED` (still `HELD`, expires on its own), and there is still exactly one `PaymentIntent` for that `upi_` ref, pointing at the first booking.
- **`upi_qr` without `upiTransactionId`** → 400 `UPI_TRANSACTION_ID_REQUIRED`.
- **`cash`/`upi_qr` when a `pending` link intent already exists** for the booking id → 400 `BOOKING_HAS_PENDING_INTENT`.
- **multi-window (F-183) booking via `cash`** if a JBC pool can express it → confirm cascade reaches `parentBookingId` child rows (all `CONFIRMED`). If not expressible against real JBC data here, cover it in the regression suite instead and say so.
- **`razorpay_link`:** produces a working `plink_mock_...` + `rzp.io/l/mock-...`, `PaymentIntent status: 'pending'`, `gatewayRef` starts `plink_mock_` — **explicit check it is unchanged from `/payment-links/negotiated`.**
- **`/payment-links/negotiated` itself** re-run post-refactor → identical behaviour (idempotency retry → same booking + intent, member JWT → 403).
- **auth:** non-admin JWT → 403; wrong-branch `branch_manager` → 403; no auth → 401; bad `paymentMethod` → 400.
- All test bookings / intents / users deleted from `badminton_db` afterwards, `SELECT count(*) === 0` confirmed — no demo-data pollution.

New regression suite `services/payment/src/regression/manual-booking.regression.ts` covering all three methods + the cash retry + the UPI resubmit + the cross-booking 409 + auth, added to `run.ts`. Then `pnpm -r build` (rebuild — suites run from `dist`), whole-repo typecheck/lint, full 5-service regression against `badminton_db_test`.

## 6. Commit / push / sign-off

One commit `F-229 Step 3: POST /bookings/manual (payment)` + `docs(F-229): batch-log Batch 37`. Push to `f229-manual-booking`, report raw evidence — including the HELD→CONFIRMED before/after around every real `/bookings/:id/confirm` call — for independent re-verification **before Step 4**. No PR to `main` yet. **No commit until this plan is signed off.**
