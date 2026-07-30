# Walkthrough — Phase 2: Identity & Auth, Phase 1: Slot Engine, & Phase 0 Scaffolding

We have successfully completed all tasks in Phase 0 (Repo Scaffolding), Phase 1 (Slot Engine), and Phase 2 (Identity & Auth). Below is a summary of the implementation, database changes, and test results.

---

# Phase 2: Identity & Auth

## Changes Made

### 1. Database Schema Extensions (`packages/database`)
- Extended the centralized [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma) with the Identity and Auth models:
  - **Enums**: `UserType` (`GUEST`, `MEMBER`, `STAFF`).
  - **Models**:
    - `User`: Scoped per `tenantId`. Enforces unique indexes on `(phone, tenantId)`, `(email, tenantId)`, and `(googleId, tenantId)`. Defaults to `GUEST` user type.
    - `AuthSession`: Handles session tracking and refresh tokens with expiration and rotation properties.
    - `PendingInvite`: Caches phone number invites scoped per tenant.
    - `OtpRequest`: Logs requested OTP codes, attempts, and IP addresses for abuse prevention.
- **Slot Engine Schema Reopening**: Added a `BookingPlayer` model (with `@@unique([bookingId, phone])` constraint) to represent group booking co-players, and associated it with the main `Booking` model to link reservation history.
- Successfully applied and registered the database migration:
  - `phase2_identity_auth`

### 2. Identity & Auth Service Implementation (`services/identity-auth`)
- Replaced the placeholder code in [src/index.ts](file:///d:/apps/Platform/services/identity-auth/src/index.ts) with the operational endpoints:
  - **`POST /auth/otp/request`**:
    - **Abuse Prevention & Rate Limiting**: Limit to 1 request/min cooldown per phone number, max 3 requests/10-min per phone number, and max 10 requests/10-min per IP.
    - **Production Gate**: Gated OTP console-log printing on `NODE_ENV !== 'production'` and MSG91 key absence. In production, missing credentials fail closed with a `500 Internal Server Error`.
  - **`POST /auth/otp/verify`**:
    - Verifies the OTP, tracking attempts and invalidating the request after 3 failures.
    - On success: checks/registers the namespaced `User` (defaulting to `GUEST`), deletes any matching `PendingInvite`, and calls Slot Engine's `/bookings/resolve-invites` to link booking history.
    - Sets the rotated `refresh_token` in an httpOnly cookie and returns the `accessToken` JWT (15 mins TTL).
  - **`POST /auth/google/verify`**:
    - Authenticates Google ID Tokens. Gated locally via `userType`: GUEST logins are rejected with a `403 Forbidden` (`GOOGLE_LOGIN_ONLY_FOR_MEMBERS`).
    - New Google signups are redirected to verification with a `PHONE_VERIFICATION_REQUIRED` code.
  - **`POST /auth/refresh`**:
    - Rotates the refresh token (updates session row, deletes/invalidates old token value, sets a new cookie) and issues a new access token.
  - **`POST /auth/logout`**:
    - Invalidates the active session and clears the cookie.
  - **`PATCH /users/:id/type`**:
    - Secure, internal endpoint to promote user types (e.g. `GUEST` -> `MEMBER` or `STAFF`). Protected via `Authorization: Bearer <INTERNAL_SERVICE_KEY>` header to secure the trust boundary.

### 3. Slot Engine Route Extension (`services/slot-engine`)
- Destructured `coPlayers` array in `POST /bookings` to create `BookingPlayer` records inside the transactional hold process using Prisma nested writes.
- Added **`POST /bookings/resolve-invites`**:
  - Secure internal route to set the `userId` of any unmapped `BookingPlayer` records matching a newly registered phone number.
  - Protected via `Authorization: Bearer <INTERNAL_SERVICE_KEY>` header.

---

## Verification & Testing

### 1. Identity & Auth Integration Tests
We implemented a comprehensive automated integration test suite in [identity.test.ts](file:///d:/apps/Platform/services/identity-auth/src/identity.test.ts) that spawns both the Identity and Slot Engine servers to verify end-to-end functionality:

```
Starting local Identity & Auth and Slot Engine servers...
Servers are ready. Executing integration tests...
Starting Phase 2 Identity & Auth Integration Tests...
Database cleaned successfully.
Seeded group booking: ... with invited co-player phone: 9999999999

--- Test 1: OTP Rate-Limiting & Cooldown ---
Cooldown 429 triggered correctly.
Rate limit 429 triggered correctly.
Test 1 passed successfully!

--- Test 2: OTP Verification & Registration ---
User registered successfully in GUEST mode with valid JWT & Cookies.
Test 2 passed successfully!

--- Test 3: Invite Resolution & Booking Linking ---
Co-player booking history resolved and linked successfully in Slot Engine.
Internal service endpoint resolve-invites rejected 401 unauthenticated requests correctly.
Test 3 passed successfully!

--- Test 4: Token Refresh Cookie & Rotation ---
Refresh token rotation completed and old token invalidated successfully.
Test 4 passed successfully!

--- Test 5: Google Signup Gating & Login Restrictions ---
New Google OAuth signup properly gated to phone verification flow.
Guest Google login blocked with 403 Forbidden correctly.
User promoted to MEMBER securely using INTERNAL_SERVICE_KEY.
Member Google login authenticated successfully (Happy Path).
Test 5 passed successfully!

All Phase 2 Identity & Auth Tests Passed Successfully!
Shutting down local servers...
```

### 2. Slot Engine Concurrency Tests
Re-ran the Slot Engine concurrency test suite to verify that the `BookingPlayer` schema additions and nested writes did not introduce regressions:
```
All Phase 1 Concurrency & Business Logic Tests Passed Successfully!
```

### 3. Linting Checks
Running `pnpm run lint` checked all files and passed successfully monorepo-wide with **0 errors and 0 warnings**:
```
$ eslint . --ext .ts,.tsx
```

---

# Phase 1: Slot / Resource Engine

## Changes Made

### 1. Database Schema Extensions
- Defined the Slot Engine models: `ResourcePool`, `Resource`, `AvailabilityWindow`, `BookingRule`, `BlockedWindow`, and `Booking`.
- Added a `price` field to the `Booking` schema to store historical booking values and allow accurate refund calculation.
- Successfully applied the migration `phase1_slot_engine` and `add_booking_price`.

### 2. Slot Engine Service implementation
- **`POST /resource-pools`**: Creates pools supporting both FIXED_INSTANCE and POOLED allocation.
- **`POST /booking-rules`**: Declares cancellation rules and member/guest booking windows.
- **`POST /blocked-windows`**: Blocks slots from public booking.
- **`GET /resource-pools/:id/availability`**: Resolves window bookings while filtering out overlapping BlockedWindows.
- **`POST /bookings`**: Atomic booking hold creation with row-level database locking (`FOR UPDATE`), scheduling limit checks, idempotency duplicate verification, and 409 conflict code mappings (`SLOT_ALREADY_BOOKED` / `POOL_CAPACITY_EXCEEDED`).
- **`POST /bookings/:id/confirm`**: Transitions a hold to confirmed.
- **`POST /bookings/:id/check-in`**: Moves booking status to checked-in.
- **`POST /bookings/:id/cancel`**: Transitions to cancelled and automatically calculates the tiered refund amount based on rule percentages.
- **`POST /bookings/sweep`**: Expires stale holds and auto-releases unconfirmed member bookings before slot start.

---

# Phase 0: Repo Scaffolding

## Changes Made

### 1. Monorepo Skeleton & Layout
- Configured pnpm workspaces (`pnpm-workspace.yaml`), root settings (`package.json`, `tsconfig.json`, `.eslintrc.json`, `.gitignore`), and `.npmrc` build approvals.

### 2. Centralized Database Package (`packages/database`)
- Created `@badminton/database` package containing the Prisma schema under `packages/database/prisma/schema.prisma` exporting the client centrally.

### 3. Shared Types Package (`packages/shared-types`)
- Created `@badminton/shared-types` containing the TypeScript definitions for standard API response envelopes.

### 4. Shared Middleware Package (`packages/shared-middleware`)
- Created `@badminton/shared-middleware` exporting a Fastify plugin `responseEnvelopePlugin` for wrapping payload data and mapping standard error schema layouts globally.
