# Phase 9 — Backend Batch Refits

## 1. Schema (`packages/database/prisma/schema.prisma`)
- [x] Add `PricingMode` enum
- [x] Add fields to `ResourcePool`: `minOccupancy`, `minBookingDurationMinutes`, `pricingMode`, `defaultRate`
- [x] Add override fields to `AvailabilityWindow`: `pricingMode`, `price`
- [x] Add fields to `BookingRule`: `guestAccessCutoffMinutes`, `lowOccupancyThresholdPct`
- [x] Add new model `MemberGroupAssignment` (with `daysOfWeek`, `startTime`, standard unique on `[userId, resourcePoolId]`)
- [x] Add fields to `Tenant`: `aboutDescription`, `facilities`, `photos`
- [x] Add fields to `Branch`: `workingDays`, `workingHoursStart`, `workingHoursEnd`, `aboutDescription`, `facilities`, `photos`
- [x] Add fields to `Refund`: `isOverride`, `overriddenBy`, `overrideReason`, `overrideAt`

## 2. Migration
- [x] Run `prisma migrate dev --name phase9_backend_batch`
- [x] Append partial unique index SQL to generated migration file
- [x] Verify migration applies cleanly

## 3. Slot Engine (`services/slot-engine`)
- [x] `POST /resource-pools` — accept new fields
- [x] `POST /resource-pools/:id/availability-windows` — accept `pricingMode` + `price` override (both-or-neither validation)
- [x] `POST /bookings` — server-side price resolution (window → pool fallback); `price` in body silently ignored
- [x] `POST /bookings/negotiated` — new endpoint, `INTERNAL_SERVICE_KEY` gate, accepts `negotiatedPrice`
- [x] `POST /booking-rules` — accept `guestAccessCutoffMinutes`, `lowOccupancyThresholdPct`
- [x] `POST /member-group-assignments` — new, dual-path auth (internal key or owner/branch-manager JWT)
- [x] `GET /member-group-assignments` — list, internal only
- [x] `PATCH /member-group-assignments/:id` — update status, internal or owner
- [x] `GET /resource-pools/:id/occupancy` — new, no auth
- [x] `POST /resource-pools/:id/windows/:windowId/release` — new, dual-path auth
- [x] `POST /bookings/sweep` — lazy member booking generation + low-occupancy alert dispatch
- [x] `GET /branches/:id/resource-pools` — new public endpoint returning resource pools at a branch

## 4. Tenant Service (`services/tenant-management`)
- [x] `POST /tenants/:id/branches` — accept new fields
- [x] `PATCH /branches/:id` — accept new fields
- [x] `PATCH /tenants/:id` — accept `aboutDescription`, `facilities`, `photos`
- [x] `GET /branches/:id/about` — new public endpoint with tenant fallback

## 5. Payment Service (`services/payment`)
- [x] `POST /payment-links` — new endpoint, dual-path auth, Razorpay Payment Link creation
- [x] `POST /webhooks/razorpay` — update matching to handle `payment_link_id`
- [x] `POST /refunds/override` — new endpoint, JWT required, `adminId` from JWT not body

## 6. Notification Service (`services/notification`)
- [x] Add `low_occupancy_alert: ['push', 'sms']` to `CHANNEL_POLICY`

## 7. Verification
- [x] Checkpoint 1 — Pricing override (window overrides pool, body price ignored)
- [x] Checkpoint 2 — Lazy generation via sweep (atomic transaction, idempotent) + concurrent database-level index validation
- [x] Checkpoint 3 — Refund override audit trail (JWT-sourced adminId, role gates)
