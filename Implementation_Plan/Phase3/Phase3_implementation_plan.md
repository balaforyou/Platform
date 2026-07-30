# Implementation Plan — Phase 3: Tenant / White-Label Management

This plan covers the implementation of the Tenant / White-Label Management service (`services/tenant-management`). It details the database schema updates, service endpoints (including dynamic manifest generation), and the integration verification suite that validates role-scoping and JWT embedding.

## User Review Required

> [!IMPORTANT]
> **No Database-Level Cross-Service Relations**:
> In accordance with the modular service design, the database schema additions for the Tenant service (`Tenant`, `Branch`, `RoleAssignment`) will not have any database-level relations to Slot Engine models (`ResourcePool`, `Booking`). Those models continue to reference `tenantId` and `branchId` as plain scalar `String` fields.

> [!IMPORTANT]
> **Tenant Bootstrapping & Role Assignment Protection (Fix #1)**:
> The endpoint `POST /tenants/:id/roles` supports two independent authentication paths to prevent circular dependency blocks during bootstrapping:
> 1. **INTERNAL_SERVICE_KEY (Bootstrap path)**: Presenting a valid `Authorization: Bearer <INTERNAL_SERVICE_KEY>` allows platform administration scripts or other internal services to assign the very first `OWNER` role on a brand-new tenant, with no JWT check required.
> 2. **JWT OWNER (Self-service path)**: Gated on a valid JWT token matching the requested tenant ID where the caller's role is `OWNER`. This enables self-service role management by the tenant's own administration console.
> - Any requests failing both checks are rejected with `401 Unauthorized` or `403 Forbidden`.

> [!WARNING]
> **Dynamic manifest.json Enveloper Bypass & Error Gating (Fix #2)**:
> Since PWA manifests require a strict JSON shape at the root (no `{ data: ... }` wrapper), the endpoint `GET /tenants/:id/manifest.json` will bypass the global `preSerialization` envelope middleware by writing the raw stringified manifest JSON directly to the Node response stream via `reply.raw` **only after** all validation checks succeed.
> - If the tenant does not exist, an error is thrown **before** any raw stream writes occur. Fastify will intercept the error normally, route it through the global `setErrorHandler`, and return the standard `{ error: { code, message } }` response envelope with a `404` status code.
> - Our integration tests will explicitly assert this error path.

> [!IMPORTANT]
> **Draft-to-Active Branch Gate & includeDraft Restriction**:
> Branches are created in `DRAFT` status by default. The branch listing endpoint `GET /tenants/:id/branches` will filter out branches in `DRAFT` status by default.
> - Callers can request draft branches by passing `?includeDraft=true`.
> - The `includeDraft=true` parameter is **strictly gated** and will only be honored if the request is authenticated with a valid `INTERNAL_SERVICE_KEY` or a valid JWT access token where the caller is an `OWNER` of the tenant. Unauthorized attempts will ignore the parameter or be rejected.

---

## Proposed Changes

### Database Layer (`packages/database`)

We will update the Prisma schema to add the `Tenant`, `Branch`, and `RoleAssignment` models using explicit enums.

#### [MODIFY] [schema.prisma](file:///d:/apps/Platform/packages/database/prisma/schema.prisma)
Extend the existing `Tenant` model and add `Branch` and `RoleAssignment` models with enums:
```prisma
enum BranchStatus {
  DRAFT
  ACTIVE
  INACTIVE
}

enum UserRole {
  OWNER
  BRANCH_MANAGER
  FRONT_DESK
}

model Tenant {
  id              String           @id @default(uuid())
  name            String
  subdomain       String           @unique
  logo            String?
  themeColor      String           @default("#000000")
  appName         String?
  plan            String           @default("basic")
  status          String           @default("active") // active | suspended
  contactInfo     String?
  billingInfo     String?
  branches        Branch[]
  roleAssignments RoleAssignment[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model Branch {
  id              String           @id @default(uuid())
  tenantId        String
  tenant          Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String
  address         String?
  timezone        String           @default("UTC")
  status          BranchStatus     @default(DRAFT)
  roleAssignments RoleAssignment[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@unique([tenantId, name])
}

model RoleAssignment {
  id        String   @id @default(uuid())
  userId    String   // Plain scalar, no DB relation to User model (cross-service decoupling)
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branchId  String?
  branch    Branch?  @relation(fields: [branchId], references: [id], onDelete: SetNull)
  role      UserRole
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, tenantId])
}
```

---

### Tenant Management Service (`services/tenant-management`)

#### [MODIFY] [services/tenant-management/src/index.ts](file:///d:/apps/Platform/services/tenant-management/src/index.ts)
Replaces the placeholder endpoints with the real Tenant service logic:

- **`POST /tenants`**:
  - Platform-managed endpoint to onboard a new tenant business. Requires `INTERNAL_SERVICE_KEY` verification.
- **`PATCH /tenants/:id`**:
  - Updates branding, plans, or status. Requires JWT `OWNER` role or `INTERNAL_SERVICE_KEY`.
- **`GET /tenants/by-subdomain/:subdomain`**:
  - Retrieves tenant branding details mapped to a subdomain. Publicly accessible.
- **`GET /tenants/:id/manifest.json`**:
  - Dynamically builds manifest. If tenant is found, it bypasses the preSerialization hook using `reply.raw` to output raw JSON configuration to mobile browsers.
  - If tenant does not exist, throws `TENANT_NOT_FOUND` to yield a standard response error envelope.
- **`POST /tenants/:id/branches`**:
  - Self-service endpoint to create a new branch. Requires JWT `OWNER` or `INTERNAL_SERVICE_KEY`. Status defaults to `DRAFT`.
- **`PATCH /branches/:id`**:
  - Updates branch metadata and flips status (e.g. `DRAFT` -> `ACTIVE`). Requires JWT `OWNER` or `INTERNAL_SERVICE_KEY`.
- **`GET /tenants/:id/branches`**:
  - Returns branches picker configuration. Filters out `DRAFT` branches unless `includeDraft=true` is requested and caller matches `OWNER` or `INTERNAL_SERVICE_KEY` authorization.
- **`POST /tenants/:id/roles`**:
  - Registers a `RoleAssignment`. Requires JWT `OWNER` role (for that tenant) or `INTERNAL_SERVICE_KEY` verification.
  - Validates that:
    - `OWNER` roles have `branchId = null`.
    - `BRANCH_MANAGER` or `FRONT_DESK` roles require a valid `branchId` belonging to the tenant.
- **`GET /users/:id/roles`**:
  - Called by Identity at login/refresh. Returns list of raw role assignments and flat string tokens (e.g. `roles: ["branch_manager:branch-uuid"]`) for JWT consumption.
- **`GET /users/:userId/branches/:branchId/check`**:
  - Scope verification endpoint. Checks if `userId` has `OWNER` role for tenant, or scoped `BRANCH_MANAGER` / `FRONT_DESK` role for the branch.
  - **Owner Scoping**: If a role assignment is `OWNER` (where `branchId` is null), the query automatically grants access (`true`) to all branches under the tenant, rather than performing a literal matching check on the branch ID.

---

## Verification Plan

### Automated Integration Tests
We will write a dedicated multi-service integration test suite at `services/tenant-management/src/tenant.test.ts` (runnable via `pnpm run test:tenant` from the root).
The script will spawn the Tenant Management, Identity & Auth, and Slot Engine servers concurrently, performing the following checks:

1. **Draft-to-Active Branch Selector Gate**:
   - Create a Tenant and a Branch (defaults to `DRAFT`).
   - Query `GET /tenants/:id/branches` without auth. Verify the branch is **excluded**.
   - Query `GET /tenants/:id/branches?includeDraft=true` without auth. Verify parameter is ignored and branch is still **excluded**.
   - Activate the branch via `PATCH /branches/:id`.
   - Query `GET /tenants/:id/branches`. Verify the branch is **included**.

2. **Role Scoping Security Enforcement**:
   - Create Branch A and Branch B.
   - Assign user `test-manager` the role `BRANCH_MANAGER` for Branch A.
   - Assert access check to Branch A returns `true`.
   - Assert access check to Branch B returns `false` (scoping restriction enforced!).
   - Assign user `test-owner` the role `OWNER` (unscoped null branchId).
   - Assert access check to Branch B returns `true` (unscoped owner permission correctly bypasses the null branch check!).

3. **End-to-End JWT Role Embedding & Bootstrapping Verification**:
   - Create a Tenant using `INTERNAL_SERVICE_KEY`.
   - Create a test user via Identity OTP verification flow.
   - Promote user to `MEMBER` via Identity secure internal endpoint.
   - Assign user the role `BRANCH_MANAGER` for Branch A via Tenant Management roles API (bootstrapped using the `INTERNAL_SERVICE_KEY`).
   - Initiate a fresh session login or refresh via Identity service.
   - Extract the returned `accessToken` JWT, decode it, and assert that the `roles` array carries `["branch_manager:<BranchA-UUID>"]` (fully integrated!).

4. **Dynamic Manifest Error Handling Verification**:
   - Query `GET /tenants/nonexistent-uuid/manifest.json`.
   - Assert status code is `404` and response body matches the standard error envelope `{ error: { code: 'TENANT_NOT_FOUND', ... } }`.

### Manual Verification
- Deploy local PostgreSQL container on port 65432, run migrations, spin up the services, and execute the test runner.
