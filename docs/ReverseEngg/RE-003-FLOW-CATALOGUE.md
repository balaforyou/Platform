# RE-003 Flow Catalogue

## 1. Purpose

This catalogue identifies executable business and operational flows supported by the current Platform repository.

## 2. Discovery Basis

Approved inputs used:

- `RE-001-SOURCE-BASELINE.md`
- `RE-002-CAPABILITY-CATALOGUE.md`

Level A executable evidence was prioritized. Repository content remained read-only. Phase 3 identifies recognizable flows, triggers, outcomes, and participating capabilities; it does not reconstruct internal flow steps, rules, policies, state transitions, authorization behavior, or implementation quality.

## 3. Flow Catalogue

### Identity / Access

## FLOW-001 - Request OTP Login

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-015

**Initiator**

Guest, Member, Admin

**Trigger**

User submits a phone-based login request.

**Outcome**

An OTP login request is accepted or rejected by the identity capability.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /auth/otp/request`
- `apps/guest-member-pwa/src/components/LoginScreen.tsx`
- `apps/admin-web/src/main.tsx` - `LoginScreen`

**Confidence**

CONFIRMED

## FLOW-002 - Verify OTP Login

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-015

**Initiator**

Guest, Member, Admin

**Trigger**

User submits an OTP verification request.

**Outcome**

The identity capability accepts or rejects the login verification.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /auth/otp/verify`
- `services/identity-auth/src/regression/otp-flow.regression.ts`
- `apps/guest-member-pwa/src/components/LoginScreen.tsx`
- `apps/admin-web/src/main.tsx` - `LoginScreen`

**Confidence**

CONFIRMED

## FLOW-003 - Verify Google Login

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001

**Initiator**

Guest, Member, Admin

**Trigger**

User submits a Google verification request.

**Outcome**

The identity capability accepts or rejects the Google login verification.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /auth/google/verify`
- `packages/database/prisma/schema.prisma` - `User`, `AuthSession`

**Confidence**

CONFIRMED

## FLOW-004 - Refresh Session

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-015

**Initiator**

Guest, Member, Admin

**Trigger**

Client requests session refresh.

**Outcome**

The identity capability accepts or rejects refresh of an existing session.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /auth/refresh`
- `services/identity-auth/src/regression/jwt-session.regression.ts`
- `packages/ui-shared/src/context/AuthContext.tsx`

**Confidence**

CONFIRMED

## FLOW-005 - Logout Session

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-015

**Initiator**

Guest, Member, Admin

**Trigger**

User or client submits logout.

**Outcome**

The identity capability accepts or rejects session logout.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /auth/logout`
- `packages/ui-shared/src/context/AuthContext.tsx`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Confidence**

CONFIRMED

## FLOW-006 - Lookup User Identity

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-004

**Initiator**

Admin, Platform

**Trigger**

Admin or platform code requests user identity lookup.

**Outcome**

The identity capability returns or declines user identity information.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `GET /users/lookup`, `GET /users/:id`
- `services/identity-auth/src/regression/admin-phone-lookup.regression.ts`
- `apps/admin-web/src/main.tsx`

**Confidence**

CONFIRMED

## FLOW-007 - Resolve User Invite

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001, CAP-007

**Initiator**

Platform

**Trigger**

Platform submits an invite-resolution request for a user.

**Outcome**

Invite resolution is accepted or rejected by executable identity/booking surfaces.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `POST /users/resolve-invite`
- `services/slot-engine/src/index.ts` - `POST /bookings/resolve-invites`
- `packages/database/prisma/schema.prisma` - `PendingInvite`, `BookingPlayer`

**Confidence**

CONFIRMED

## FLOW-008 - Update User Type

**Primary Capability**

CAP-001

**Participating Capabilities**

CAP-001

**Initiator**

Admin, Platform

**Trigger**

Admin or platform code submits a user type update.

**Outcome**

The identity capability accepts or rejects the user type update.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `PATCH /users/:id/type`
- `packages/database/prisma/schema.prisma` - `User`, `UserType`

**Confidence**

CONFIRMED

## FLOW-009 - Assign Role

**Primary Capability**

CAP-004

**Participating Capabilities**

CAP-004, CAP-002, CAP-003

**Initiator**

Admin

**Trigger**

Admin submits a role assignment request.

**Outcome**

A role assignment request is accepted or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `POST /tenants/:id/roles`
- `services/tenant-management/src/regression/role-scoping.regression.ts`
- `packages/database/prisma/schema.prisma` - `RoleAssignment`

**Confidence**

CONFIRMED

## FLOW-010 - Check Role and Branch Access Context

**Primary Capability**

CAP-004

**Participating Capabilities**

CAP-004, CAP-003

**Initiator**

Admin, Platform

**Trigger**

Client or platform code requests role or branch-access context.

**Outcome**

Role/access context is returned or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `GET /users/:id/roles`, `GET /users/:userId/branches/:branchId/check`
- `services/tenant-management/src/regression/role-scoping.regression.ts`
- `apps/admin-web/src/main.tsx`

**Confidence**

CONFIRMED

### Tenant / Branch Administration

## FLOW-011 - Create Tenant

**Primary Capability**

CAP-002

**Participating Capabilities**

CAP-002

**Initiator**

Admin, Platform

**Trigger**

Admin or platform code submits a tenant creation request.

**Outcome**

A tenant creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `POST /tenants`
- `services/tenant-management/src/regression/branch-lifecycle.regression.ts`
- `packages/database/prisma/schema.prisma` - `Tenant`

**Confidence**

CONFIRMED

## FLOW-012 - Update Tenant

**Primary Capability**

CAP-002

**Participating Capabilities**

CAP-002

**Initiator**

Admin

**Trigger**

Admin submits tenant changes.

**Outcome**

A tenant update request is accepted or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `PATCH /tenants/:id`
- `packages/database/prisma/schema.prisma` - `Tenant`

**Confidence**

CONFIRMED

## FLOW-013 - Resolve Tenant Context

**Primary Capability**

CAP-002

**Participating Capabilities**

CAP-002, CAP-015

**Initiator**

Guest, Member, Admin, Platform

**Trigger**

Client requests tenant context by subdomain or runtime context.

**Outcome**

Tenant context is returned or unavailable.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `GET /tenants/by-subdomain/:subdomain`
- `packages/ui-shared/src/context/TenantContext.tsx`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Confidence**

CONFIRMED

## FLOW-014 - Serve Tenant Manifest

**Primary Capability**

CAP-002

**Participating Capabilities**

CAP-002, CAP-017

**Initiator**

Guest, Member, Platform

**Trigger**

Client requests tenant manifest data.

**Outcome**

Tenant manifest data is returned or unavailable.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `GET /tenants/:id/manifest.json`
- `apps/guest-member-pwa/index.html`
- `apps/guest-member-pwa/public/sw.js`

**Confidence**

CONFIRMED

## FLOW-015 - Create Branch

**Primary Capability**

CAP-003

**Participating Capabilities**

CAP-003, CAP-002

**Initiator**

Admin

**Trigger**

Admin submits branch creation request.

**Outcome**

A branch creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `POST /tenants/:id/branches`
- `services/tenant-management/src/regression/branch-lifecycle.regression.ts`
- `packages/database/prisma/schema.prisma` - `Branch`

**Confidence**

CONFIRMED

## FLOW-016 - Update Branch

**Primary Capability**

CAP-003

**Participating Capabilities**

CAP-003, CAP-002

**Initiator**

Admin

**Trigger**

Admin submits branch changes.

**Outcome**

A branch update request is accepted or rejected.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `PATCH /branches/:id`
- `apps/admin-web/src/main.tsx` - branch schedule/configuration usage
- `packages/database/prisma/schema.prisma` - `Branch`

**Confidence**

CONFIRMED

## FLOW-017 - Browse Branches

**Primary Capability**

CAP-003

**Participating Capabilities**

CAP-003, CAP-002

**Initiator**

Guest, Member, Admin

**Trigger**

User requests branch list or selects branch browsing UI.

**Outcome**

Branch list or branch context is returned.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `GET /tenants/:id/branches`
- `apps/guest-member-pwa/src/components/BranchSelect.tsx`
- `apps/admin-web/src/main.tsx`

**Confidence**

CONFIRMED

## FLOW-018 - View Branch About

**Primary Capability**

CAP-003

**Participating Capabilities**

CAP-003, CAP-002

**Initiator**

Guest, Member

**Trigger**

User requests branch descriptive/about information.

**Outcome**

Branch about information is returned or unavailable.

**Executable Entry Evidence**

- `services/tenant-management/src/index.ts` - `GET /branches/:id/about`
- `apps/guest-member-pwa/src/components/BranchAbout.tsx`
- `apps/guest-member-pwa/src/components/BranchDashboard.tsx`

**Confidence**

CONFIRMED

### Resource Administration

## FLOW-019 - Create Resource Pool

**Primary Capability**

CAP-005

**Participating Capabilities**

CAP-005, CAP-003

**Initiator**

Admin

**Trigger**

Admin submits resource pool creation request.

**Outcome**

A resource pool creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /resource-pools`
- `apps/admin-web/src/main.tsx` - `ResourcesPage`
- `packages/database/prisma/schema.prisma` - `ResourcePool`

**Confidence**

CONFIRMED

## FLOW-020 - Update Resource Pool

**Primary Capability**

CAP-005

**Participating Capabilities**

CAP-005

**Initiator**

Admin

**Trigger**

Admin submits resource pool changes.

**Outcome**

A resource pool update request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `PATCH /resource-pools/:id`
- `apps/admin-web/src/main.tsx` - `ResourcesPage`
- `packages/database/prisma/schema.prisma` - `ResourcePool`

**Confidence**

CONFIRMED

## FLOW-021 - Add Resource to Pool

**Primary Capability**

CAP-005

**Participating Capabilities**

CAP-005

**Initiator**

Admin

**Trigger**

Admin submits request to add a resource under a pool.

**Outcome**

A resource creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /resource-pools/:id/resources`
- `packages/database/prisma/schema.prisma` - `Resource`

**Confidence**

CONFIRMED

## FLOW-022 - Browse Branch Resource Pools

**Primary Capability**

CAP-005

**Participating Capabilities**

CAP-005, CAP-003

**Initiator**

Guest, Member, Admin

**Trigger**

User or admin requests resource pools for a branch.

**Outcome**

Resource pools for the branch are returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /branches/:id/resource-pools`
- `apps/guest-member-pwa/src/components/BranchDashboard.tsx`
- `apps/admin-web/src/main.tsx`

**Confidence**

CONFIRMED

### Availability

## FLOW-023 - Create Availability Window

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-005

**Initiator**

Admin

**Trigger**

Admin submits an availability window creation request.

**Outcome**

An availability window creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /resource-pools/:id/availability-windows`
- `packages/database/prisma/schema.prisma` - `AvailabilityWindow`

**Confidence**

CONFIRMED

## FLOW-024 - Browse Availability

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-005, CAP-007

**Initiator**

Guest, Member, Admin

**Trigger**

User or admin requests available options for a resource pool.

**Outcome**

Availability information is returned or unavailable.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /resource-pools/:id/availability`
- `apps/guest-member-pwa/src/components/CourtBooking.tsx`
- `apps/admin-web/src/main.tsx` - availability queries
- `services/slot-engine/src/regression/availability-generation-api.regression.ts`

**Confidence**

CONFIRMED

## FLOW-025 - Manage Availability Patterns

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-005

**Initiator**

Admin

**Trigger**

Admin views or submits recurring availability pattern changes.

**Outcome**

Pattern information is returned, created, updated, or deleted.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET/POST/PATCH/DELETE /resource-pools/:id/availability-patterns`
- `apps/admin-web/src/main.tsx` - `SchedulingPage`
- `packages/database/prisma/schema.prisma` - `AvailabilityPattern`

**Confidence**

CONFIRMED

## FLOW-026 - Manage Availability Overrides

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-005

**Initiator**

Admin

**Trigger**

Admin views or submits availability override changes.

**Outcome**

Override information is returned, created, updated, or deleted.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET/POST/PATCH/DELETE /resource-pools/:id/availability-overrides`
- `apps/admin-web/src/main.tsx` - `SchedulingPage`
- `packages/database/prisma/schema.prisma` - `AvailabilityOverride`

**Confidence**

CONFIRMED

## FLOW-027 - Block Availability Window

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-005

**Initiator**

Admin

**Trigger**

Admin submits blocked-window request.

**Outcome**

A blocked-window request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /blocked-windows`
- `packages/database/prisma/schema.prisma` - `BlockedWindow`

**Confidence**

CONFIRMED

## FLOW-028 - Generate Availability

**Primary Capability**

CAP-006

**Participating Capabilities**

CAP-006, CAP-014

**Initiator**

Platform

**Trigger**

Platform invokes executable availability generation support.

**Outcome**

Availability generation operation produces a platform-level generation result.

**Executable Entry Evidence**

- `services/slot-engine/src/availabilityGeneration.ts`
- `services/slot-engine/src/regression/availability-generation.regression.ts`
- `services/slot-engine/src/regression/availability-generation-api.regression.ts`
- `packages/database/prisma/schema.prisma` - `GenerationLock`

**Confidence**

PARTIALLY_CONFIRMED

### Booking

## FLOW-029 - Create Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-006, CAP-005

**Initiator**

Guest, Member

**Trigger**

User submits a booking request.

**Outcome**

A booking request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings`
- `apps/guest-member-pwa/src/components/CourtBooking.tsx`
- `services/slot-engine/src/regression/guest-booking.regression.ts`
- `packages/database/prisma/schema.prisma` - `Booking`, `BookingPlayer`

**Confidence**

CONFIRMED

## FLOW-030 - Create Negotiated Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-011, CAP-004

**Initiator**

Admin

**Trigger**

Admin submits a negotiated booking request.

**Outcome**

A negotiated booking request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings/negotiated`
- `services/payment/src/index.ts` - `POST /payment-links/negotiated`
- `apps/admin-web/src/main.tsx` - `NegotiatedPage`
- `services/payment/src/regression/negotiated-link.regression.ts`

**Confidence**

CONFIRMED

## FLOW-031 - View Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007

**Initiator**

Guest, Member, Admin

**Trigger**

User or admin requests booking details.

**Outcome**

Booking details are returned or unavailable.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /bookings/:id`
- `apps/guest-member-pwa/src/components/BookingConfirmation.tsx`
- `apps/guest-member-pwa/src/components/BookingPay.tsx`

**Confidence**

CONFIRMED

## FLOW-032 - View My Bookings

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-001

**Initiator**

Guest, Member

**Trigger**

User requests their booking history.

**Outcome**

User booking history is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /bookings/my`
- `apps/guest-member-pwa/src/components/BookingHistory.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Confidence**

CONFIRMED

## FLOW-033 - View Admin Bookings

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-004

**Initiator**

Admin

**Trigger**

Admin requests administrative booking list.

**Outcome**

Administrative booking information is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /bookings/admin`
- `apps/admin-web/src/main.tsx` - `RefundsPage`

**Confidence**

CONFIRMED

## FLOW-034 - Confirm Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007

**Initiator**

Platform, Guest, Member

**Trigger**

Client or platform code submits booking confirmation request.

**Outcome**

A booking confirmation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings/:id/confirm`
- `services/slot-engine/src/regression/guest-booking.regression.ts`

**Confidence**

CONFIRMED

## FLOW-035 - Check In Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007

**Initiator**

Guest, Member, Admin

**Trigger**

User submits booking check-in request.

**Outcome**

A booking check-in request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings/:id/check-in`
- `apps/guest-member-pwa/src/components/BookingHistory.tsx`

**Confidence**

CONFIRMED

## FLOW-036 - Preview Booking Cancellation

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-012

**Initiator**

Guest, Member, Admin

**Trigger**

User or admin requests cancellation preview for a booking.

**Outcome**

Cancellation preview information is returned or unavailable.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /bookings/:id/cancel-preview`
- `apps/guest-member-pwa/src/components/CancelBookingModal.tsx`
- `apps/admin-web/src/main.tsx` - `RefundsPage`

**Confidence**

CONFIRMED

## FLOW-037 - Cancel Booking

**Primary Capability**

CAP-007

**Participating Capabilities**

CAP-007, CAP-012

**Initiator**

Guest, Member, Admin

**Trigger**

User or admin submits booking cancellation request.

**Outcome**

A booking cancellation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings/:id/cancel`
- `apps/guest-member-pwa/src/components/CancelBookingModal.tsx`
- `apps/guest-member-pwa/src/components/BookingHistory.tsx`

**Confidence**

CONFIRMED

### Booking Rules

## FLOW-038 - Create Booking Rule

**Primary Capability**

CAP-008

**Participating Capabilities**

CAP-008, CAP-005

**Initiator**

Admin

**Trigger**

Admin submits booking rule creation request.

**Outcome**

A booking rule creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /booking-rules`
- `packages/database/prisma/schema.prisma` - `BookingRule`

**Confidence**

CONFIRMED

## FLOW-039 - Update Resource Pool Booking Rule

**Primary Capability**

CAP-008

**Participating Capabilities**

CAP-008, CAP-005

**Initiator**

Admin

**Trigger**

Admin submits booking rule changes for a resource pool.

**Outcome**

A booking rule update request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `PUT /resource-pools/:id/booking-rule`
- `apps/admin-web/src/main.tsx` - `ResourcesPage`
- `packages/database/prisma/schema.prisma` - `BookingRule`

**Confidence**

CONFIRMED

### Member Operations

## FLOW-040 - Assign Member to Resource Group

**Primary Capability**

CAP-009

**Participating Capabilities**

CAP-009, CAP-005

**Initiator**

Admin

**Trigger**

Admin submits a member group assignment request.

**Outcome**

A member assignment request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /member-group-assignments`
- `apps/admin-web/src/main.tsx` - `AssignmentsPage`
- `packages/database/prisma/schema.prisma` - `MemberGroupAssignment`

**Confidence**

CONFIRMED

## FLOW-041 - View Member Assignments

**Primary Capability**

CAP-009

**Participating Capabilities**

CAP-009, CAP-005

**Initiator**

Admin

**Trigger**

Admin requests member group assignments.

**Outcome**

Member assignment information is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /member-group-assignments`
- `apps/admin-web/src/main.tsx` - `AssignmentsPage`

**Confidence**

CONFIRMED

## FLOW-042 - Update Member Assignment

**Primary Capability**

CAP-009

**Participating Capabilities**

CAP-009

**Initiator**

Admin

**Trigger**

Admin submits member assignment changes.

**Outcome**

A member assignment update request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `PATCH /member-group-assignments/:id`
- `apps/admin-web/src/main.tsx` - `AssignmentsPage`

**Confidence**

CONFIRMED

## FLOW-043 - View Today Member Assignment

**Primary Capability**

CAP-009

**Participating Capabilities**

CAP-009, CAP-007

**Initiator**

Member

**Trigger**

Member requests today's assignment view.

**Outcome**

Today assignment information is returned or unavailable.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /member/today-assignment`
- `apps/guest-member-pwa/src/main.tsx` - `MainDashboard`
- `services/slot-engine/src/regression/member-flow.regression.ts`

**Confidence**

CONFIRMED

## FLOW-044 - Confirm Today Member Assignment

**Primary Capability**

CAP-009

**Participating Capabilities**

CAP-009, CAP-007

**Initiator**

Member

**Trigger**

Member submits today's assignment confirmation.

**Outcome**

The member assignment confirmation request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /member/today-assignment/confirm`
- `apps/guest-member-pwa/src/main.tsx` - `MainDashboard`
- `apps/guest-member-pwa/tests/member-self-confirm.spec.ts`

**Confidence**

CONFIRMED

### Attendance / Occupancy

## FLOW-045 - View Guest Occupancy

**Primary Capability**

CAP-010

**Participating Capabilities**

CAP-010, CAP-003, CAP-007

**Initiator**

Admin

**Trigger**

Admin requests branch guest occupancy information.

**Outcome**

Guest occupancy information is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /branches/:id/guest-occupancy`
- `apps/admin-web/src/main.tsx` - `OccupancyPage`

**Confidence**

CONFIRMED

## FLOW-046 - View Member Attendance

**Primary Capability**

CAP-010

**Participating Capabilities**

CAP-010, CAP-009, CAP-003

**Initiator**

Admin

**Trigger**

Admin requests branch member attendance information.

**Outcome**

Member attendance information is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /branches/:id/member-attendance`
- `apps/admin-web/src/main.tsx` - `OccupancyPage`

**Confidence**

CONFIRMED

## FLOW-047 - View Resource Pool Occupancy

**Primary Capability**

CAP-010

**Participating Capabilities**

CAP-010, CAP-005

**Initiator**

Admin

**Trigger**

Admin requests occupancy information for a resource pool.

**Outcome**

Resource pool occupancy information is returned.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `GET /resource-pools/:id/occupancy`
- `apps/admin-web/src/main.tsx` - `OccupancyPage`

**Confidence**

CONFIRMED

## FLOW-048 - Release Capacity

**Primary Capability**

CAP-010

**Participating Capabilities**

CAP-010, CAP-006, CAP-007

**Initiator**

Admin

**Trigger**

Admin submits a capacity release request for a resource pool window.

**Outcome**

The release request is accepted or rejected.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /resource-pools/:id/windows/:windowId/release`
- `apps/admin-web/src/main.tsx` - `OccupancyPage`
- `services/slot-engine/src/regression/low-occupancy-release.regression.ts`

**Confidence**

CONFIRMED

## FLOW-049 - Run Booking Sweep

**Primary Capability**

CAP-010

**Participating Capabilities**

CAP-010, CAP-007, CAP-009, CAP-013, CAP-014

**Initiator**

Platform, Scheduler

**Trigger**

Platform invokes booking sweep operation.

**Outcome**

Sweep operation returns an operational result.

**Executable Entry Evidence**

- `services/slot-engine/src/index.ts` - `POST /bookings/sweep`
- `services/slot-engine/src/regression/low-occupancy-release.regression.ts`
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts`

**Confidence**

CONFIRMED

### Payment

## FLOW-050 - Create Payment Intent

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011

**Initiator**

Guest, Member, Admin, Platform

**Trigger**

Client or platform code submits payment intent request.

**Outcome**

A payment intent request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payments/intents`, `POST /intents`
- `packages/database/prisma/schema.prisma` - `PaymentIntent`

**Confidence**

CONFIRMED

## FLOW-051 - Create Payment Order

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-007

**Initiator**

Guest, Member, Platform

**Trigger**

Client submits payment order creation request.

**Outcome**

A payment order request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payments/create-order`, `POST /create-order`
- `apps/guest-member-pwa/src/components/BookingPay.tsx`
- `services/payment/src/regression/price-integrity.regression.ts`

**Confidence**

CONFIRMED

## FLOW-052 - Verify Payment

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-007

**Initiator**

Guest, Member, Platform

**Trigger**

Client submits payment verification request.

**Outcome**

Payment verification is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payments/verify-payment`, `POST /verify-payment`
- `apps/guest-member-pwa/src/components/BookingPay.tsx`

**Confidence**

CONFIRMED

## FLOW-053 - Create Subscription

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011

**Initiator**

Member, Admin, Platform

**Trigger**

Client or platform code submits subscription creation request.

**Outcome**

A subscription creation request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /subscriptions`
- `packages/database/prisma/schema.prisma` - `Subscription`

**Confidence**

CONFIRMED

## FLOW-054 - Process Razorpay Payment Webhook

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-007, CAP-013

**Initiator**

External Payment Provider

**Trigger**

External payment provider sends payment webhook.

**Outcome**

Webhook ingestion is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /webhooks/razorpay`
- `services/payment/src/regression/webhook-signature-and-idempotency.regression.ts`
- `packages/database/prisma/schema.prisma` - `WebhookEvent`

**Confidence**

CONFIRMED

## FLOW-055 - Process Razorpay Autopay Webhook

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-013

**Initiator**

External Payment Provider

**Trigger**

External payment provider sends autopay webhook.

**Outcome**

Autopay webhook ingestion is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /webhooks/razorpay/autopay`
- `services/payment/src/regression/autopay-and-refund.regression.ts`

**Confidence**

CONFIRMED

## FLOW-056 - Create Payment Link

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011

**Initiator**

Admin, Platform

**Trigger**

Admin or platform code submits payment-link creation request.

**Outcome**

A payment-link request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payment-links`
- `packages/database/prisma/schema.prisma` - `PaymentIntent`

**Confidence**

CONFIRMED

## FLOW-057 - Create Negotiated Payment Link

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-007

**Initiator**

Admin

**Trigger**

Admin submits negotiated payment-link request.

**Outcome**

A negotiated payment-link request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payment-links/negotiated`
- `apps/admin-web/src/main.tsx` - `NegotiatedPage`
- `services/payment/src/regression/negotiated-link.regression.ts`

**Confidence**

CONFIRMED

## FLOW-058 - Simulate Payment Capture

**Primary Capability**

CAP-011

**Participating Capabilities**

CAP-011, CAP-007

**Initiator**

Platform

**Trigger**

Test or platform client submits simulated capture request.

**Outcome**

Simulated capture request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /payments/test/simulate-capture`
- `apps/guest-member-pwa/src/components/BookingPay.tsx`

**Confidence**

PARTIALLY_CONFIRMED

### Refund

## FLOW-059 - Create Refund

**Primary Capability**

CAP-012

**Participating Capabilities**

CAP-012, CAP-011

**Initiator**

Admin, Platform

**Trigger**

Client or platform code submits refund request.

**Outcome**

A refund request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /refunds`
- `services/payment/src/regression/autopay-and-refund.regression.ts`
- `packages/database/prisma/schema.prisma` - `Refund`

**Confidence**

CONFIRMED

## FLOW-060 - Override Refund

**Primary Capability**

CAP-012

**Participating Capabilities**

CAP-012, CAP-011, CAP-004

**Initiator**

Admin

**Trigger**

Admin submits refund override request.

**Outcome**

A refund override request is accepted or rejected.

**Executable Entry Evidence**

- `services/payment/src/index.ts` - `POST /refunds/override`
- `apps/admin-web/src/main.tsx` - `RefundsPage`
- `services/payment/src/regression/autopay-and-refund.regression.ts`

**Confidence**

CONFIRMED

### Notification

## FLOW-061 - Send Notification

**Primary Capability**

CAP-013

**Participating Capabilities**

CAP-013

**Initiator**

Platform, Admin

**Trigger**

Client or platform service submits notification send request.

**Outcome**

Notification send request is accepted or rejected.

**Executable Entry Evidence**

- `services/notification/src/index.ts` - `POST /notifications/send`
- `services/notification/src/regression/dispatch-and-routing.regression.ts`
- `packages/database/prisma/schema.prisma` - `NotificationRequest`

**Confidence**

CONFIRMED

## FLOW-062 - Manage Notification Template

**Primary Capability**

CAP-013

**Participating Capabilities**

CAP-013

**Initiator**

Admin, Platform

**Trigger**

Client or platform service submits notification template request.

**Outcome**

Template request is accepted or rejected.

**Executable Entry Evidence**

- `services/notification/src/index.ts` - `POST /notifications/templates`
- `packages/database/prisma/schema.prisma` - `NotificationTemplate`

**Confidence**

CONFIRMED

## FLOW-063 - Register Device Token

**Primary Capability**

CAP-013

**Participating Capabilities**

CAP-013, CAP-001

**Initiator**

Guest, Member

**Trigger**

Client submits device registration request.

**Outcome**

Device token registration is accepted or rejected.

**Executable Entry Evidence**

- `services/notification/src/index.ts` - `POST /devices/register`
- `services/notification/src/regression/dispatch-and-routing.regression.ts`
- `services/notification/src/regression/cross-service-e2e.regression.ts`
- `packages/database/prisma/schema.prisma` - `DeviceToken`

**Confidence**

CONFIRMED

## FLOW-064 - View Notification History

**Primary Capability**

CAP-013

**Participating Capabilities**

CAP-013

**Initiator**

Guest, Member, Admin

**Trigger**

Client requests notification history for a user.

**Outcome**

Notification history is returned.

**Executable Entry Evidence**

- `services/notification/src/index.ts` - `GET /notifications/:userId/history`
- `packages/database/prisma/schema.prisma` - `NotificationRequest`

**Confidence**

CONFIRMED

## FLOW-065 - Process Notification Queue

**Primary Capability**

CAP-013

**Participating Capabilities**

CAP-013, CAP-014

**Initiator**

Platform, Scheduler

**Trigger**

Platform invokes notification queue processing.

**Outcome**

Queue processing operation returns an operational result.

**Executable Entry Evidence**

- `services/notification/src/queue.ts` - `processQueue`
- `services/notification/src/index.ts` - startup interval invoking `processQueue`
- `services/notification/src/regression/retry-and-dead-letter.regression.ts`
- `services/notification/src/regression/dispatch-and-routing.regression.ts`

**Confidence**

CONFIRMED

### Scheduled Operations

## FLOW-066 - Run Due Scheduled Jobs

**Primary Capability**

CAP-014

**Participating Capabilities**

CAP-014

**Initiator**

Scheduler

**Trigger**

Scheduler runtime is asked to run due jobs.

**Outcome**

Due-job run summaries are produced.

**Executable Entry Evidence**

- `packages/job-scheduler/src/runtime.ts` - `runDueJobsOnce`
- `packages/job-scheduler/src/types.ts`
- `packages/job-scheduler/tests/phaseA.test.ts`

**Confidence**

CONFIRMED

## FLOW-067 - Run Scheduled Job Manually

**Primary Capability**

CAP-014

**Participating Capabilities**

CAP-014

**Initiator**

Platform

**Trigger**

Platform requests a named job to run immediately.

**Outcome**

Manual job run summary is produced.

**Executable Entry Evidence**

- `packages/job-scheduler/src/runtime.ts` - `runJobNow`
- `packages/job-scheduler/src/types.ts`
- `packages/job-scheduler/tests/phaseA.test.ts`

**Confidence**

CONFIRMED

## FLOW-068 - Claim Scheduled Dispatch

**Primary Capability**

CAP-014

**Participating Capabilities**

CAP-014

**Initiator**

Platform, Scheduler

**Trigger**

Job handler requests dispatch claiming.

**Outcome**

Dispatch claim is accepted or rejected.

**Executable Entry Evidence**

- `packages/job-scheduler/src/sqlStore.ts` - `claimDispatch`
- `packages/job-scheduler/src/runtime.ts` - bound store `claimDispatch`
- `packages/job-scheduler/tests/phaseA.test.ts`
- `packages/database/prisma/schema.prisma` - `ScheduledJobDispatch`

**Confidence**

CONFIRMED

## FLOW-069 - Mark Scheduled Dispatch Outcome

**Primary Capability**

CAP-014

**Participating Capabilities**

CAP-014

**Initiator**

Platform, Scheduler

**Trigger**

Job handler records dispatch result.

**Outcome**

Dispatch outcome record request is accepted or rejected.

**Executable Entry Evidence**

- `packages/job-scheduler/src/sqlStore.ts` - `markDispatched`, `failDispatch`
- `packages/job-scheduler/tests/phaseA.test.ts`
- `packages/database/prisma/schema.prisma` - `ScheduledJobDispatch`

**Confidence**

CONFIRMED

## FLOW-070 - Verify Service Health

**Primary Capability**

CAP-014

**Participating Capabilities**

CAP-001, CAP-002, CAP-005, CAP-011, CAP-013, CAP-016

**Initiator**

Platform

**Trigger**

Platform or operator requests service health.

**Outcome**

Service health result is returned.

**Executable Entry Evidence**

- `services/identity-auth/src/index.ts` - `GET /health`
- `services/tenant-management/src/index.ts` - `GET /health`
- `services/slot-engine/src/index.ts` - `GET /health`
- `services/payment/src/index.ts` - `GET /health`
- `services/notification/src/index.ts` - `GET /health`
- `scripts/verify-deployment.mjs`

**Confidence**

CONFIRMED

## 4. Flow Summary

| Flow ID | Flow | Primary Capability | Initiator | Confidence |
| ------- | ---- | ------------------ | --------- | ---------- |
| FLOW-001 | Request OTP Login | CAP-001 | Guest, Member, Admin | CONFIRMED |
| FLOW-002 | Verify OTP Login | CAP-001 | Guest, Member, Admin | CONFIRMED |
| FLOW-003 | Verify Google Login | CAP-001 | Guest, Member, Admin | CONFIRMED |
| FLOW-004 | Refresh Session | CAP-001 | Guest, Member, Admin | CONFIRMED |
| FLOW-005 | Logout Session | CAP-001 | Guest, Member, Admin | CONFIRMED |
| FLOW-006 | Lookup User Identity | CAP-001 | Admin, Platform | CONFIRMED |
| FLOW-007 | Resolve User Invite | CAP-001 | Platform | CONFIRMED |
| FLOW-008 | Update User Type | CAP-001 | Admin, Platform | CONFIRMED |
| FLOW-009 | Assign Role | CAP-004 | Admin | CONFIRMED |
| FLOW-010 | Check Role and Branch Access Context | CAP-004 | Admin, Platform | CONFIRMED |
| FLOW-011 | Create Tenant | CAP-002 | Admin, Platform | CONFIRMED |
| FLOW-012 | Update Tenant | CAP-002 | Admin | CONFIRMED |
| FLOW-013 | Resolve Tenant Context | CAP-002 | Guest, Member, Admin, Platform | CONFIRMED |
| FLOW-014 | Serve Tenant Manifest | CAP-002 | Guest, Member, Platform | CONFIRMED |
| FLOW-015 | Create Branch | CAP-003 | Admin | CONFIRMED |
| FLOW-016 | Update Branch | CAP-003 | Admin | CONFIRMED |
| FLOW-017 | Browse Branches | CAP-003 | Guest, Member, Admin | CONFIRMED |
| FLOW-018 | View Branch About | CAP-003 | Guest, Member | CONFIRMED |
| FLOW-019 | Create Resource Pool | CAP-005 | Admin | CONFIRMED |
| FLOW-020 | Update Resource Pool | CAP-005 | Admin | CONFIRMED |
| FLOW-021 | Add Resource to Pool | CAP-005 | Admin | CONFIRMED |
| FLOW-022 | Browse Branch Resource Pools | CAP-005 | Guest, Member, Admin | CONFIRMED |
| FLOW-023 | Create Availability Window | CAP-006 | Admin | CONFIRMED |
| FLOW-024 | Browse Availability | CAP-006 | Guest, Member, Admin | CONFIRMED |
| FLOW-025 | Manage Availability Patterns | CAP-006 | Admin | CONFIRMED |
| FLOW-026 | Manage Availability Overrides | CAP-006 | Admin | CONFIRMED |
| FLOW-027 | Block Availability Window | CAP-006 | Admin | CONFIRMED |
| FLOW-028 | Generate Availability | CAP-006 | Platform | PARTIALLY_CONFIRMED |
| FLOW-029 | Create Booking | CAP-007 | Guest, Member | CONFIRMED |
| FLOW-030 | Create Negotiated Booking | CAP-007 | Admin | CONFIRMED |
| FLOW-031 | View Booking | CAP-007 | Guest, Member, Admin | CONFIRMED |
| FLOW-032 | View My Bookings | CAP-007 | Guest, Member | CONFIRMED |
| FLOW-033 | View Admin Bookings | CAP-007 | Admin | CONFIRMED |
| FLOW-034 | Confirm Booking | CAP-007 | Platform, Guest, Member | CONFIRMED |
| FLOW-035 | Check In Booking | CAP-007 | Guest, Member, Admin | CONFIRMED |
| FLOW-036 | Preview Booking Cancellation | CAP-007 | Guest, Member, Admin | CONFIRMED |
| FLOW-037 | Cancel Booking | CAP-007 | Guest, Member, Admin | CONFIRMED |
| FLOW-038 | Create Booking Rule | CAP-008 | Admin | CONFIRMED |
| FLOW-039 | Update Resource Pool Booking Rule | CAP-008 | Admin | CONFIRMED |
| FLOW-040 | Assign Member to Resource Group | CAP-009 | Admin | CONFIRMED |
| FLOW-041 | View Member Assignments | CAP-009 | Admin | CONFIRMED |
| FLOW-042 | Update Member Assignment | CAP-009 | Admin | CONFIRMED |
| FLOW-043 | View Today Member Assignment | CAP-009 | Member | CONFIRMED |
| FLOW-044 | Confirm Today Member Assignment | CAP-009 | Member | CONFIRMED |
| FLOW-045 | View Guest Occupancy | CAP-010 | Admin | CONFIRMED |
| FLOW-046 | View Member Attendance | CAP-010 | Admin | CONFIRMED |
| FLOW-047 | View Resource Pool Occupancy | CAP-010 | Admin | CONFIRMED |
| FLOW-048 | Release Capacity | CAP-010 | Admin | CONFIRMED |
| FLOW-049 | Run Booking Sweep | CAP-010 | Platform, Scheduler | CONFIRMED |
| FLOW-050 | Create Payment Intent | CAP-011 | Guest, Member, Admin, Platform | CONFIRMED |
| FLOW-051 | Create Payment Order | CAP-011 | Guest, Member, Platform | CONFIRMED |
| FLOW-052 | Verify Payment | CAP-011 | Guest, Member, Platform | CONFIRMED |
| FLOW-053 | Create Subscription | CAP-011 | Member, Admin, Platform | CONFIRMED |
| FLOW-054 | Process Razorpay Payment Webhook | CAP-011 | External Payment Provider | CONFIRMED |
| FLOW-055 | Process Razorpay Autopay Webhook | CAP-011 | External Payment Provider | CONFIRMED |
| FLOW-056 | Create Payment Link | CAP-011 | Admin, Platform | CONFIRMED |
| FLOW-057 | Create Negotiated Payment Link | CAP-011 | Admin | CONFIRMED |
| FLOW-058 | Simulate Payment Capture | CAP-011 | Platform | PARTIALLY_CONFIRMED |
| FLOW-059 | Create Refund | CAP-012 | Admin, Platform | CONFIRMED |
| FLOW-060 | Override Refund | CAP-012 | Admin | CONFIRMED |
| FLOW-061 | Send Notification | CAP-013 | Platform, Admin | CONFIRMED |
| FLOW-062 | Manage Notification Template | CAP-013 | Admin, Platform | CONFIRMED |
| FLOW-063 | Register Device Token | CAP-013 | Guest, Member | CONFIRMED |
| FLOW-064 | View Notification History | CAP-013 | Guest, Member, Admin | CONFIRMED |
| FLOW-065 | Process Notification Queue | CAP-013 | Platform, Scheduler | CONFIRMED |
| FLOW-066 | Run Due Scheduled Jobs | CAP-014 | Scheduler | CONFIRMED |
| FLOW-067 | Run Scheduled Job Manually | CAP-014 | Platform | CONFIRMED |
| FLOW-068 | Claim Scheduled Dispatch | CAP-014 | Platform, Scheduler | CONFIRMED |
| FLOW-069 | Mark Scheduled Dispatch Outcome | CAP-014 | Platform, Scheduler | CONFIRMED |
| FLOW-070 | Verify Service Health | CAP-014 | Platform | CONFIRMED |

## 5. Capability-to-Flow Coverage

| Capability | Confirmed Flows | Partially Confirmed Flows |
| ---------- | --------------: | ------------------------: |
| CAP-001 Identity & Authentication | 8 | 0 |
| CAP-002 Tenant & White-Label Management | 4 | 0 |
| CAP-003 Branch Management | 4 | 0 |
| CAP-004 Role & Administrative Access Context | 2 | 0 |
| CAP-005 Resource Management | 4 | 0 |
| CAP-006 Availability & Scheduling Management | 5 | 1 |
| CAP-007 Booking Management | 9 | 0 |
| CAP-008 Booking Rule Configuration | 2 | 0 |
| CAP-009 Member Assignment & Attendance | 5 | 0 |
| CAP-010 Occupancy Monitoring & Capacity Release | 5 | 0 |
| CAP-011 Payment Intent, Order & Capture Management | 7 | 1 |
| CAP-012 Refund Management | 2 | 0 |
| CAP-013 Notification Dispatch & Device Registration | 5 | 0 |
| CAP-014 Scheduled Job & Dispatch Coordination | 5 | 0 |

Capabilities covered: 14/14.

## 6. Flow Discovery Uncertainties

FLOW-DISCOVERY-UNCERTAINTY-001

Capabilities involved:
CAP-006, CAP-014

Executable evidence:
`services/slot-engine/src/availabilityGeneration.ts`, `packages/job-scheduler/src/runtime.ts`, `packages/database/prisma/schema.prisma`

Observation:
Availability generation is executable, and scheduled-job infrastructure is executable, but the inspected entry evidence does not establish a single explicit scheduled availability-generation flow boundary.

Reason unresolved:
Resolving this would require deeper implementation tracing or historical intent analysis outside Phase 3.

Disposition:
DEFERRED

FLOW-DISCOVERY-UNCERTAINTY-002

Capabilities involved:
CAP-007, CAP-011, CAP-012

Executable evidence:
`services/slot-engine/src/index.ts`, `services/payment/src/index.ts`, `apps/guest-member-pwa/src/components/BookingPay.tsx`, `apps/admin-web/src/main.tsx`

Observation:
Booking, payment, cancellation preview, cancellation, and refund surfaces clearly overlap, but Phase 3 does not determine the exact lifecycle or ownership boundary between these flows.

Reason unresolved:
Resolving this requires individual flow reconstruction, policy extraction, and state analysis outside Phase 3.

Disposition:
DEFERRED

FLOW-DISCOVERY-UNCERTAINTY-003

Capabilities involved:
CAP-009, CAP-010, CAP-013, CAP-014

Executable evidence:
`services/slot-engine/src/index.ts`, `services/notification/src/index.ts`, `services/notification/src/queue.ts`, `packages/job-scheduler/src/runtime.ts`

Observation:
Member attendance, occupancy monitoring, notification dispatch, and scheduling/dispatch coordination participate in operational flows, but Phase 3 does not resolve the internal sequencing or operational ownership.

Reason unresolved:
Resolving this requires Phase 4+ reconstruction and later event/policy analysis.

Disposition:
DEFERRED

FLOW-DISCOVERY-UNCERTAINTY-004

Capabilities involved:
CAP-001, CAP-004, CAP-015

Executable evidence:
`services/identity-auth/src/index.ts`, `services/tenant-management/src/index.ts`, `packages/shared-middleware/src/index.ts`, `apps/admin-web/src/main.tsx`

Observation:
Identity, role/access context, and shared middleware all support access-related executable flows, but Phase 3 does not determine authorization rules or permission boundaries.

Reason unresolved:
Authorization analysis is explicitly prohibited in Phase 3.

Disposition:
DEFERRED

FLOW-DISCOVERY-UNCERTAINTY-005

Capabilities involved:
CAP-011

Executable evidence:
`services/payment/src/index.ts` - `POST /payments/test/simulate-capture`

Observation:
Simulated payment capture is executable and used by current UI/test-oriented surfaces, but its production business-flow status is unclear from Phase 3 entry evidence alone.

Reason unresolved:
Resolving this would require behavioural and operational intent analysis outside Phase 3.

Disposition:
DEFERRED

## 7. Unconfirmed Flow Candidates

## UFLOW-001 - Tournament Flow

Suggested by:
`docs/tournament_module_api_spec.md`

Reason not confirmed:
No Level A executable entry point for tournament capability or tournament flow was identified in the inspected current repository evidence.

## UFLOW-002 - Student Training Flow

Suggested by:
Business discovery documentation referenced in Phase 1.

Reason not confirmed:
No distinct Level A executable entry point for student training flow was identified in the inspected current repository evidence.

## UFLOW-003 - Driver Rental Flow

Suggested by:
`docs/driver_rental_app_discovery_brief.md`

Reason not confirmed:
No Level A executable entry point for driver rental flow was identified, and Phase 1 classified the document relationship as unclear.

## 8. Phase 3 Readiness Decision

READY FOR PHASE 4 WITH FLOW UNCERTAINTIES

Flow-discovery-related reason:

The current executable repository provides identifiable Level A entry evidence for flows across all Phase 2 business/operational capabilities CAP-001 through CAP-014. Remaining uncertainties concern flow boundaries, production/test intent, and cross-capability ownership, all of which require later individual flow reconstruction or policy/state analysis.

