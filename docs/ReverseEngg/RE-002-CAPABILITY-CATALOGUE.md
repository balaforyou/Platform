# RE-002 Capability Catalogue

## 1. Purpose

This catalogue identifies business and platform capabilities demonstrably supported by the current executable Platform repository.

## 2. Discovery Basis

Phase 1 baseline used: `RE-001-SOURCE-BASELINE.md`.

Evidence hierarchy followed:

- Level A executable current evidence was primary.
- Level B verification evidence was used only for support/orientation.
- Level C and D evidence was not used to confirm current capability existence.

The repository was treated as read-only. No tests, migrations, formatters, autofixes, or code changes were run.

## 3. Capability Catalogue

### CAP-001 - Identity & Authentication

**Purpose**

Provides user identity lookup, login/session handling, token refresh/logout, invite resolution, and user type maintenance.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/identity-auth/src/index.ts`
- `services/identity-auth/src/regression`
- `packages/database/prisma/schema.prisma`
- `packages/shared-middleware/src/index.ts`
- `packages/ui-shared/src/context/AuthContext.tsx`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Participating Areas**

Identity Auth Service, Database, Shared Middleware, UI Shared, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes platform identity records, authentication/session endpoints, shared auth context, and frontend route protection at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-002 - Tenant & White-Label Management

**Purpose**

Provides tenant-level platform identity, branding, manifest, and tenant lookup/maintenance capability.

**Primary Actors**

Admin, Platform

**Executable Evidence**

- `services/tenant-management/src/index.ts`
- `services/tenant-management/src/regression`
- `packages/database/prisma/schema.prisma`
- `packages/ui-shared/src/context/TenantContext.tsx`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Participating Areas**

Tenant Management Service, Database, UI Shared, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes tenant records, tenant lookup, branding/manifest delivery, and tenant context consumption.

**Evidence Confidence**

CONFIRMED

### CAP-003 - Branch Management

**Purpose**

Provides branch-level setup, maintenance, branch listing, branch presentation, and branch access context.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/tenant-management/src/index.ts`
- `services/tenant-management/src/regression`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/components/BranchSelect.tsx`
- `apps/guest-member-pwa/src/components/BranchDashboard.tsx`
- `apps/guest-member-pwa/src/components/BranchAbout.tsx`

**Participating Areas**

Tenant Management Service, Database, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes branch records, branch configuration surfaces, branch selection, and branch-facing descriptive content.

**Evidence Confidence**

CONFIRMED

### CAP-004 - Role & Administrative Access Context

**Purpose**

Provides role assignment and role/branch access context used by administrative surfaces.

**Primary Actors**

Admin, Platform

**Executable Evidence**

- `services/tenant-management/src/index.ts`
- `services/tenant-management/src/regression/role-scoping.regression.ts`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Tenant Management Service, Database, Admin Web

**Capability Boundary**

Includes role assignment records and executable role/access-context endpoints at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-005 - Resource Management

**Purpose**

Provides management and exposure of bookable resource pools and individual resources.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/regression`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/components/BranchDashboard.tsx`
- `apps/guest-member-pwa/src/components/CourtBooking.tsx`

**Participating Areas**

Slot Engine, Database, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes resource pool/resource records and their administrative and consumer-facing executable surfaces.

**Evidence Confidence**

CONFIRMED

### CAP-006 - Availability & Scheduling Management

**Purpose**

Provides availability windows, recurring availability patterns, overrides, blocked windows, and availability lookup/generation surfaces.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/availabilityGeneration.ts`
- `services/slot-engine/src/branchTime.ts`
- `services/slot-engine/src/regression/availability-generation.regression.ts`
- `services/slot-engine/src/regression/availability-generation-api.regression.ts`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/components/CourtBooking.tsx`

**Participating Areas**

Slot Engine, Database, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes executable availability definition, availability modification, generated availability support, and availability lookup.

**Evidence Confidence**

CONFIRMED

### CAP-007 - Booking Management

**Purpose**

Provides creation, retrieval, confirmation/check-in/cancellation, administrative viewing, invite resolution, and booking-history capability.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/regression`
- `packages/database/prisma/schema.prisma`
- `apps/guest-member-pwa/src/components/CourtBooking.tsx`
- `apps/guest-member-pwa/src/components/BookingHistory.tsx`
- `apps/guest-member-pwa/src/components/BookingConfirmation.tsx`
- `apps/guest-member-pwa/src/components/CancelBookingModal.tsx`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Slot Engine, Database, Guest/Member PWA, Admin Web

**Capability Boundary**

Includes booking records, booking-facing API surfaces, booking UI surfaces, and booking administrative visibility at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-008 - Booking Rule Configuration

**Purpose**

Provides executable configuration surfaces and persistence for booking rule records attached to resource pools.

**Primary Actors**

Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/regression`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Slot Engine, Database, Admin Web

**Capability Boundary**

Includes booking rule persistence and administrative configuration surfaces without interpreting individual rule contents.

**Evidence Confidence**

CONFIRMED

### CAP-009 - Member Assignment & Attendance

**Purpose**

Provides member group assignment management and member attendance-facing capability.

**Primary Actors**

Member, Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/regression/member-flow.regression.ts`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`

**Participating Areas**

Slot Engine, Database, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes member assignment records, administrative assignment surfaces, and member attendance interaction surfaces at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-010 - Occupancy Monitoring & Capacity Release

**Purpose**

Provides occupancy visibility and executable capacity release/monitoring surfaces.

**Primary Actors**

Admin, Platform

**Executable Evidence**

- `services/slot-engine/src/index.ts`
- `services/slot-engine/src/regression/low-occupancy-release.regression.ts`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Slot Engine, Database, Admin Web

**Capability Boundary**

Includes occupancy summary/read models and administrative release surfaces without extracting thresholds, policies, or sweep behavior.

**Evidence Confidence**

CONFIRMED

### CAP-011 - Payment Intent, Order & Capture Management

**Purpose**

Provides payment intent/order creation, payment verification/capture, payment link creation, subscription entrypoints, and provider webhook ingestion.

**Primary Actors**

Guest, Member, Admin, Platform, External payment provider

**Executable Evidence**

- `services/payment/src/index.ts`
- `services/payment/src/regression`
- `packages/database/prisma/schema.prisma`
- `apps/guest-member-pwa/src/components/BookingPay.tsx`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Payment Service, Database, Guest/Member PWA, Admin Web

**Capability Boundary**

Includes executable payment service surfaces and persisted payment/subscription/webhook records at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-012 - Refund Management

**Purpose**

Provides refund creation and administrative refund override surfaces.

**Primary Actors**

Admin, Platform, External payment provider

**Executable Evidence**

- `services/payment/src/index.ts`
- `services/payment/src/regression/autopay-and-refund.regression.ts`
- `services/payment/src/regression/price-integrity.regression.ts`
- `packages/database/prisma/schema.prisma`
- `apps/admin-web/src/main.tsx`

**Participating Areas**

Payment Service, Database, Admin Web

**Capability Boundary**

Includes persisted refund records and executable refund service/admin surfaces without analyzing refund policy.

**Evidence Confidence**

CONFIRMED

### CAP-013 - Notification Dispatch & Device Registration

**Purpose**

Provides notification request, template, dispatch, history, and device token registration capability.

**Primary Actors**

Guest, Member, Admin, Platform

**Executable Evidence**

- `services/notification/src/index.ts`
- `services/notification/src/queue.ts`
- `services/notification/src/regression`
- `packages/database/prisma/schema.prisma`
- `services/payment/src/index.ts`
- `services/slot-engine/src/index.ts`

**Participating Areas**

Notification Service, Payment Service, Slot Engine, Database

**Capability Boundary**

Includes notification persistence, template/device-token surfaces, dispatch queue processing, and service-level notification integration points.

**Evidence Confidence**

CONFIRMED

### CAP-014 - Scheduled Job & Dispatch Coordination

**Purpose**

Provides shared scheduled job runtime, job claiming, dispatch coordination, and persisted job/dispatch records.

**Primary Actors**

Platform

**Executable Evidence**

- `packages/job-scheduler/src/runtime.ts`
- `packages/job-scheduler/src/sqlStore.ts`
- `packages/job-scheduler/src/sql.ts`
- `packages/job-scheduler/src/types.ts`
- `packages/job-scheduler/tests/phaseA.test.ts`
- `packages/database/prisma/schema.prisma`
- `services/slot-engine/src/index.ts`

**Participating Areas**

Job Scheduler, Database, Slot Engine

**Capability Boundary**

Includes shared platform scheduling and dispatch coordination infrastructure at capability level.

**Evidence Confidence**

CONFIRMED

### CAP-015 - Shared Platform API/UI Infrastructure

**Purpose**

Provides shared API client/context, middleware/envelope behavior, shared types, and test harness support used by executable platform areas.

**Primary Actors**

Platform

**Executable Evidence**

- `packages/shared-middleware/src/index.ts`
- `packages/shared-types/src/index.ts`
- `packages/ui-shared/src`
- `packages/test-harness/src`
- `apps/admin-web/src/main.tsx`
- `apps/guest-member-pwa/src/main.tsx`
- `services/*/src/index.ts`

**Participating Areas**

Shared Middleware, Shared Types, UI Shared, Test Harness, Admin Web, Guest/Member PWA, Backend Services

**Capability Boundary**

Includes shared executable platform support used across services, apps, and verification harnesses.

**Evidence Confidence**

CONFIRMED

### CAP-016 - Local Runtime Routing & Service Composition

**Purpose**

Provides executable local composition for database, reverse proxy routing, frontend routing, and service endpoint aggregation.

**Primary Actors**

Platform

**Executable Evidence**

- `docker-compose.yml`
- `Caddyfile`
- `deploy/gcp-vm/docker-compose.yml`
- `deploy/gcp-vm/Caddyfile`
- `deploy/gcp-vm/Dockerfile.node-service`
- `deploy/gcp-vm/Dockerfile.caddy-static`
- `start-services.bat`
- `start-pwa-dev-tunnel.ps1`
- `scripts/verify-deployment.mjs`

**Participating Areas**

Runtime Configuration, Reverse Proxy, Database, Backend Services, Admin Web, Guest/Member PWA

**Capability Boundary**

Includes executable service composition and routing configuration that makes platform areas reachable together.

**Evidence Confidence**

CONFIRMED

### CAP-017 - Progressive Web App Shell

**Purpose**

Provides installable/mobile-oriented PWA shell assets and browser-level PWA support for the guest/member application.

**Primary Actors**

Guest, Member, Platform

**Executable Evidence**

- `apps/guest-member-pwa/src/components/PwaInstallPrompt.tsx`
- `apps/guest-member-pwa/public/sw.js`
- `apps/guest-member-pwa/public/logo.png`
- `apps/guest-member-pwa/index.html`
- `apps/guest-member-pwa/tests/pwa-install-dismissal.spec.ts`

**Participating Areas**

Guest/Member PWA

**Capability Boundary**

Includes current PWA shell assets and executable frontend install-prompt support.

**Evidence Confidence**

PARTIALLY_CONFIRMED

## 4. Capability Summary

| Capability ID | Capability | Primary Executable Area | Confidence |
| ------------- | ---------- | ----------------------- | ---------- |
| CAP-001 | Identity & Authentication | Identity Auth Service | CONFIRMED |
| CAP-002 | Tenant & White-Label Management | Tenant Management Service | CONFIRMED |
| CAP-003 | Branch Management | Tenant Management Service | CONFIRMED |
| CAP-004 | Role & Administrative Access Context | Tenant Management Service | CONFIRMED |
| CAP-005 | Resource Management | Slot Engine | CONFIRMED |
| CAP-006 | Availability & Scheduling Management | Slot Engine | CONFIRMED |
| CAP-007 | Booking Management | Slot Engine | CONFIRMED |
| CAP-008 | Booking Rule Configuration | Slot Engine | CONFIRMED |
| CAP-009 | Member Assignment & Attendance | Slot Engine | CONFIRMED |
| CAP-010 | Occupancy Monitoring & Capacity Release | Slot Engine | CONFIRMED |
| CAP-011 | Payment Intent, Order & Capture Management | Payment Service | CONFIRMED |
| CAP-012 | Refund Management | Payment Service | CONFIRMED |
| CAP-013 | Notification Dispatch & Device Registration | Notification Service | CONFIRMED |
| CAP-014 | Scheduled Job & Dispatch Coordination | Job Scheduler | CONFIRMED |
| CAP-015 | Shared Platform API/UI Infrastructure | Shared Packages | CONFIRMED |
| CAP-016 | Local Runtime Routing & Service Composition | Runtime Configuration | CONFIRMED |
| CAP-017 | Progressive Web App Shell | Guest/Member PWA | PARTIALLY_CONFIRMED |

## 5. Capability Relationship View

```text
Shared Platform API/UI Infrastructure
   |
Local Runtime Routing & Service Composition
   |
Identity & Authentication
   |
Tenant & White-Label Management
   |
Branch Management
   |
Role & Administrative Access Context
   |
Resource Management
   |
Availability & Scheduling Management
   |
Booking Rule Configuration
   |
Booking Management
   |
Member Assignment & Attendance
   |
Occupancy Monitoring & Capacity Release
   |
Payment Intent, Order & Capture Management
   |
Refund Management
   |
Notification Dispatch & Device Registration
   |
Scheduled Job & Dispatch Coordination
   |
Progressive Web App Shell
```

This relationship view is a high-level capability map only. It does not describe flows, API call order, state transitions, events, or business rules.

## 6. Unconfirmed Capability Candidates

### UCAP-001 - Tournament Management

Evidence suggesting capability:
`docs/tournament_module_api_spec.md` exists as a design/API specification source.

Reason not confirmed:
No current executable service, app route, Prisma model group, or route group was identified for tournament management in Level A evidence inspected for Phase 2.

### UCAP-002 - Student Training Management

Evidence suggesting capability:
Business discovery documentation references student training as a product area.

Reason not confirmed:
No distinct current executable implementation boundary was identified for student training in inspected Level A evidence.

### UCAP-003 - Driver Rental Management

Evidence suggesting capability:
`docs/driver_rental_app_discovery_brief.md` exists in repository documentation.

Reason not confirmed:
No current executable implementation boundary was identified for driver rental capability, and Phase 1 already classified this document's relationship to the platform as unclear.

## 7. Boundary Uncertainties

CAPABILITY-BOUNDARY-UNCERTAINTY-001

Capabilities involved:
CAP-006, CAP-014

Observation:
Availability generation and scheduled job/dispatch coordination both appear in executable evidence, but Phase 2 does not determine how much scheduling responsibility belongs to the availability capability versus the shared scheduler capability.

Disposition:
UNRESOLVED

CAPABILITY-BOUNDARY-UNCERTAINTY-002

Capabilities involved:
CAP-007, CAP-011, CAP-012

Observation:
Booking, payment, and refund capabilities share executable integration points, but Phase 2 does not determine transactional, policy, or lifecycle boundaries.

Disposition:
UNRESOLVED

CAPABILITY-BOUNDARY-UNCERTAINTY-003

Capabilities involved:
CAP-009, CAP-010, CAP-013, CAP-014

Observation:
Member attendance, occupancy monitoring, notification dispatch, and scheduled dispatch coordination overlap in current executable evidence, but Phase 2 does not resolve operational ownership boundaries.

Disposition:
UNRESOLVED

CAPABILITY-BOUNDARY-UNCERTAINTY-004

Capabilities involved:
CAP-001, CAP-004, CAP-015

Observation:
Identity, administrative access context, and shared middleware all participate in access-related execution surfaces, but Phase 2 does not perform authorization analysis or split shared access mechanics from business capability boundaries.

Disposition:
UNRESOLVED

CAPABILITY-BOUNDARY-UNCERTAINTY-005

Capabilities involved:
CAP-002, CAP-003

Observation:
Tenant and branch responsibilities are implemented in the same backend service and share frontend contexts, but Phase 2 keeps them separate only at capability-boundary level.

Disposition:
UNRESOLVED

## 8. Phase 2 Readiness Decision

READY FOR PHASE 3 WITH CAPABILITY UNCERTAINTIES

Capability-related reason:

The current executable repository provides enough Level A evidence to establish a confirmed capability catalogue and proceed to flow discovery. Several capability boundaries remain intentionally unresolved because they require flow, policy, lifecycle, or authorization analysis that is outside Phase 2.

