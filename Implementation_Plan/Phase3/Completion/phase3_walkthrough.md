# Walkthrough — Phase 3: Tenant Management, Phase 2: Identity & Auth, Phase 1: Slot Engine, & Phase 0 Scaffolding

We have successfully completed all tasks in Phase 0 (Repo Scaffolding), Phase 1 (Slot Engine), Phase 2 (Identity & Auth), and Phase 3 (Tenant/White-Label Management). Below is a summary of the implementation, database changes, and test results.

---

# Phase 3: Tenant / White-Label Management

## Changes Made

### 1. Database Schema Updates (`packages/database`)
- Extended the centralized [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma) with enums and models for Tenant Management:
  - **Enums**: `BranchStatus` (`DRAFT`, `ACTIVE`, `INACTIVE`) and `UserRole` (`OWNER`, `BRANCH_MANAGER`, `FRONT_DESK`).
  - **Models**:
    - `Tenant`: Scoped subdomain, branding configurations (logo, appName, themeColor), plan configuration, status, contact, and billing details.
    - `Branch`: Location record associated with Tenant. Defaults to `DRAFT` status.
    - `RoleAssignment`: Mapping `userId` to `UserRole` and `branchId` (null for `OWNER` role, required for branch-scoped roles).
- Generated and applied the migration script `phase3_tenant_management` non-interactively using Prisma's `migrate diff` and `migrate deploy`.

### 2. Tenant Management Service (`services/tenant-management`)
- Implemented core endpoints in [src/index.ts](file:///d:/apps/Platform/services/tenant-management/src/index.ts):
  - **`POST /tenants`**: Platform-managed tenant onboarding (requires `INTERNAL_SERVICE_KEY` verification).
  - **`PATCH /tenants/:id`**: Branding updates (requires valid JWT `OWNER` claims or `INTERNAL_SERVICE_KEY`).
  - **`GET /tenants/by-subdomain/:subdomain`**: Public config lookup.
  - **`GET /tenants/:id/manifest.json`**: Dynamic PWA manifest.json generation. Bypasses the `{ data: ... }` response enveloper using raw Node streams (`reply.raw`). Correctly routes exceptions (e.g. `TENANT_NOT_FOUND`) through global error handlers before raw stream output.
  - **`POST /tenants/:id/branches`**: Creates a branch in `DRAFT` status (requires `OWNER` or `INTERNAL_SERVICE_KEY`).
  - **`PATCH /branches/:id`**: Modifies branch metadata and flips status (e.g. `DRAFT` -> `ACTIVE`).
  - **`GET /tenants/:id/branches`**: List branches. Excludes draft branches unless `includeDraft=true` is requested and validated via JWT `OWNER` or `INTERNAL_SERVICE_KEY`.
  - **`POST /tenants/:id/roles`**: Role assignment registration. Supports both `INTERNAL_SERVICE_KEY` (platform bootstrapping) and JWT `OWNER` credentials.
  - **`GET /users/:id/roles`**: Helper lookup for Identity JWT signing. Returns raw assignments and flat string tokens.
  - **`GET /users/:userId/branches/:branchId/check`**: Access control scope check. Implements tenant-wide owner scoping (automatically returns `true` if role is `OWNER`).

---

## Verification & Testing

### 1. Tenant Management Integration Tests
We implemented a dedicated integration test suite in [tenant.test.ts](file:///d:/apps/Platform/services/tenant-management/src/tenant.test.ts) spawning Tenant, Identity, and Slot Engine servers:

```
Starting local servers (Slot Engine, Identity & Auth, Tenant Management)...
Local servers are ready. Executing integration tests...
Starting Phase 3 Tenant Management Integration Tests...
Database cleaned successfully.
Seeded tenant: Badminton Club (5daa2300-fe88-4efa-86c6-43bad8f695c1)

--- Test 1: Draft-to-Active Branch Gate ---
Branch created (status defaults to DRAFT): Branch A (3f674f27-964c-4df7-b58c-36e18f408a4e)
Draft branch successfully hidden from guest picker.
Branch status flipped to ACTIVE.
Active branch successfully visible to guest picker.
Test 1 passed successfully!

--- Test 2: Role Scoping & Owner Access ---
Role scoping restrictions successfully enforced (Access A: allowed, Access B: denied).
Owner null-branchId bypass successfully verified (Access granted to all branches).
Test 2 passed successfully!

--- Test 3: E2E JWT Role Embedding & Bootstrapping ---
[DEV OTP] Generated code 123456 for phone 8888888888
User promoted to MEMBER securely using INTERNAL_SERVICE_KEY.
[DEV OTP] Generated code 123456 for phone 8888888888
Decoded JWT payload claims: {
  userId: 'a5704ff0-37c0-45c0-99d4-88cd0ae9c07e',
  tenantId: '5daa2300-fe88-4efa-86c6-43bad8f695c1',
  phone: '8888888888',
  userType: 'MEMBER',
  roles: [ 'branch_manager:3f674f27-964c-4df7-b58c-36e18f408a4e' ],
  iat: 1785305538,
  exp: 1785306438
}
End-to-End verification successful! JWT token successfully embedded the Tenant-assigned roles.
Test 3 passed successfully!

--- Test 4: Dynamic Manifest Error Handling ---
Dynamic manifest error path caught and returned standard envelope correctly.
Test 4 passed successfully!

All Phase 3 Tenant Management Tests Passed Successfully!
Shutting down local servers...
```

### 2. Backwards Compatibility Verification
- Re-ran Slot Engine concurrency tests: **Passed successfully!**
- Re-ran Identity & Auth integration tests: **Passed successfully!**
- Running ESLint checked all files and returned **0 warnings and 0 errors**.

---

# Phase 2: Identity & Auth

## Changes Made
- Added `User`, `AuthSession`, `PendingInvite`, and `OtpRequest` to [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma).
- Implemented `/auth/otp/request` and `/auth/otp/verify` with rate limiting, cooldown check, and default `GUEST` user type creation.
- Implemented `/auth/google/verify` gating guest authentication with a `403 Forbidden` (`GOOGLE_LOGIN_ONLY_FOR_MEMBERS`) and redirecting new google logins to phone registration.
- Added token rotation and session revocation support in `/auth/refresh` and `/auth/logout`.
- Implemented secure, internal `PATCH /users/:id/type` to support type promotion.

---

# Phase 1: Slot / Resource Engine

## Changes Made
- Implemented the full Slot Engine domain schema: `ResourcePool`, `Resource`, `AvailabilityWindow`, `BookingRule`, `BlockedWindow`, and `Booking`.
- Configured atomic booking holds utilizing row-level database locking (`FOR UPDATE`) inside transactions to serialize concurrent reservation requests.
- Integrated tiered cancellation refund calculations and sweeping logic for stale holds.

---

# Phase 0: Repo Scaffolding

## Changes Made
- Configured pnpm workspaces, eslint/typescript compilers, and `.npmrc` settings.
- Added `@badminton/shared-middleware` globally applying Fastify response and error envelopes.
