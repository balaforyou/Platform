# Implementation Plan — Phase 1: Slot / Resource Engine

This plan covers the implementation of the Slot / Resource Engine service (`services/slot-engine`). It details the Prisma schema additions, standard Fastify endpoints, atomic booking reservation logic for concurrency safety, and the verification test suite.

## User Review Required

> [!IMPORTANT]
> **Prisma Relations Boundary**: As requested, since the Tenant and Branch services are not yet built (Phase 3), the fields `tenantId` and `branchId` on the `ResourcePool` and `Booking` models will be modeled as plain scalar `String` fields (UUIDs) in Prisma without enforcing actual database relations to any Tenant or Branch tables.

> [!NOTE]
> **Concurrency Safety Design**: To guarantee that two concurrent booking requests on the same `AvailabilityWindow` cannot both succeed, we will use **row-level database locking** (`SELECT ... FOR UPDATE`) in PostgreSQL. 
> Every booking attempt (`POST /bookings`) will run inside a Prisma transaction that locks the specific `AvailabilityWindow` row. This serializes concurrent booking requests for that slot, forcing the second request to wait until the first completes, at which point it reads the updated state and fails gracefully.

## Open Questions

All open questions have been resolved:
1. **Grace Period Auto-Release Logic**: 
   We have collapsed the grace-period logic into a single mechanism using `BookingRule.gracePeriodMinutes` (defaulting to `30` in the schema):
   - **Member Bookings** (`isMemberBooking = true`): If the booking is not confirmed/checked-in by `gracePeriodMinutes` *before* the slot start time (i.e. `now >= startTime - gracePeriodMinutes`), the background sweep releases it (`RELEASED_NO_SHOW`) so that the slot's capacity is returned to the public pool.
   - **Guest Bookings** (`isMemberBooking = false`): Guest bookings are paid upfront and are **never** auto-released before or during the slot based on check-in status. A guest running late will not lose their booking. Check-in for guests is only recorded for analytics/record-keeping.
   - **Hold TTL Expiry**: For both guests and members, any booking with `status = HELD` (temporary checkout hold) that is not confirmed within its TTL (`now > heldUntil`, default 5 minutes) is expired and marked as `RELEASED_NO_SHOW`.

---

## Proposed Changes

### Database Layer (`packages/database`)

We will update the Prisma schema to define the core models and enums required for the Slot Engine.

#### [MODIFY] [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)
Add enums and core models:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client"
}

enum AllocationMode {
  FIXED_INSTANCE
  POOLED
}

enum BookingStatus {
  HELD
  CONFIRMED
  CHECKED_IN
  RELEASED_NO_SHOW
  CANCELLED
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ResourcePool {
  id                  String               @id @default(uuid())
  tenantId            String               // Scalar UUID, no DB relation yet
  branchId            String               // Scalar UUID, no DB relation yet
  name                String
  allocationMode      AllocationMode
  capacity            Int                  @default(1) // Total capacity for POOLED mode
  resources           Resource[]
  availabilityWindows AvailabilityWindow[]
  bookingRules        BookingRule[]
  blockedWindows      BlockedWindow[]
  bookings            Booking[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
}

model Resource {
  id                  String               @id @default(uuid())
  resourcePoolId      String
  resourcePool        ResourcePool         @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  name                String
  availabilityWindows AvailabilityWindow[]
  bookings            Booking[]
  blockedWindows      BlockedWindow[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
}

model AvailabilityWindow {
  id             String        @id @default(uuid())
  resourcePoolId String
  resourcePool   ResourcePool  @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  resourceId     String?
  resource       Resource?     @relation(fields: [resourceId], references: [id], onDelete: SetNull)
  startTime      DateTime
  endTime        DateTime
  capacity       Int           @default(1) // Capacity count for POOLED mode (always 1 for FIXED_INSTANCE)
  bookings       Booking[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([startTime, endTime])
}

model BookingRule {
  id                     String       @id @default(uuid())
  resourcePoolId         String
  resourcePool           ResourcePool @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  memberWindowDays       Int          @default(30)
  guestOpenWindowDays    Int          @default(7)
  gracePeriodMinutes     Int          @default(30) // Default to 30 minutes per spec
  prepaymentRequired     Boolean      @default(true)
  cancellationPolicyJson Json         // Tiered policy mapping: { type: "tiered", tiers: [{ min_hours_before_slot, refund_percent }] }
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
}

model BlockedWindow {
  id             String        @id @default(uuid())
  resourcePoolId String
  resourcePool   ResourcePool  @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  resourceId     String?
  resource       Resource?     @relation(fields: [resourceId], references: [id], onDelete: SetNull)
  startTime      DateTime
  endTime        DateTime
  reason         String
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

model Booking {
  id             String         @id @default(uuid())
  tenantId       String         // Scalar UUID, no DB relation yet
  branchId       String         // Scalar UUID, no DB relation yet
  resourcePoolId String
  resourcePool   ResourcePool   @relation(fields: [resourcePoolId], references: [id], onDelete: Cascade)
  resourceId     String?
  resource       Resource?      @relation(fields: [resourceId], references: [id], onDelete: SetNull)
  windowId       String
  window         AvailabilityWindow @relation(fields: [windowId], references: [id], onDelete: Cascade)
  userId         String
  status         BookingStatus
  heldAt         DateTime       @default(now())
  heldUntil      DateTime
  idempotencyKey String?        @unique // unique check for API requests
  isMemberBooking Boolean       @default(false)
  refundAmount   Decimal?       @db.Decimal(10, 2)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([status, heldUntil])
}
```

---

### Slot Engine Service (`services/slot-engine`)

We will implement the endpoints and booking logic using Fastify.

#### [MODIFY] [services/slot-engine/src/index.ts](file:///d:/apps/Platform/services/slot-engine/src/index.ts)
Replaces the dummy endpoints with real logic.

- **`POST /resource-pools`**: Create a resource pool configuration.
- **`POST /booking-rules`**: Create rules for a resource pool.
- **`POST /blocked-windows`**: Create recurring/manual blocked windows.
- **`GET /resource-pools/:id/availability`**: 
  - Retrieves availability windows.
  - Computes remaining capacities for `POOLED` pools by subtracting active bookings (`HELD` or `CONFIRMED`).
  - Filters out windows that are blocked or fully booked.
- **`POST /bookings`**:
  - Requires `Idempotency-Key` header.
  - Implements the transactional locking:
    1. Lock the `AvailabilityWindow` row `FOR UPDATE`.
    2. Check if the window is within guest/member booking windows.
    3. Check if the window overlaps with `BlockedWindow` records.
    4. For `FIXED_INSTANCE`, verify no active bookings exist on that `(resourceId, windowId)`.
    5. For `POOLED`, verify total active bookings < window capacity.
    6. Create a booking in `HELD` state with `heldUntil = now + 5 minutes`.
- **`POST /bookings/:id/confirm`**:
  - Moves a booking from `HELD` to `CONFIRMED`.
- **`POST /bookings/:id/check-in`**:
  - Moves a booking from `CONFIRMED` to `CHECKED_IN`.
- **`POST /bookings/:id/cancel`**:
  - Moves a booking to `CANCELLED`.
  - Resolves pool cancellation rules, parsing `cancellationPolicyJson.tiers` descending, compares `startTime - now` in hours, computes the `refundAmount`, and stores it on the booking.
- **`POST /bookings/sweep`**:
  - Ops/test route to trigger the background cleanups:
    1. Reverses expired `HELD` bookings (`heldUntil < now`) -> `RELEASED_NO_SHOW`.
    2. Reverses member bookings (`isMemberBooking = true` and `status = CONFIRMED` or `HELD`) not confirmed/checked-in by `gracePeriodMinutes` before slot start (`now >= startTime - gracePeriodMinutes`) -> `RELEASED_NO_SHOW`.

---

## Verification Plan

### Automated Tests
We will write a dedicated integration test script at `services/slot-engine/src/concurrency.test.ts` (executed via a new script `pnpm run test:concurrency` inside the slot-engine service using `tsx`).

The script will setup database records and test the following scenarios:
1. **Concurrent Bookings (FIXED_INSTANCE)**:
   - Spawns 2 concurrent `POST /bookings` requests targeting the same `(resourceId, windowId)`.
   - Asserts that exactly one request succeeds with `201 Created` and the other fails with a `400/409` code (`SLOT_ALREADY_BOOKED`).
   - Asserts that only 1 booking is created in the database.
2. **Concurrent Bookings (POOLED)**:
   - Spawns 3 concurrent requests targeting a pooled slot with capacity = 2.
   - Asserts that exactly 2 succeed and 1 fails with `POOL_CAPACITY_EXCEEDED`.
3. **Idempotency Key Verification**:
   - Sends a hold request with header `Idempotency-Key: key123`.
   - Sends the exact same request again with `Idempotency-Key: key123` and verifies it returns `200 OK` along with the identical hold details (no duplicate DB row created).
   - Verifies a request without `Idempotency-Key` header is rejected with `400 Bad Request`.
4. **Held-Booking Expiry Sweep**:
   - Inserts a `HELD` booking with `heldUntil` set to 5 minutes ago.
   - Triggers the sweep route (`POST /bookings/sweep`).
   - Verifies the database status changes to `RELEASED_NO_SHOW`.
   - Verifies the slot can now be booked again.
5. **Member Grace Period Auto-Release Sweep**:
   - Inserts a member booking (`isMemberBooking: true`, status `CONFIRMED`) that starts 20 minutes from now, with `gracePeriodMinutes` set to 30.
   - Triggers the sweep route (`POST /bookings/sweep`).
   - Verifies the member booking status changes to `RELEASED_NO_SHOW` (since we are within the 30-minute window before the slot starts).
   - Inserts a guest booking (`isMemberBooking: false`, status `CONFIRMED`) that starts 20 minutes from now, and verifies it is **not** swept to `RELEASED_NO_SHOW`.

### Manual Verification
- Deploying the container locally, executing migration, booting the slot-engine, and calling the test script to assert it passes successfully.
