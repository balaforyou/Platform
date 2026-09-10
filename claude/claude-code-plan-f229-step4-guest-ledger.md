# F-229 Step 4 — `GET /resource-pools/:id/guest-ledger` (slot-engine) — implementation plan

**Status:** plan-mode, awaiting sign-off. Steps 0–3 signed off; branch `f229-manual-booking` at `77ff375`.
**Scope:** one new **read-only** endpoint. No mutation, no schema change. Step 6 (the `/ledger` UI) consumes it.

---

## 1. Real code checked (rule 8)

| Thing | Location (verified) | Notes |
|---|---|---|
| `getInternalOrAdminAuth` | `services/slot-engine/src/index.ts:178` | internal key → `{ isInternal:true, roles:[] }`; else JWT, `roles.some(r => r==='owner' \|\| r.startsWith('branch_manager:'))`, 403 else; returns `{ isInternal, userId, roles, tenantId }`. |
| `requirePoolScope` | `services/slot-engine/src/index.ts:248` | loads the pool (404 if missing), `isAuthorizedForBranch(auth, pool.branchId)` → 403 else (owner **or** `branch_manager:<pool's branch>` — **not** owner-only). Returns the pool. **Exact precedent** for a pool-scoped admin read. |
| `GET /bookings/admin` | `services/slot-engine/src/index.ts:4157` | the shape the hand-off names — but it requires a `userId` query param and filters to one user, and post-filters with `isAuthorizedForBranch`. Not reusable as-is; a genuinely new route is needed (hand-off + reviewer both said so). Confirmed. |
| `Booking` model | `packages/database/prisma/schema.prisma:394` | `userId` is a **bare scalar** — no `user` relation. `resource` relation exists (F-205), `window` relation exists. `parentBookingId` for F-183 children. `price Decimal?`. |
| `PaymentIntent` model | `:525` | `referenceId` is a **bare String** (= bookingId, no FK), `amount Int` (paise), `status String`, `gatewayRef String @unique`. No relation to `Booking`. |
| `isMemberBooking` | `Booking.isMemberBooking Boolean @default(false)` | the hand-off's guest filter. |
| slot-engine reads `paymentIntent` / `user` today? | grep: **no** | this route is the first. Additive, read-only. |
| slot-engine regression `cleanDatabase()` | `_fixtures.ts:99` | wipes `booking`, `resourcePool`, … but **not** `paymentIntent` or `user` (slot-engine never made them). See §3. |

## 2. What gets built

### `GET /resource-pools/:id/guest-ledger` (slot-engine), placed near the other `/resource-pools/:id/*` admin reads

```
const auth = await getInternalOrAdminAuth(request, reply);
const pool = await requirePoolScope(auth, request.params.id, reply);   // 404 / 403 handled

const { status, limit } = request.query;   // both optional
const take = Math.min(Number(limit) || 200, 500);

// 1. the pool's guest bookings (parents only — F-183 children carry no price/intent, same
//    exclusion GET /bookings/admin and /bookings/my already make)
const bookings = await prisma.booking.findMany({
  where: {
    resourcePoolId: pool.id,
    isMemberBooking: false,
    parentBookingId: null,
    ...(status ? { status: status as BookingStatus } : {}),
  },
  include: { window: true, resource: true },
  orderBy: [{ window: { startTime: 'desc' } }],
  take,
});

// 2. join PaymentIntent by referenceId (bare string, no FK) — one extra query, mapped in memory
const intents = await prisma.paymentIntent.findMany({
  where: { referenceId: { in: bookings.map(b => b.id) } },
});
const intentByBooking = new Map(intents.map(i => [i.referenceId, i]));

// 3. resolve guest name/phone (Booking has no user relation) — one extra query
const users = await prisma.user.findMany({
  where: { id: { in: [...new Set(bookings.map(b => b.userId))] } },
  select: { id: true, name: true, phone: true },
});
const userById = new Map(users.map(u => [u.id, u]));

return bookings.map(b => {
  const intent = intentByBooking.get(b.id) ?? null;
  return {
    bookingId: b.id,
    status: b.status,
    date: b.window.startTime,
    windowStart: b.window.startTime,
    windowEnd: b.window.endTime,
    guest: userById.get(b.userId) ?? { id: b.userId, name: null, phone: null },
    court: b.resource?.name ?? (b.courtSlotIndex != null ? `Court ${b.courtSlotIndex}` : null),
    courtSlotIndex: b.courtSlotIndex,
    resourceId: b.resourceId,
    price: b.price,                                   // Decimal rupees, nullable
    payment: intent ? {
      intentId: intent.id,
      amountPaise: intent.amount,
      status: intent.status,                          // captured | pending | ...
      gatewayRef: intent.gatewayRef,
      method: deriveMethod(intent.gatewayRef),        // see below
    } : null,
  };
});
```

**`deriveMethod(gatewayRef)`** — a tiny pure helper, the single source of truth for the Cash/UPI/Link label (hand-off: "Do not add a `method` column anywhere"):

| prefix | method |
|---|---|
| `cash_` | `'cash'` |
| `upi_` | `'upi'` |
| `plink_mock_`, `plink_`, `pay_`, `pay_mock_` | `'link'` |
| anything else / no intent | `'other'` / `null` |

The frontend can still re-derive from the raw `gatewayRef` (also returned) — the route just does it once so Step 6 stays a pure render.

### Scoping decision — **pool-scoped**, not branch-scoped

The hand-off leaves "pool vs branch" to my call. Pool-scoped `:id` matches `requirePoolScope` **verbatim** — no new auth code, no new branch-membership check. JBC has exactly one pool per branch, so pool == branch in practice today. A branch that grows a second pool would need Step 6 to pick the pool (or a future `GET /branches/:id/guest-ledger` that unions the branch's pools). Flagged, not built.

## 3. Blast radius

| Touched | Effect |
|---|---|
| **new** `GET /resource-pools/:id/guest-ledger` + `deriveMethod` helper | additive, read-only |
| slot-engine now reads `prisma.paymentIntent` and `prisma.user` | first time — additive, `SELECT` only. The DB is shared and the schema is one; slot-engine already writes `Booking` that payment reads. A ledger view inherently spans booking + payment. |
| `services/slot-engine/src/regression/_fixtures.ts` `cleanDatabase()` | **+`db.paymentIntent.deleteMany()` and `db.user.deleteMany()`** — the new suite is the first to create those rows in this service's DB, and both identity-auth's and payment's own `cleanDatabase()` already wipe them. Additive teardown deletes, runs once at suite start against `badminton_db_test`. This is the one shared-file change; it cannot affect the other 27 sections (they create no `user`/`paymentIntent` rows). |
| slot-engine regression `run.ts` | +1 section import |
| `PaymentIntent` / `Booking` / any schema | **not touched** |

No frontend, no other service, no mutation path anywhere.

## 4. Decisions for the reviewer (light — read-only step)

1. **Pool-scoped route** (`:id` = resourcePoolId), per §2. Recommend yes — matches `requirePoolScope` exactly, and JBC is one-pool-per-branch. Branch aggregation deferred.
2. **`deriveMethod` in the route** vs. frontend-only. Recommend the route (single source of truth), raw `gatewayRef` also returned so nothing is lost.
3. **`cleanDatabase()` gets `paymentIntent` + `user` deletes** (§3). Recommend yes — consistent with the other two services, needed by this suite, zero effect on existing sections.
4. **Default `take: 200`, `?limit` up to 500, optional `?status`.** `GET /bookings/admin` has no cap; a ledger grows unbounded, so a sane default with an override is safer. Recommend as written.

## 5. Verification (live-fire)

Direct API calls against the dev stack (slot-engine :3001), real `badminton_db` JBC pool `ba1d1433`:

- Seed via the real routes: 1 `cash` booking + 1 `upi_qr` booking + 1 `razorpay_link` booking (all through `POST /bookings/manual`, Step 3) for a walk-in guest, **plus** 1 member booking (`isMemberBooking: true`) via the member path if expressible, else a direct `booking.create`.
- `GET /resource-pools/ba1d1433/guest-ledger` with an **owner JWT** → returns the 3 guest rows, **not** the member row; each row's `guest.name`/`phone` resolved, `court` populated, `payment.method` = `cash` / `upi` / `link` respectively, `payment.amountPaise` correct, `payment.status` = `captured` / `captured` / `pending`.
- **`branch_manager:<JBC branch>` JWT** → 200 (same data). **`branch_manager:<other branch>` JWT** → 403. **member JWT** → 403. **no auth** → 401. **unknown pool id** → 404.
- `?status=CONFIRMED` → only the confirmed rows. `?limit=1` → one row.
- DB read-back confirms the route invented nothing (row count matches a direct `SELECT`).
- All seeded rows deleted afterward, `SELECT count(*)` = 0 — no demo-data pollution.

New regression suite `services/slot-engine/src/regression/guest-ledger.regression.ts` (guest-vs-member filter, the three method labels, auth matrix, status filter), added to `run.ts`. Then `pnpm -r build`, whole-repo typecheck/lint, full 5-service regression against `badminton_db_test`.

## 6. Commit / push / sign-off

One commit `F-229 Step 4: GET /resource-pools/:id/guest-ledger (slot-engine)` + `docs(F-229): batch-log Batch 38`. Push, report evidence for independent re-verification **before Step 5**. No PR to `main`. **No commit until sign-off.**
