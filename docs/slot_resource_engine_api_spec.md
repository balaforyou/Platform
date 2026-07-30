# Slot / Resource Engine — API Contract (v0)

**Status:** First Platform Core component being specced. Consumed by app backends (badminton, driver) over API — never called directly by end-user clients.
**Related docs:** `platform_core_reusable_components.md`, `badminton_app_discovery_brief.md`

---

## 1. Scope

This service owns: resource pools, availability, and the booking lifecycle. It does **not** own payment execution (calls out to the Payment service), identity (assumes a `user_id` and `tenant_id` are already resolved by the caller), or anything vertical-specific (fare calculation, dispatch, court check-in QR logic).

## 2. Core entities

| Entity | Purpose |
|---|---|
| `Tenant` | A white-labelled client business (e.g. one Coimbatore court owner, or the driver-rental business) |
| `ResourcePool` | A bookable category — `allocation_mode: FIXED_INSTANCE` (named courts/tables) or `POOLED` (interchangeable drivers/cars) |
| `Resource` | A specific instance within a `FIXED_INSTANCE` pool (e.g. Court_3). Not used for `POOLED` pools — those just track a capacity count |
| `AvailabilityWindow` | A bookable time slice against a pool (or a specific resource, for fixed-instance) |
| `BookingRule` | Per-pool config: member window, guest open window, grace period, prepayment requirement, cancellation policy (**decided 26 Jul 2026:** tiered, tenant-configurable schema — `{type: "tiered", tiers: [{min_hours_before_slot, refund_percent}, ...]}`; full detail in `payment_service_api_spec.md` Section 5) |
| `BlockedWindow` | A recurring closed window (e.g. training hours) where no booking is allowed at all |
| `Booking` | The reservation record — see state machine below |

## 3. Booking state machine

```
held ──(payment captured)──> confirmed ──┬──> checked_in    (app tap or front desk)
                                          ├──> no_show/released  (grace deadline passed, unconfirmed)
                                          └──> cancelled     (user-initiated, before slot per policy)
```

- **`held`**: created the instant a user selects a slot and starts checkout. Time-boxed (TTL — needs a decided value, suggest starting at 5 minutes) so an abandoned checkout doesn't lock the slot forever. This is what prevents two guests from paying for the same court at the same time — see Section 5.
- **`confirmed`**: payment captured (guest) or the recurring instance for a member's subscription, auto-generated daily.
- **`checked_in` / `no_show`/`released` / `cancelled`**: terminal states. `no_show`/`released` is the trigger that frees the slot back to the pool for a new booking.

## 4. Endpoints (v0 draft)

All endpoints are service-to-service (API key or signed JWT per tenant+app, not end-user auth — that's the Identity service's job).

| Method & path | Purpose |
|---|---|
| `POST /resource-pools` | Create a pool (branch admin config) |
| `GET /resource-pools/{id}/availability?date=&from=&to=` | List open `AvailabilityWindow`s — for `FIXED_INSTANCE`, returns per-resource slots; for `POOLED`, returns remaining capacity per window |
| `POST /bookings` | Create a booking in `held` state. **Idempotency-Key header required** (see 5) |
| `POST /bookings/{id}/confirm` | Called by the Payment service webhook once payment captures — moves `held` → `confirmed` |
| `POST /bookings/{id}/check-in` | Marks `confirmed` → `checked_in` (from app tap or front-desk action) |
| `POST /bookings/{id}/cancel` | User-initiated cancellation — enforces the pool's cancellation policy (refund eligibility computed here, executed by Payment service) |
| `POST /booking-rules` | Configure a pool's rules (grace period, prepayment, windows) |
| `POST /blocked-windows` | Configure a recurring closed window for a pool |
| *(background job, not an endpoint)* | Sweeps `confirmed` bookings past their grace deadline with no `check-in` → `no_show`/`released`, and separately expires stale `held` bookings past their TTL |

## 5. Concurrency safety — the one thing that must not be gotten wrong

Two guests (or a guest and an auto-releasing member slot) must never be able to book the same `AvailabilityWindow` at the same time. Approach:
- `POST /bookings` runs inside a single database transaction that checks-and-reserves capacity atomically (e.g. a unique constraint on `(resource_id, window_id)` for `FIXED_INSTANCE`, or a row-level lock decrementing an integer capacity counter for `POOLED`) — the check and the reservation must be the same atomic operation, not a separate read-then-write.
- The **`Idempotency-Key` header** on `POST /bookings` ensures a retried request (e.g. a flaky mobile network) doesn't create a duplicate hold.
- A `held` booking that expires (TTL passed, no confirm) releases its capacity back automatically via the background sweep — this is what makes it safe to hold a slot during a 2-3 minute UPI payment flow without risking it being stuck forever if the user abandons checkout.

## 6. `FIXED_INSTANCE` vs `POOLED` — what differs in the API

- **`FIXED_INSTANCE`** (badminton courts, hotel tables): `POST /bookings` requires a specific `resource_id` — the caller (app backend) already knows which court, since the guest picked it.
- **`POOLED`** (drivers, rental cars): `POST /bookings` takes only the `resource_pool_id` and a time window — no specific `resource_id` at booking time. A separate field `assigned_resource_id` stays null until a later step (the driver app's dispatch module calls back to set it once a specific driver is matched). This engine doesn't do the matching — it just tracks that 1 unit of pool capacity is reserved.

## 7. Open technical decisions

- ~~Hold TTL value~~ — **decided: 5 minutes**, with optional short extension if the payment gateway signals "processing" before final confirmation.
- ~~Grace period for member auto-release~~ — **decided: 30 minutes before slot start**, as a starting point to adjust after real launch data.
- ~~Database choice~~ — **decided: managed PostgreSQL**, for transactional guarantees on the atomic reservation logic in Section 5.
- Whether `POST /bookings/{id}/confirm` is called via payment gateway webhook only, or also needs a client-side poll/fallback in case a webhook is missed

## 8. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Hold TTL = 5 minutes |
| 26 Jul 2026 | Member auto-release grace period = 30 minutes before slot (revisit post-launch) |
| 26 Jul 2026 | Database = managed PostgreSQL |

---
*Next component to spec once this is validated: Identity & Auth Service, or Payment Service — whichever the coding assistant needs first to start building against this contract.*
