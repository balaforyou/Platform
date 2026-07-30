# Walkthrough — Phase 9: Backend Batch Refits

We have successfully implemented the backend batch updates for Slot Engine, Tenant, Payment, and Notification services, completing the transition to a robust Basic-tier MVP setup.

---

## 1. Database Schema & Migration
- **Schema Updates** ([schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)):
  - Added `PricingMode` enum (`FLAT`, `PER_PERSON`).
  - Added pricing mode, default rate, min occupancy, and min booking duration to `ResourcePool`.
  - Added per-window `pricingMode` and `price` override fields to `AvailabilityWindow`.
  - Added `guestAccessCutoffMinutes` and `lowOccupancyThresholdPct` to `BookingRule`.
  - Added new model `MemberGroupAssignment` with weekdays (`daysOfWeek`) and time-of-day (`startTime`) schedules.
  - Added marketing/facilities fields (`aboutDescription`, `facilities`, `photos`) to `Tenant` and `Branch`.
  - Added audit/override fields (`isOverride`, `overriddenBy`, `overrideReason`, `overrideAt`) to `Refund`.
- **Migration & Concurrency Constraints** ([migration.sql](file:///d:/apps/Platform/packages/database/prisma/migrations/20260730071606_phase9_backend_batch/migration.sql)):
  - Applied migration successfully to local database.
  - Appended manual PostgreSQL partial unique index on `MemberGroupAssignment` enforcing the Basic-tier constraint of **one active assignment per member**:
    ```sql
    CREATE UNIQUE INDEX "member_assignment_one_active_per_user"
      ON "MemberGroupAssignment" ("userId")
      WHERE status = 'ACTIVE';
    ```
    This enforces the constraint safely at the database level, preventing race conditions.

---

## 2. Slot Engine Additions
- **Server-Side Price Resolution**: Self-service booking pricing is resolved on the server using the window pricing override or pool default. Any client-provided price parameter is silently discarded (Phase 4 trust boundary preserved).
- **Negotiated Bookings Endpoint (`POST /bookings/negotiated`)**: Gated behind `INTERNAL_SERVICE_KEY`. Waives occupancy and standard pricing constraints for admin-negotiated slots.
- **Member Group Assignments (`POST /member-group-assignments`)**: Handled with dual-path authorization (internal system key or JWT with `owner` / `branch_manager` roles). Surfances duplicate assignments as `409 ASSIGNMENT_ALREADY_EXISTS`.
- **Release and Occupancy Endpoints**:
  - `GET /resource-pools/:id/occupancy`: Public endpoint returning percentage and capacity counts.
  - `POST /resource-pools/:id/windows/:windowId/release`: Gated by admin/system authorization, allowing manual slot release to guests.
  - `GET /branches/:id/resource-pools`: Public endpoint returning the list of courts/pools at a branch.
- **Cleanup Sweep (`POST /bookings/sweep`)**:
  - Automatically cancels expired booking holds past the 5-minute TTL.
  - Releases unconfirmed member bookings past the `gracePeriodMinutes` limit.
  - Performs **lazy booking generation** for active members on their scheduled day.
  - Computes occupancy and dispatches `low_occupancy_alert` to the tenant if occupancy falls below `lowOccupancyThresholdPct`.

---

## 3. Tenant Service updates
- **Schedule and Marketing Fields**: Branch and Tenant endpoints accept and persist operational hours and metadata.
- **Public About API (`GET /branches/:id/about`)**: Public branch info page resolver implementing fallback to parent Tenant-level facilities/description when branch fields are empty.

---

## 4. Payment & Refund Policies
- **Payment Link Creation (`POST /payment-links`)**: Admin/system authenticated endpoint to generate Razorpay mock payment links. Stores the `payment_link_id` in `gatewayRef`.
- **Razorpay Webhook Matching**: Upgraded `POST /webhooks/razorpay` to match incoming payments by both standard checkout reference (`gatewayRef`) and Razorpay payment link identifier (`payment_link_id`).
- **Safe Refund Override (`POST /refunds/override`)**: Admin-only JWT-authenticated route to issue custom refund amounts. Evaluates permissions, validates original payment maximums, and logs the `adminId` from verified JWT claims (preventing user ID spoofing in request bodies).

---

## 5. Notification Routing
- Added `low_occupancy_alert` to `CHANNEL_POLICY` with push + SMS delivery to ensure admins are notified immediately of under-booked courts.

---

## 6. Verification Results
We wrote and executed a dedicated verification script ([verify_phase9.ts](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/scratch/verify_phase9.ts)) validating all critical requirements. 

**All 28 automated assertions passed successfully:**

```
── Checkpoint 1: Pricing override ────────────────────────────────
  ✅  Pool created
  ✅  Window with pricing override created
  ✅  Booking created
  ✅  Price resolved to 450 (PER_PERSON × 3 players)
  ✅  Body-supplied price (9999) was ignored
  ✅  Partial pricing override rejected with 400
  ✅  GET /branches/:id/resource-pools returns correct array of pools

── Checkpoint 2: Lazy sweep generation ───────────────────────────
  ✅  CP2 Pool created
  ✅  CP2 Window created
  ✅  Member assignment created
  ✅  Sequential duplicate assignment (different pool) rejected with 409 (partial index)
  ✅  Concurrent requests to different pools result in exactly one 201 and one 409
  ✅  Sweep ran successfully
  ✅  Lazy booking generated (lazyGeneratedCount >= 1)
  ✅  Second sweep is idempotent (lazyGeneratedCount = 0)

── Checkpoint 3: Refund override audit trail ─────────────────────
  ✅  No JWT returns 401
  ✅  MEMBER role JWT returns 403
  ✅  CP3 Pool created
  ✅  CP3 Window created
  ✅  CP3 Booking created
  ✅  CP3 Payment intent created
  ✅  Override refund returns 200/201
  ✅  isOverride = true
  ✅  overriddenBy = JWT adminId (not body)
  ✅  overrideReason set
  ✅  overrideAt is non-null
  ✅  amount = 250 × 100 paise
  ✅  Duplicate override returns existing refund (idempotent)

════════════════════════════════════════════════════════════
Phase 9 Verification: 28 passed, 0 failed
```
