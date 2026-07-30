# Implementation Plan — Phase 9: Backend Batch Refits (Revised)

All gaps from the first review are addressed below. Each fix is called out
explicitly where the original plan had a problem.

---

## Database Schema Changes (`packages/database/prisma/schema.prisma`)

### [NEW] Enum
```prisma
enum PricingMode {
  FLAT
  PER_PERSON
}
```

### [MODIFY] `ResourcePool`
```prisma
model ResourcePool {
  // ... existing fields unchanged ...
  minOccupancy               Int                    @default(1)
  minBookingDurationMinutes  Int                    @default(60)
  pricingMode                PricingMode            @default(FLAT)
  defaultRate                Decimal                @default(100.00) @db.Decimal(10, 2)
  memberGroupAssignments     MemberGroupAssignment[]
}
```
> `basePrice` already exists; `defaultRate` is the pricing-mode-aware
> default and will coexist. `basePrice` becomes a legacy field (unused
> in new price calculation) — not removed now to avoid a breaking
> migration, but flagged for cleanup.

### [MODIFY] `AvailabilityWindow`
These fields capture the admin's per-release override. Both nullable — `null`
means "no override set, fall back to pool default." The sweep must not treat a
`null` override as overriding anything.

```prisma
model AvailabilityWindow {
  // ... existing fields unchanged ...
  pricingMode  PricingMode?
  price        Decimal?      @db.Decimal(10, 2)
}
```

### [MODIFY] `BookingRule`
Two distinct time-based fields — the earlier review clarification is baked in
here. They serve different purposes and must never be conflated.

```prisma
model BookingRule {
  // ... existing fields unchanged ...
  // Existing: gracePeriodMinutes — governs individual member seat release
  guestAccessCutoffMinutes  Int  @default(120)  // governs low-occupancy alert + manual release window
  lowOccupancyThresholdPct  Int  @default(50)   // admin-configurable; percentage triggers alert
}
```

> **Fix for issue 5**: `lowOccupancyThresholdPct` is a real schema field on
> `BookingRule`, not a hardcoded 50% in sweep logic. The sweep reads this
> value from the rule and uses it for the threshold check.

### [NEW] `MemberGroupAssignment`

**Revised from the original plan: two design changes.**

**Change 1 — Simplified schedule fields** (responding to the cron-expression
question): the actual requirement is weekdays + one fixed start time, not an
arbitrary cron. Storing `daysOfWeek` (e.g. `"1,2,3,4,5,6"` for Mon–Sat) and
`startTime` (e.g. `"10:00"`) is simpler to query, simpler to validate, and
readable without a cron parser. A full cron expression would be over-engineered
for this constraint.

**Change 2 — DB-level Basic-tier enforcement** (fix for issue 4): the unique
constraint `[userId, resourcePoolId]` from the original plan only prevents
assigning the same member to the same court twice — it does not enforce the
one-active-slot-per-member Basic-tier rule. Two concurrent requests assigning
to different courts would both pass an app-level pre-check before committing.
Fix: a **Postgres partial unique index** on `userId WHERE status = 'ACTIVE'`
enforces this at the database layer. If two concurrent transactions both try to
create an active assignment for the same user, the second will hit the unique
violation and be rejected — same P2002 catch pattern already used in Phase 1.

```prisma
model MemberGroupAssignment {
  id             String       @id @default(uuid())
  userId         String
  resourcePoolId String
  resourcePool   ResourcePool @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  daysOfWeek     String       // e.g. "1,2,3,4,5,6" (1=Mon … 7=Sun)
  startTime      String       // e.g. "10:00" (HH:mm, branch local time)
  status         String       // ACTIVE | SUSPENDED
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([userId, resourcePoolId])
  // Partial index enforced via a raw migration — see migration note below
}
```

> **Migration note**: the partial unique index cannot be expressed in Prisma
> schema syntax and requires a raw SQL migration step:
> ```sql
> CREATE UNIQUE INDEX member_assignment_one_active_per_user
>   ON "MemberGroupAssignment" ("userId")
>   WHERE status = 'ACTIVE';
> ```
> This will be added as a manual migration file after `prisma migrate` runs
> the schema diff.

### [MODIFY] `Tenant`
```prisma
model Tenant {
  // ... existing fields unchanged ...
  aboutDescription String?
  facilities       String[]  @default([])
  photos           String[]  @default([])
}
```

### [MODIFY] `Branch`
```prisma
model Branch {
  // ... existing fields unchanged ...
  workingDays       String[]  @default([])  // e.g. ["Monday", "Tuesday", ...]
  workingHoursStart String?                 // e.g. "06:00"
  workingHoursEnd   String?                 // e.g. "22:00"
  aboutDescription  String?
  facilities        String[]  @default([])
  photos            String[]  @default([])
}
```

### [MODIFY] `Refund`
```prisma
model Refund {
  // ... existing fields unchanged ...
  isOverride     Boolean   @default(false)
  overriddenBy   String?   // userId resolved from JWT — never from request body
  overrideReason String?
  overrideAt     DateTime?
}
```

---

## Section 1 — Slot Engine (`services/slot-engine`)

### 1a. `POST /resource-pools` — new fields
Accept and persist `minOccupancy`, `minBookingDurationMinutes`, `pricingMode`,
`defaultRate`. No auth change — this endpoint's existing gate is unchanged.

### 1b. `POST /resource-pools/:id/availability-windows` — release override
Accept optional `pricingMode` and `price`. Meaning: admin is setting a
per-release pricing override at the moment they open this window to guests.

Both are nullable on write. **If the admin provides one of `pricingMode` or
`price`, both must be provided** — a partial override (mode without rate, or
rate without mode) is rejected with `400 BAD_REQUEST`. This prevents silent
mis-pricing where only half the override is applied.

### 1c. `POST /bookings` — self-service path, contract unchanged
**Fix for issue 1**: this endpoint's contract is identical to Phase 4. It does
**not** accept a `price` field in any code path — no conditional, no header
check, no hidden branch. The server always resolves price from the window/pool
chain described below. A `price` key in the body is ignored completely, not
validated, not conditionally accepted.

Price resolution (applied server-side, always):
1. Load `AvailabilityWindow` and parent `ResourcePool`.
2. `activePricingMode` = `window.pricingMode ?? pool.pricingMode`
3. `activeRate` = `window.price ?? pool.defaultRate`
4. `groupSize` = `1 + (coPlayers?.length ?? 0)`
5. Validate: `pool.minOccupancy ≤ groupSize ≤ pool.capacity` → `400 INVALID_GROUP_SIZE` if violated.
6. `finalPrice` = `activeRate` if FLAT, `activeRate × groupSize` if PER_PERSON.
7. `price` on the `Booking` row is set to `finalPrice`. The caller has no influence over it.

### 1d. `POST /bookings/negotiated` — new, admin-only endpoint
**Fix for issue 1**: negotiated bookings get their own dedicated endpoint with
their own auth gate, entirely separate from the self-service path. This means
the self-service path's contract is never touched.

**Auth**: `Authorization: Bearer <INTERNAL_SERVICE_KEY>` required. Returns
`401` if missing, `403` if wrong key. (Same pattern as `POST /bookings/:id/confirm`
already in production.)

Body: `{ tenantId, branchId, resourcePoolId, resourceId?, windowId, userId,
negotiatedPrice, coPlayers? }`

Logic:
1. Auth gate checked first — reject immediately if not internal.
2. Availability check: same window lock + blocked-window + double-booking
   checks as the self-service path (court availability is still enforced per
   spec §6.11 — "no double-booking, price and group-size rules can be
   overridden by admin").
3. Group size constraints are **skipped** for this path — spec explicitly
   permits group-size override for negotiated bookings.
4. `price` is set to `negotiatedPrice` from the body — this is acceptable
   because the auth gate ensures only a verified internal caller can supply it.
5. Returns the created `Booking` in `HELD` state. The caller (Payment service)
   then creates the Payment Link against this booking ID.

### 1e. `POST /booking-rules` — new fields
Accept and persist `guestAccessCutoffMinutes` and `lowOccupancyThresholdPct`.

### 1f. `POST /member-group-assignments` — new, admin-only
**Fix for issue 3**: explicit auth gate.

**Auth**: `Authorization: Bearer <INTERNAL_SERVICE_KEY>` **or** verified JWT
with role `OWNER` or `BRANCH_MANAGER` for the relevant tenant. Reuses the
`verifyTenantOwnerOrInternal` pattern from Tenant service — will be extracted
to shared middleware or duplicated with the same logic.

Body: `{ userId, resourcePoolId, daysOfWeek, startTime }`

Logic:
1. Auth gate.
2. Verify `resourcePool` exists.
3. Attempt `create` inside a `$transaction`. The Postgres partial unique index
   on `userId WHERE status = 'ACTIVE'` is the enforcement mechanism. If a
   concurrent request races, the second will throw `P2002` which is caught and
   returned as `409 ASSIGNMENT_ALREADY_EXISTS`. No app-level pre-check needed
   — the DB does the work.
4. Return the new assignment.

`GET /member-group-assignments?resourcePoolId=&userId=`: list, internal only.

`PATCH /member-group-assignments/:id`: update status (ACTIVE → SUSPENDED),
internal or owner only.

### 1g. `GET /resource-pools/:id/occupancy` — new
No auth required (read-only, non-sensitive aggregate).

Returns:
```json
{
  "totalCapacity": 10,
  "confirmedSeats": 4,
  "occupancyPercentage": 40
}
```
Computed across all non-cancelled, non-released bookings for the pool's active
windows in a configurable date range (defaults to today).

### 1h. `POST /resource-pools/:id/windows/:windowId/release` — new, admin-only
**Fix for issue 3**: explicit auth gate.

**Auth**: `Authorization: Bearer <INTERNAL_SERVICE_KEY>` or owner/branch-manager
JWT (same dual-path as 1f).

Body: `{ pricingMode?, price? }` — optional per-release override. If neither
is provided, pool defaults are used. If one is provided without the other,
`400` (same rule as 1b).

Sets `pricingMode` and `price` on the target `AvailabilityWindow`, making it
available to guest booking. Returns the updated window.

### 1i. `POST /bookings/sweep` — lazy member booking generation (revised)
No auth change (test/ops endpoint, not guest-facing).

New behaviour added to the existing sweep:
1. Load all `MemberGroupAssignment` records with `status = 'ACTIVE'`.
2. For each assignment:
   a. Parse `daysOfWeek` to determine if today's weekday matches.
   b. Find the `AvailabilityWindow` for this pool on today's date starting at
      `startTime`.
   c. Check whether a `Booking` row already exists for this `userId` +
      `windowId` (any status except CANCELLED).
   d. If no booking exists and `now ≥ slotStartTime - guestAccessCutoffMinutes`:
      - Create the `Booking` in `RELEASED_NO_SHOW` state inside `$transaction`
        with `SELECT ... FOR UPDATE` on the window — same concurrency path as
        Phase 1. If a race (member simultaneously tapping confirm or front-desk
        checking in) causes a `P2002` on `idempotencyKey`, catch and return
        the existing booking.
   e. After creation, recompute occupancy percentage for this pool/window.
   f. If `occupancyPercentage < rule.lowOccupancyThresholdPct`, dispatch a
      `low_occupancy_alert` notification to the pool's admin contact via the
      Notification service (internal key authenticated call).

---

## Section 2 — Tenant Service (`services/tenant-management`)

### 2a. `POST /tenants/:id/branches` — new fields
Add `workingDays`, `workingHoursStart`, `workingHoursEnd`, `aboutDescription`,
`facilities`, `photos` to body parsing and `prisma.branch.create`. Existing
auth gate (`verifyTenantOwnerOrInternal`) unchanged.

### 2b. `PATCH /branches/:id` — new fields
Same fields added to the update path. Existing auth gate unchanged.

### 2c. `PATCH /tenants/:id` — facilities defaults
Add `aboutDescription`, `facilities`, `photos` to body parsing and
`prisma.tenant.update`. Existing auth gate unchanged.

### 2d. `GET /branches/:id/about` — new, public
No auth required (guest-readable, same as existing branch listing).

Returns branch-level fields if non-empty; otherwise falls back to parent
tenant defaults:
```typescript
const branch = await prisma.branch.findUnique({ where: { id }, include: { tenant: true } });
const about = {
  description: branch.aboutDescription || branch.tenant.aboutDescription || null,
  facilities:  branch.facilities.length > 0 ? branch.facilities : branch.tenant.facilities,
  photos:      branch.photos.length > 0     ? branch.photos     : branch.tenant.photos,
};
```

---

## Section 3 — Payment Service (`services/payment`)

### 3a. `POST /payment-links` — new, admin-only

**Auth** (fix for the vagueness noted in review): same explicit dual-path as
Phase 3's role assignment — `Authorization: Bearer <INTERNAL_SERVICE_KEY>` OR
a verified JWT with role `OWNER` or `BRANCH_MANAGER`. If neither matches,
`401`. If JWT present but wrong role, `403`. This is stated explicitly, not
left as "admin check."

Body: `{ bookingId, tenantId, userId, amount, description? }`

Logic:
1. Auth gate.
2. Verify `bookingId` exists in Slot Engine (internal lookup) and is in `HELD`
   state.
3. Call Razorpay Payment Links API (mocked in dev as `plink_mock_<hex>`).
4. Create `PaymentIntent`:
   - `gatewayRef`: the payment link ID (`plink_...`)
   - `referenceId`: `bookingId`
   - `status`: `'pending'`
5. Return `{ paymentLinkId, shortUrl, amount }`.

### 3b. `POST /webhooks/razorpay` — updated matching logic
On `payment.captured`, the current code looks up `paymentIntent` by
`gatewayRef = paymentEntity.id` (`pay_...`). Payment Links generate a
`pay_...` entity whose payload includes `payment_link_id: "plink_..."`.

Updated lookup:
```typescript
const gatewayRef = paymentEntity?.id;                    // pay_XYZ
const linkRef    = paymentEntity?.payment_link_id ?? null; // plink_ABC, or null for non-link payments

const intent = await prisma.paymentIntent.findFirst({
  where: {
    OR: [
      { gatewayRef },
      ...(linkRef ? [{ gatewayRef: linkRef }] : []),
    ],
  },
});
```
This is additive — existing self-service payment flows are unaffected. The link
ref match only fires when `payment_link_id` is present in the payload.

### 3c. `POST /refunds/override` — new, admin-only

**Fix for issue 2**: two changes from the original plan.

**Auth**: JWT required. `adminId` is extracted from `request.jwtVerify()`, not
accepted from the request body. Role must be `OWNER` or `BRANCH_MANAGER`.
Returns `401` if no JWT, `403` if wrong role.

Body: `{ bookingId, overrideAmount, reason }` — note `adminId` is **not** in
the body.

Logic:
1. Auth gate; extract `adminId` from JWT payload.
2. Fetch booking from Slot Engine (internal lookup). Booking must be
   `CANCELLED` (same check as existing `/refunds`).
3. Verify a captured `PaymentIntent` exists for this booking.
4. Verify no `Refund` record already exists (idempotency guard).
5. Validate `overrideAmount ≤ intent.amount / 100` (can't refund more than
   paid).
6. Create `Refund`:
   ```typescript
   {
     paymentIntentId: intent.id,
     amount:          Math.round(overrideAmount * 100),
     reason:          reason,
     status:          'processed',
     isOverride:      true,
     overriddenBy:    adminId,  // from JWT, not body
     overrideReason:  reason,
     overrideAt:      new Date(),
   }
   ```
7. Notify Slot Engine via internal call to update `booking.refundAmount` to
   `overrideAmount` (so downstream reporting is consistent).

---

## Section 4 — Notification Service (`services/notification`)

### 4a. `CHANNEL_POLICY` — new event type
```typescript
const CHANNEL_POLICY = {
  // ... existing entries unchanged ...
  low_occupancy_alert: ['push', 'sms'],  // both — admin must not miss this
};
```

No new infrastructure. The existing `resolveAndQueue` function handles channel
resolution, dispatch, and retry for this event exactly as it does for all
others. The Slot Engine sweep calls `POST /notifications/send` with
`event_type: 'low_occupancy_alert'` and variables:
`{ poolId, poolName, confirmedSeats, totalCapacity, occupancyPercentage }`.

---

## Two-Cutoff Mechanism Confirmation (not a plan item, a constraint check)

Both fields exist as distinct schema entries:
- `BookingRule.gracePeriodMinutes` (existing) — governs individual member seat
  release deadline.
- `BookingRule.guestAccessCutoffMinutes` (new) — governs when the sweep fires
  the low-occupancy alert and admin gets the option to release freed capacity
  to guests.

The sweep uses `guestAccessCutoffMinutes` for the lazy-generation trigger and
`gracePeriodMinutes` for the individual member hold expiry. These are read as
separate values and used in separate conditional branches — they never share a
code path.

---

## Verification Plan (`scratch/verify_retrofit_batch.ts`)

Three checkpoints, each in isolation:

### Checkpoint 1 — Pricing Override
1. Create `ResourcePool` with `pricingMode = FLAT`, `defaultRate = 100.00`.
2. Create `AvailabilityWindow` with `pricingMode = PER_PERSON`, `price = 150.00`.
3. Book via `POST /bookings` with 3 players (1 booker + 2 co-players). No
   `price` field in body.
4. Assert `booking.price === 450.00` (3 × 150.00, not 100.00).
5. Also verify: a request to `POST /bookings` with a `price` field in body
   results in that field being **ignored** (the calculated price is still
   returned, not the supplied one).

### Checkpoint 2 — Lazy Generation via Sweep
1. Create `MemberGroupAssignment` for a user, `daysOfWeek` includes today.
2. Create an `AvailabilityWindow` for today's slot.
3. Call `POST /bookings/sweep` with time simulated past `guestAccessCutoffMinutes`.
4. Assert a `Booking` row exists for this user + window with status
   `RELEASED_NO_SHOW`.
5. Assert this was created via the atomic `$transaction` path (by running two
   concurrent sweep calls and confirming only one booking was created).

### Checkpoint 3 — Manual Refund Override Audit Trail
1. Create booking, simulate `payment.captured` webhook to confirm it.
2. Cancel the booking via `POST /bookings/:id/cancel`.
3. Call `POST /refunds/override` with a valid admin JWT, `overrideAmount`,
   and `reason`.
4. Fetch the `Refund` record from the database.
5. Assert:
   - `isOverride === true`
   - `overriddenBy` matches the `userId` from the JWT (not any body-supplied value)
   - `overrideReason` matches the supplied reason
   - `overrideAt` is a non-null timestamp
   - `amount` in paise equals `overrideAmount × 100`
6. Also verify: calling `POST /refunds/override` without a JWT returns `401`,
   and with a JWT with role `MEMBER` returns `403`.
