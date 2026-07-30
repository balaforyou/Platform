# Walkthrough — Phase 1: Slot / Resource Engine & Phase 0 Scaffolding

We have successfully completed all tasks in Phase 0 (Repo Scaffolding) and Phase 1 (Slot / Resource Engine). Below is a summary of the scaffolding, implementation changes, database migrations, and concurrency verification results.

---

# Phase 1: Slot / Resource Engine

## Changes Made

### 1. Database Schema Extensions (`packages/database`)
- Overwrote [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma) to define the full Slot Engine domain schema:
  - **Enums**: `AllocationMode` (`FIXED_INSTANCE`, `POOLED`) and `BookingStatus` (`HELD`, `CONFIRMED`, `CHECKED_IN`, `CANCELLED`, `RELEASED_NO_SHOW`).
  - **Models**:
    - `ResourcePool`: Represents a pool of courts, resources, or capacity.
    - `Resource`: Represents specific assignable assets (e.g. Court_3) in a `FIXED_INSTANCE` pool.
    - `AvailabilityWindow`: Represents a bookable slot in time (with a dedicated capacity or specific resource mapping).
    - `BookingRule`: Holds guest/member reservation windows, cancellation refund policies, and check-in grace periods.
    - `BlockedWindow`: Defines administrative blocks preventing reservations.
    - `Booking`: Tracks guest and member holds, confirmations, payments/prices, and refund amounts.
- Added a `price` field to the `Booking` schema to store historical booking values and allow accurate refund calculation.
- Successfully applied and registered the migrations:
  - `phase1_slot_engine`
  - `add_booking_price`
- Built the database client package and implemented a cross-platform compilation step (`copy-client.js`) to copy generated types to the compiled output directory, eliminating workspace import errors.

### 2. Slot Engine Service implementation (`services/slot-engine`)
- Replaced the placeholder implementation in [src/index.ts](file:///d:/apps/Platform/services/slot-engine/src/index.ts) with the actual API logic:
  - **`POST /resource-pools`**: Creates pools supporting both FIXED_INSTANCE and POOLED allocation.
  - **`POST /booking-rules`**: Declares cancellation rules and member/guest booking windows.
  - **`POST /blocked-windows`**: Blocks slots from public booking.
  - **`GET /resource-pools/:id/availability`**: Resolves window bookings while filtering out overlapping BlockedWindows.
  - **`POST /bookings`**: Core atomic booking hold creation with:
    - **Row-level locking (`FOR UPDATE`)** on `AvailabilityWindow` within a transaction to serialize concurrent holds.
    - **Prepayment & scheduling checks** validating if the slot falls inside the guest or member booking day window.
    - **Robust Idempotency**: Inspects `Idempotency-Key` headers. Catches database unique constraint violations (`P2002` errors) to return the existing booking details (200 OK) for concurrent double-submits.
    - **Standardized Conflict Codes**: Rejects overloaded slots with `409 Conflict` (mapped to `SLOT_ALREADY_BOOKED` or `POOL_CAPACITY_EXCEEDED` codes).
  - **`POST /bookings/:id/confirm`**: Transitions a hold to confirmed (typically triggered by a payment webhook).
  - **`POST /bookings/:id/check-in`**: Moves booking status to checked-in.
  - **`POST /bookings/:id/cancel`**: Transitions to cancelled and automatically evaluates remaining hours to calculate the tiered refund amount based on rule percentages.
  - **`POST /bookings/sweep`**: Developmental background sweep executor:
    - Automatically expires stale holds (now > `heldUntil`).
    - Releases unconfirmed member bookings within `gracePeriodMinutes` before slot start, leaving guest bookings untouched.

---

## Verification & Testing

### Concurrency and Business Logic Test Suite
We implemented a robust automated integration test runner in [concurrency.test.ts](file:///d:/apps/Platform/services/slot-engine/src/concurrency.test.ts) to verify edge cases. The test output shows all assertions succeeded:

```
Starting local Slot Engine server...
Server listening at http://0.0.0.0:3001
Slot Engine service running at http://localhost:3001
Local server is healthy. Running tests...
Starting Phase 1 Concurrency & Business Logic Verification...
Database cleaned successfully.
Seeded database entries successfully. Beginning tests...

--- Test 1: Concurrent Holds (FIXED_INSTANCE) ---
Request 1 status: 201, data: { data: { id: '...', status: 'HELD', idempotencyKey: 'fixed-key-req1' } }
Request 2 status: 409, data: { error: { code: 'SLOT_ALREADY_BOOKED', message: 'Slot is already booked' } }
Test 1 passed successfully!

--- Test 2: Concurrent Holds (POOLED) ---
Pooled Request 1 status: 201
Pooled Request 2 status: 201
Pooled Request 3 status: 409 (POOL_CAPACITY_EXCEEDED)
Test 2 passed successfully!

--- Test 3: Idempotency Key Retry ---
First hold status: 201
Retried hold status: 200 (duplicate request matched and returned original booking)
Test 3 passed successfully!

--- Test 4: Idempotency Key Concurrent Race Case ---
Race Request 1 status: 200 (gracefully resolved from Prisma P2002 constraint error)
Race Request 2 status: 201 (created booking)
Test 4 passed successfully!

--- Test 5: Held-Booking Expiry Sweep ---
Expired HELD booking created with ID: ...
Sweep result: { expiredHoldsCount: 1, releasedMembersCount: 0 }
Test 5 passed successfully!

--- Test 6: Member Auto-Release Sweep ---
Created member booking (isMemberBooking = true) and guest booking (isMemberBooking = false) starting in 15 minutes.
Sweep 2 result: { expiredHoldsCount: 0, releasedMembersCount: 1 }
Test 6 passed successfully! (Member swept to RELEASED_NO_SHOW, guest preserved as CONFIRMED)

All Phase 1 Concurrency & Business Logic Tests Passed Successfully!
Shutting down local Slot Engine server...
```

---

# Phase 0: Repo Scaffolding

## Changes Made

### 1. Monorepo Skeleton & Layout
- Configured **pnpm workspaces** (`pnpm-workspace.yaml`) targeting `services/*`, `apps/*`, and `packages/*`.
- Configured root settings in `package.json`, `tsconfig.json`, `.eslintrc.json`, and `.gitignore`.
- Created `.npmrc` to whitelist and automatically run build scripts of native dependencies (`@prisma/client`, `@prisma/engines`, `esbuild`, `prisma`).

### 2. Centralized Database Package (`packages/database`)
- Created `@badminton/database` package containing the Prisma schema under `packages/database/prisma/schema.prisma`.
- Configured the schema generator to compile the Prisma client directly into the package source tree at `packages/database/src/generated/client` (excluded from git).
- Integrated `dotenv-cli` in the package's scripts to explicitly load the root `.env` file when running Prisma commands.
- Exported the client from `packages/database/src/index.ts` so it is consumed centrally by all downstream services.

### 3. Shared Types Package (`packages/shared-types`)
- Created `@badminton/shared-types` containing the TypeScript definitions for the standard API response envelopes (`SuccessEnvelope`, `ErrorEnvelope`, `ApiResponse`).

### 4. Shared Middleware Package (`packages/shared-middleware`)
- Created `@badminton/shared-middleware` exporting a Fastify plugin `responseEnvelopePlugin` that:
  - Registers a `preSerialization` hook to wrap success payloads in a `{ "data": ... }` envelope, bypassing double wrapping if the payload is already formatted.
  - Registers a `setErrorHandler` hook to wrap error payloads in the standard `{ "error": { "code", "message", "details" } }` envelope.
  - Utilizes `fastify-plugin` to ensure these hooks apply globally across the parent server instance.

### 5. Services Scaffolding
- Scaffolded all 5 services as TypeScript Fastify projects under `services/`:
  - `services/slot-engine` (port 3001)
  - `services/identity-auth` (port 3002)
  - `services/tenant-management` (port 3003)
  - `services/payment` (port 3004)
  - `services/notification` (port 3005)

### 6. Apps Scaffolding
- Scaffolded two front-end React + Vite apps under `apps/`:
  - `apps/guest-member-pwa`
  - `apps/admin-web`

### 7. CI Pipeline
- Set up a GitHub Actions workflow in `.github/workflows/ci.yml` that performs `pnpm install`, `pnpm run lint`, and `pnpm run typecheck` on pushes and pull requests.
