# Implementation Plan — Phase 2: Identity & Auth

This plan covers the implementation of the Identity & Auth service (`services/identity-auth`). It details local role classifications, database updates for user accounts, session tracking, rate-limiting, group booking player invitations, and the integration tests.

## User Review Required

> [!IMPORTANT]
> **Closing the userType Trust Boundary (Fix #3 - Part 2)**:
> - The client application **cannot** supply the `userType` in the signup request body. Any client-provided type field will be ignored by the server.
> - **Self-registration default**: Public OTP registration (`POST /auth/otp/verify`) always creates accounts with `userType = GUEST` by default.
> - **Promotion via internal APIs**: We will expose a secure, internal, service-to-service endpoint `PATCH /users/:id/type` on the Identity service to allow updating a user's type (e.g. promoting them to `MEMBER` or `STAFF`). This endpoint will be called by the Tenant / Payment services when a subscription is purchased or a staff role is assigned.
> - **Google Signup gating**: During Google OAuth signup, the email/profile is verified. Upon phone number verification, the signup is only allowed if they are already registered as a member in the Tenant service (verified via a secure server call) or if they are staff.

> [!IMPORTANT]
> **Authentication for Internal Service-to-Service Endpoints**:
> - The new Slot Engine endpoint `POST /bookings/resolve-invites` and the Identity endpoint `PATCH /users/:id/type` are internal service-to-service routes.
> - These endpoints will be protected by verifying a shared secret configured in the environment variables as `INTERNAL_SERVICE_KEY`.
> - Requests must provide the header `Authorization: Bearer <INTERNAL_SERVICE_KEY>`. Any unauthenticated or mismatched requests will be rejected with `401 Unauthorized`.

---

## Proposed Changes

### Database Layer (`packages/database`)

We will update the Prisma schema to add the Identity and Auth models, as well as the co-player linking model for the Slot Engine.

#### [MODIFY] [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)
Add enums and models:
```prisma
enum UserType {
  GUEST
  MEMBER
  STAFF
}

// User identity model scoped per tenant
model User {
  id              String        @id @default(uuid())
  tenantId        String        // Scalar UUID, namespaced per tenant
  phone           String?
  email           String?
  googleId        String?
  isPhoneVerified Boolean       @default(false)
  isEmailVerified Boolean       @default(false)
  userType        UserType      @default(GUEST)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  sessions        AuthSession[]

  @@unique([phone, tenantId])
  @@unique([email, tenantId])
  @@unique([googleId, tenantId])
}

// Active session tracking supporting refresh token rotation
model AuthSession {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique
  expiresAt    DateTime
  revoked      Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// Pending invites cache
model PendingInvite {
  id        String   @id @default(uuid())
  tenantId  String
  phone     String
  createdAt DateTime @default(now())

  @@unique([phone, tenantId])
}

// OTP rate limit and abuse prevention log
model OtpRequest {
  id        String   @id @default(uuid())
  phone     String
  tenantId  String
  code      String
  ip        String
  attempts  Int      @default(0)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([phone, createdAt])
  @@index([ip, createdAt])
}

// Co-players invited to a group booking (linking booking history)
model BookingPlayer {
  id        String   @id @default(uuid())
  bookingId String
  booking   Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  userId    String?  // Resolved once they register/login
  phone     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([bookingId, phone])
  @@index([phone, userId])
}
```

Add relation to `Booking` model:
```prisma
model Booking {
  // ... existing fields ...
  players        BookingPlayer[]
  // ... existing fields ...
}
```

---

### Slot Engine Service (`services/slot-engine`)

#### [NEW] [POST /bookings/resolve-invites]
- Requires header `Authorization: Bearer <INTERNAL_SERVICE_KEY>`.
- Request body: `{ phone: String, userId: String, tenantId: String }`
- Updates all `BookingPlayer` records matching `phone` to set their `userId`.

---

### Identity & Auth Service (`services/identity-auth`)

#### [MODIFY] [package.json](file:///d:/apps/Platform/services/identity-auth/package.json)
Add dependencies:
- `@fastify/jwt` (JWT token generation & validation)
- `@fastify/cookie` (Cookie parsing and utilities for refresh token storage)

#### [MODIFY] [services/identity-auth/src/index.ts](file:///d:/apps/Platform/services/identity-auth/src/index.ts)
Replaces the placeholder endpoints with the real identity and auth logic:

- **`POST /auth/otp/request`**:
  - Checks rate-limits in `OtpRequest`.
  - Generates 6-digit code. Gated on `NODE_ENV !== 'production'` to log to console if credentials are absent, otherwise fails closed.
- **`POST /auth/otp/verify`**:
  - Verifies code (attempts count, expires).
  - Checks and creates namespaced `User` (automatically defaults `userType = GUEST`).
  - Checks if a `PendingInvite` exists. If so, resolves it (deletes the invite, calls Slot Engine `/bookings/resolve-invites` using `INTERNAL_SERVICE_KEY`).
  - Issues access/refresh tokens.
- **`POST /auth/google/verify`**:
  - Gated by local type check: if `user.userType === 'GUEST'`, returns `403 Forbidden` (`GOOGLE_LOGIN_ONLY_FOR_MEMBERS`).
  - Returns access/refresh tokens if exists, otherwise starts transient signup flow returning `PHONE_VERIFICATION_REQUIRED`.
- **`PATCH /users/:id/type`**:
  - Requires header `Authorization: Bearer <INTERNAL_SERVICE_KEY>`.
  - Updates the `userType` to `MEMBER` or `STAFF`. Used securely by upstream services.
- **`POST /auth/refresh`**:
  - Performs rotated refresh token validation and token rotation.
- **`POST /auth/logout`**:
  - Revokes session and clears cookie.
- **`GET /users/:id`**:
  - Internal endpoint returning user details.
- **`POST /users/resolve-invite`**:
  - Registers a `PendingInvite`.

---

## Verification Plan

### Automated Tests
We will write a dedicated integration test suite at `services/identity-auth/src/identity.test.ts` (runnable via `pnpm run test:auth`).
Tests will verify:
1. **OTP Request Abuse Prevention**:
   - Assert multiple calls to same number within 60s trigger `429 Cooldown`.
   - Assert 4 calls within 10 minutes trigger `429 Rate Limit Exceeded`.
2. **OTP Verification & User Creation**:
   - Assert failed OTP codes increment attempts.
   - Assert correct code creates namespaced `User` (defaulting to `GUEST`) and returns access JWT + httpOnly cookie.
3. **Internal endpoints & Authentication**:
   - Verify calling `POST /bookings/resolve-invites` or `PATCH /users/:id/type` without key returns `401 Unauthorized`.
   - Verify successful call with valid `INTERNAL_SERVICE_KEY`.
4. **Pending Invite & History Linking**:
   - Pre-insert a pending invite. Verify OTP signup deletes it and triggers resolve call to Slot Engine.
5. **JWT & Session Refresh Rotation**:
   - Verify token refresh rotates session tokens, revokes old refresh tokens, and returns new cookies.
6. **Google OAuth Verification Flows**:
   - Assert Google logins require phone registration for first-time signups.
   - Assert guests attempting Google login receive a `403 Forbidden` error.
   - Assert members (after promotion via internal API) attempting Google login succeed.

### Manual Verification
- Deploy local Postgres, run schema migrations, start identity-auth server, and verify tests complete with zero errors.
