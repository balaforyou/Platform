# Admin Web Phase Plan

**Status:** Draft for review, 31 Jul 2026. No implementation starts until this plan is explicitly approved.

**Scope source:** `docs/mvp_retrofit_plan.md`, narrowed to the Admin Web surfaces named in the phase prompt:
- Branch/resource configuration
- Minimal member assignment
- Negotiated booking creation
- Manual refund override
- Low-occupancy alert view and manual release

**Explicitly out of scope for this phase:** facilities/about content editor. It is listed under Admin Web in the retrofit plan, but not in the requested phase scope. Treat it as deferred unless review expands this phase.

## Fresh-read notes

- `docs/mvp_retrofit_plan.md` says the Backend batch should precede Admin Web. Direct code verification found the prerequisite is only partially complete for a browser-based Admin Web app; the exact available and missing endpoints are listed below.
- `docs/mvp_retrofit_plan.md` still describes "Admin web (none of this exists yet)" accurately for the frontend app: `apps/admin-web` is currently only a Vite/React stub.
- Admin Web login/tenant resolution was missing from persisted planning docs. This plan now treats that as in-scope: Admin Web needs its own login screen, redirect-if-unauthenticated behavior, owner/branch-manager role gate, Unauthorized view, and tenant/subdomain resolution through `TenantProvider` / `TenantContext` from `packages/ui-shared`, following the guest PWA pattern.
- `docs/findings_register.md` contains open items that this phase may touch:
  - F-004: production routing remains undecided. Admin Web should use configurable API bases and not assume final hosting rewrites are settled.
  - F-005: low-occupancy default percentage is still a business decision. Admin Web can expose/edit the configured value, but should not invent a product default beyond whatever exists in persisted branch/resource data.
  - F-009: phone validation for co-player input is still open. Negotiated booking creation may collect customer/co-player phones, so the plan includes shared client validation and server-error handling, but the backend-side fix remains a separate open issue unless explicitly pulled into this phase.
  - F-010: availability windows may be generated off clean hour boundaries. Admin Web should display exact backend times and avoid implying clean hourly slots unless the backend data actually has them.
- No blocker or contradiction prevents writing this plan. The only scope ambiguity is facilities/about, handled above as excluded.

## Backend prerequisite verification

Checked current service code directly on 31 Jul 2026, not just docs.

### Verified available

- Tenant Management:
  - `GET /tenants/by-subdomain/:subdomain` exists for tenant/subdomain resolution.
  - `GET /tenants/:id/branches` exists, with `includeDraft=true` gated to owner/internal auth.
  - `POST /tenants/:id/branches` and `PATCH /branches/:id` exist and accept working days/hours fields.
  - `GET /users/:id/roles` and `GET /users/:userId/branches/:branchId/check` exist for role/scope lookups.
- Slot Engine:
  - `POST /resource-pools` exists and accepts Phase 9 occupancy/pricing/duration fields at creation time.
  - `GET /branches/:id/resource-pools` exists and returns pools/resources/rules for a branch.
  - `GET /resource-pools/:id/occupancy` exists.
  - `POST /resource-pools/:id/windows/:windowId/release` exists and is admin/internal gated.
  - `POST /member-group-assignments` and `PATCH /member-group-assignments/:id` exist and are admin/internal gated.
  - `POST /bookings/negotiated` exists with idempotency and phone validation, but it is internal-key only and cannot be called directly from a browser.
- Payment:
  - `POST /payment-links` exists and accepts internal key or owner/branch-manager JWT.
  - `POST /payment-links` currently requires a pre-existing `bookingId`, `tenantId`, `userId`, and `amount`; it has no request-body path that creates the negotiated booking itself from branch/resource/window/customer details.
  - `POST /refunds/override` exists, requires JWT owner/branch-manager role, and derives `adminId` from token.

### Missing or not browser-callable

- Slot Engine has no `PATCH /resource-pools/:id` endpoint in current code or git history. Admin Web cannot edit min/max occupancy, minimum booking duration, pricing mode, or default rate for an existing pool without building this endpoint from scratch.
- Slot Engine has `POST /booking-rules`, but no update endpoint for existing booking rules. Admin Web cannot safely edit low-occupancy threshold/cutoff for an existing pool unless the implementation adds update/upsert behavior.
- Slot Engine `GET /member-group-assignments` is internal-key only. `POST /member-group-assignments` already has the approved dual-path auth, so the fix is to apply the same `requireInternalOrAdmin` helper to the sibling listing endpoint rather than creating a new endpoint.
- Negotiated booking creation needs a new browser-callable orchestration path. Today Slot Engine's `POST /bookings/negotiated` is internal-key only, and Payment's `POST /payment-links` requires an already-created booking ID. The fix is a new dedicated Payment endpoint, e.g. `POST /payment-links/negotiated`, that is JWT-gated for owner/branch-manager callers, internally calls Slot Engine's `/bookings/negotiated` with `INTERNAL_SERVICE_KEY`, then creates the payment link and returns both results. Do not branch `POST /payment-links` based on optional negotiated-booking fields; keep its current contract untouched.

**Plan impact:** implementation should not start by assuming these gaps away. Either the Admin Web phase must include the backend additions above (`PATCH /resource-pools/:id`, booking-rule update/upsert, applying `requireInternalOrAdmin` to assignment listing, and `POST /payment-links/negotiated`), or this plan needs a preceding backend-follow-up phase before Admin Web can be fully implemented.

## Proposed changes

### App foundation

- Replace the current `apps/admin-web/src/main.tsx` stub with a small routed React app.
- Add Admin Web dependencies already used or expected by the frontend stack:
  - `react-router-dom` for routes
  - `@tanstack/react-query` for server state, mutations, invalidation, and retry control
  - `zod` for form validation
  - `lucide-react` for icon buttons and compact controls
- Reuse shared UI/auth context from `packages/ui-shared` where it fits. If the shared package does not yet expose the exact admin needs, keep Admin Web helpers local rather than widening shared APIs prematurely.
- Add a typed API client that:
  - Reads service base URLs from Vite env variables.
  - Sends auth credentials/tokens consistently.
  - Normalizes the existing response envelope/error format.
  - Keeps service boundaries visible rather than hiding Slot/Tenant/Payment behind one ambiguous endpoint.

### Authentication and tenant resolution

- Wrap Admin Web with `TenantProvider` from `packages/ui-shared` so tenant/subdomain resolution happens before authentication-sensitive routes render.
- Add an Admin Web login screen using the existing `AuthProvider` / `useAuth` flows where possible:
  - OTP login
  - Google mock login if still part of the current dev/test auth contract
  - Clear tenant-resolution failure state inherited from `TenantProvider`
- Add protected routing:
  - Redirect unauthenticated users to `/login`.
  - Redirect authenticated users without `owner` or `branch_manager:*` role to an Unauthorized view.
  - Scope branch-manager screens/actions to assigned branch IDs, using JWT role claims and/or the Tenant service branch-check endpoint.
- Keep Admin Web login visually distinct from the guest/member PWA, but reuse the same tenant branding primitives so the owner sees the correct white-label context.

### Information architecture

- Add a work-focused admin shell with top navigation or a compact sidebar:
  - Branches
  - Resources
  - Member Assignments
  - Low Occupancy
  - Negotiated Bookings
  - Refund Overrides
- Prefer dense, operational UI over landing-page styling: tables, detail panels, filters, inline actions, and confirmation dialogs.
- Include empty, loading, validation-error, permission-error, and mutation-in-progress states for each workflow.

### Branch and resource configuration

- Branch configuration screen:
  - List branches for a tenant.
  - Edit working days and working hours.
  - Preserve draft/active status behavior instead of exposing any shortcut that bypasses backend branch gates.
- Resource configuration screen:
  - List resource pools for a branch.
  - Configure min/max occupancy, minimum booking duration, pricing mode, and default rate.
  - Show current low-occupancy threshold where available.
  - Surface backend validation errors directly next to fields.
- Known backend gap: existing resource pools and booking rules do not currently have browser-callable update endpoints for all fields this screen needs. `PATCH /resource-pools/:id` is new work to build, not an extension of an older Phase 1 endpoint. Implementation must either include approved backend additions or reduce this screen to create/read-only after explicit review.

### Minimal member assignment

- Add a member assignment screen for creating and managing one recurring slot for a member.
- Required inputs:
  - Branch/resource pool
  - Member identity
  - Recurrence/day/time window
  - Seat count/group size, if supported by the backend contract
  - Active/inactive status
- Show assignment conflicts returned by the backend as first-class errors. Do not try to pre-resolve concurrency conflicts client-side.
- Include edit/deactivate actions only to the extent supported by the existing backend endpoints.

### Negotiated booking creation

- Add a form for admin-created negotiated bookings:
  - Branch/resource pool/resource window
  - Customer/member details
  - Party size/co-players where supported
  - Negotiated amount
  - Notes/reference fields where supported
- Submit the booking to Slot Engine's admin-negotiated booking endpoint.
- Create the negotiated booking and payment link through the new dedicated Payment orchestration endpoint.
- Display the returned payment link with copy action and clear status messaging.
- Do not accept admin identity, price authority, or booking status from arbitrary user-entered fields beyond the negotiated amount explicitly allowed by the admin endpoint.
- Known backend gap: the current system has no browser-callable orchestration endpoint that creates the negotiated booking and returns a payment link. Build a new dedicated endpoint such as `POST /payment-links/negotiated`; do not extend `POST /payment-links` with a second body shape.

### Manual refund override

- Add a refund override screen:
  - Find or enter booking/payment/refund context.
  - Show the tiered calculated refund, if available from the backend.
  - Require override amount and reason.
  - Submit to Payment Service's `/refunds/override`.
- Make the audit boundary explicit in behavior: the UI never sends `adminId`; the server derives it from the authenticated token.
- Require a confirmation step for overrides because this intentionally bypasses the tiered calculation.

### Low-occupancy alert and manual release

- Add a low-occupancy view:
  - Branch/resource filters.
  - Occupancy percentage, current confirmed/member seats, capacity, threshold, and relevant cutoff time.
  - Alert/release status where exposed by Slot Engine.
- Add manual release action for a specific freed seat/window:
  - Confirm before release.
  - Invalidate occupancy and availability queries after success.
  - Show conflicts/stale-state errors if another admin or sweep already changed the same window.
- Do not hard-code the low-occupancy default threshold; display the persisted configured value and expose "not configured" clearly if the backend returns none.

## Technical Design

### Technical approach

Build Admin Web as a thin authenticated operational console over the already-approved backend services. React Query should own all server state so screens do not maintain stale local copies after mutations. Forms should validate obvious input quality client-side with Zod, but the server remains authoritative for roles, tenant/branch scope, price authority, booking/refund status, concurrency, and audit identity.

This approach is preferable to building a larger frontend domain layer now because the app is new, the backend service contracts are still the durable source of truth, and the phase goal is to expose minimal working admin workflows rather than create a reusable admin framework before usage patterns are proven.

Keep service API wrappers separated by service:
- Tenant client: branch list/update and branch config.
- Slot client: resource pools, occupancy, member assignments, negotiated booking, manual release.
- Payment client: payment links and refund overrides.

Use route-level screens plus small form/table components. Add shared abstractions only after repeated patterns are real, such as an envelope-aware `requestJson` helper and a reusable confirmation dialog.

### Backend prerequisite approach

These backend changes are part of the Admin Web prerequisite work if this phase is approved as full implementation scope.

**Member assignment listing**

- Change Slot Engine `GET /member-group-assignments` from `requireInternalKey(request, reply)` to `await requireInternalOrAdmin(request, reply)`.
- Keep the existing route and query contract (`resourcePoolId`, `userId`) rather than adding a duplicate browser-only endpoint.
- Preserve the sibling route's trust model: internal callers can still list for service work, while owner/branch-manager JWT callers can list for Admin Web.
- Add branch/tenant scoping if the route returns assignments outside the caller's authorized branch scope. The helper only proves role, not necessarily branch-level authorization for a branch manager.

**Resource pool update**

- Add Slot Engine `PATCH /resource-pools/:id` as new endpoint work; git history confirms no older update route exists.
- Authenticate with `requireInternalOrAdmin`, then enforce tenant/branch scope before updating. Owner can update pools under the tenant; branch managers can update only pools whose `branchId` matches their assigned branch scope.
- Accept only editable resource-pool configuration fields: `name`, `capacity`, `minOccupancy`, `minBookingDurationMinutes`, `pricingMode`, `defaultRate`, and any existing safe metadata fields already present on `ResourcePool`.
- Reject client-supplied `tenantId`, `branchId`, allocation ownership changes, or any field that would move a pool across tenant/branch boundaries.
- Validate invariants server-side: `minOccupancy >= 1`, `capacity >= minOccupancy`, duration is a positive supported slot increment, pricing mode is a known enum, and rate is non-negative.
- Return the updated pool including resources/booking rules so Admin Web can refresh without stitching partial local state.

**Booking-rule update/upsert**

- Add a Slot Engine update/upsert route for existing per-pool booking rules. Prefer `PUT /resource-pools/:id/booking-rule` or `PATCH /booking-rules/:id`; implementation should choose the route that best matches existing local conventions, but it must be one stable browser-callable contract.
- Authenticate with `requireInternalOrAdmin`, fetch the associated resource pool, then enforce tenant/branch scope through that pool before writing rule data.
- Allow Admin Web to update `guestAccessCutoffMinutes`, `lowOccupancyThresholdPct`, and any already-supported rule fields that are truly part of branch/resource configuration. Do not expand cancellation-policy editing unless the UI explicitly implements and tests that surface.
- Treat absent rule records deterministically: either create the missing rule for the pool through an explicit upsert route, or return a clear `404` that the UI handles. The plan preference is upsert because Admin Web configuration should not strand a newly created pool with no editable rule.
- Validate threshold and cutoff server-side: threshold must be a bounded percentage, cutoff/grace/window values must be non-negative sensible integers, and no hidden default should override the unresolved F-005 business default.

**Negotiated booking payment-link orchestration**

- Add a new Payment Service endpoint, e.g. `POST /payment-links/negotiated`.
- Authenticate with JWT and require `owner` or `branch_manager:*`; internal key access can be allowed only if there is a real service-to-service caller.
- Accept negotiated-booking details directly: tenant, branch, resource pool/window/resource, customer/user, co-player phones, negotiated amount, and optional description/reference fields.
- Admin Web generates an `Idempotency-Key` header for each logical negotiated-payment submission and sends it to `POST /payment-links/negotiated`.
- Payment Service durably associates that exact client-supplied idempotency key with the resulting booking/payment intent before returning success. On retry with the same key, it checks first and returns the existing result instead of creating anything new.
- Payment Service forwards the same idempotency key, or a deterministic derived child key, to Slot Engine `POST /bookings/negotiated` using `INTERNAL_SERVICE_KEY`; it must not generate a fresh unrelated internal key on each execution.
- After Slot Engine returns the held negotiated booking, Payment Service reuses the existing payment-link creation behavior to create the `PaymentIntent` and return `{ booking, paymentLink }` in one response.
- Keep `POST /payment-links` unchanged. This avoids a single endpoint with two trust-boundary-dependent body shapes and matches the existing Phase 9 pattern of separating negotiated booking from normal self-service booking.
- Use the same check-first-return-existing idempotency pattern used elsewhere in the project: look for an existing booking/payment intent tied to the idempotency key, return it if found, and create only if genuinely new.

### Backend prerequisite edge cases

**Trust boundaries**

- `GET /member-group-assignments` must not expose all tenants' assignments to any branch manager merely because they have a branch-manager role.
- `PATCH /resource-pools/:id` and booking-rule update/upsert must not allow branch managers to alter pools/rules outside their branch scope.
- Resource-pool update must reject client attempts to move a pool across tenant/branch boundaries by supplying `tenantId` or `branchId`.
- Booking-rule update/upsert must not let Admin Web silently set an unresolved low-occupancy default that contradicts F-005.
- The browser must never receive or send `INTERNAL_SERVICE_KEY`; only Payment Service uses it for the internal Slot Engine call.
- `POST /payment-links/negotiated` must derive admin identity from JWT and must not accept `adminId` or role claims from the request body.
- Negotiated amount is accepted only on the new admin-only orchestration endpoint, not on the existing guest booking path.
- `POST /payment-links` keeps its current body contract so existing payment-link callers do not accidentally get negotiated-booking authority.

**Concurrency and idempotency**

- Two admins editing the same resource/rule can overwrite each other. At minimum, the endpoint must return the persisted updated record and Admin Web must refetch after save; if the schema supports `updatedAt`, use it for stale-write detection or explicitly log that last-write-wins is accepted for this MVP config surface.
- Two retries of the same negotiated-payment request must resolve to the same held booking/payment link or a clear conflict, not duplicate held bookings.
- Slot Engine remains responsible for no-double-booking and pooled-capacity checks under its existing transaction/lock behavior.
- If payment-link creation fails after the negotiated booking is held, the retry path must recover using the idempotency key rather than creating a second booking.
- If the Slot Engine call succeeds but the Payment Service response is lost, a repeated request should return the already-created booking/link when possible.
- If the browser retries with the same `Idempotency-Key` after timeout, Payment Service must recognize that exact key and return the existing result; idempotency generated only inside Payment Service is insufficient.

**Production build vs. dev runtime**

- Payment and Slot Engine typechecks must compile the new route bodies, response shapes, JWT typing, and fetch response handling under `tsc`, not just via `tsx`.
- Shared types should be added or updated if the Admin Web client consumes the new orchestration response shape.

**Multi-instance scenarios**

- Two Admin Web tabs can submit the same negotiated booking form if an admin double-opens the workflow. Idempotency must protect the backend; UI submit disabling is not enough.
- Assignment listing may be open in multiple tabs while another admin creates/deactivates an assignment, so Admin Web must refetch after create/update.

### Backend prerequisite test plan

**Member assignment listing tests**

- API test: `GET /member-group-assignments` with `INTERNAL_SERVICE_KEY` still succeeds.
- API test: `GET /member-group-assignments` with owner JWT succeeds.
- API test: `GET /member-group-assignments` with branch-manager JWT succeeds only for authorized branch/resource scope once scoping is enforced.
- API test: member/non-admin JWT receives `403`, and missing/invalid auth receives `401`.
- UI/Playwright test: Admin Web member assignment screen loads data using JWT auth, not an internal key.

**Resource/rule configuration tests**

- API test: `PATCH /resource-pools/:id` with owner JWT updates allowed fields and returns the updated pool.
- API test: branch-manager JWT can update only a pool in its assigned branch; a different branch returns `403`.
- API test: request body cannot change `tenantId`, `branchId`, or other non-editable ownership fields.
- API test: invalid occupancy/duration/pricing values return `400` with clear error codes.
- API test: booking-rule update/upsert changes low-occupancy threshold/cutoff for the intended pool only.
- API test: missing booking rule follows the chosen contract deterministically; preferred behavior is upsert.
- UI/Playwright test: resource config saves through the real Admin Web form and refetches the persisted values.

**Negotiated orchestration tests**

- API test: `POST /payment-links/negotiated` with owner/branch-manager JWT creates a held negotiated booking through Slot Engine and returns a payment link in one response.
- API test: member JWT cannot create a negotiated payment link.
- API test: request body cannot spoof `adminId`, role, booking status, or gateway/payment status.
- API test: Admin Web/client sends an `Idempotency-Key` header, Payment Service persists/associates that exact key, and retry with the same key returns the existing booking/payment link without creating duplicates.
- Failure-path test: simulate Slot Engine rejecting the booking for capacity/conflict and assert Payment Service does not create a payment intent.
- Failure-path test: simulate payment-link creation failure after Slot Engine booking creation and assert retry behavior is deterministic and does not double-book.
- Type/build test: run Payment Service and Slot Engine `tsc`/build checks after route changes.

### Edge cases considered

**Trust boundaries**

- Admin role/branch scope must be enforced by backend endpoints. The UI may hide actions for convenience, but it must not be treated as authorization.
- Admin Web must reject authenticated non-admin users with an Unauthorized view before showing operational screens.
- Negotiated amount is intentionally admin-entered, but only on the admin-negotiated booking path. Normal guest booking price must never be client-authoritative.
- Refund override must not send or spoof `adminId`; the backend already documents deriving it from JWT.
- Manual release must be tied to a specific backend window/resource, not a client-computed availability guess.
- Branch/resource config must not allow tenant or branch IDs to be edited through hidden form fields in a way that crosses scope.
- Tenant resolution must be server-backed through Tenant service, not a client-only query parameter treated as authority.

**Concurrency**

- Two admins may edit the same resource, create overlapping member assignments, issue release actions, or submit refund overrides close together.
- The UI should disable duplicate submits in the current tab, but correctness depends on backend constraints and idempotency.
- After each mutation, invalidate and refetch affected queries instead of patching optimistic local state for critical booking/refund/release data.

**Real browser/device vs. script-level testing**

- This phase is UI-heavy, so API-only tests are insufficient.
- At least one Playwright test must exercise each major workflow through the rendered Admin Web app, not just call service endpoints.
- Responsive checks should cover desktop and a narrow mobile/tablet viewport because admins may use the console from a phone during operations.

**Production build vs. dev runtime**

- `apps/admin-web` must pass `npm run build`, which runs `tsc && vite build`.
- Shared package type boundaries must be compiled, not just executed by Vite dev server.
- Env-variable access should be typed and fail clearly when required service base URLs are missing.

**Multi-instance scenarios**

- Multiple tabs can hold stale branch/resource/occupancy data.
- React Query refetch-on-focus should be enabled for volatile operational views such as occupancy and release.
- Duplicate button clicks and resubmissions should be guarded in the UI, but the plan assumes backend conflict responses are still possible and must be displayed.
- A payment link workflow can be interrupted after booking creation but before link creation; the UI needs a recoverable state rather than creating duplicate bookings blindly.

### Test plan mapped to edge cases

**Trust-boundary tests**

- Playwright: log in as an admin and complete a negotiated booking using only the negotiated-booking UI; assert the normal guest price fields are not exposed as editable authority.
- Playwright: unauthenticated visit to an Admin Web route redirects to login; authenticated member user lands on Unauthorized; owner or scoped branch manager can enter the console.
- Playwright/API-backed check: tenant is resolved through `TenantProvider`, and branch-manager access to another branch is denied or hidden only after backend scope confirmation.
- Integration/API regression where practical: refund override request from the UI path does not include `adminId`; verify backend response records the JWT-derived actor.
- Playwright: branch/resource forms submit only intended editable fields and handle `403`/scope errors as permission errors, not generic crashes.

**Concurrency tests**

- Playwright or node integration: double-click submit on member assignment and negotiated booking forms; assert the UI sends only one request while pending.
- Backend-backed UI test: simulate stale low-occupancy data, perform release, then handle a conflict/stale response from a second release attempt with a visible message and refetch.
- Preserve existing backend concurrent member-assignment tests; do not replace them with sequential UI tests.

**Real browser/device tests**

- Playwright desktop flow: branch/resource config edit, member assignment create, negotiated booking plus payment link display, manual refund override confirmation, low-occupancy release action.
- Playwright narrow viewport smoke: primary navigation and each form remain usable with no overlapping controls or clipped button text.
- Browser screenshot review for the main dashboard/workflow screens before sign-off.

**Production-build tests**

- Run `npm run typecheck` or `npm run build` for `apps/admin-web`.
- Run affected package/service typechecks if Admin Web imports shared UI/types changed.
- Run the existing Playwright suite or an Admin Web-specific Playwright suite through the built app when feasible, not only Vite dev.

**Multi-instance tests**

- Playwright multi-page test: open the low-occupancy screen in two tabs, release from one tab, focus/refetch the other, and assert stale data is corrected or conflict is shown on action.
- Playwright multi-page test: start negotiated booking flow in one tab and verify a second tab does not silently overwrite or duplicate the in-progress booking state.
- Manual QA note: verify refresh/focus behavior on the low-occupancy view because it is the most time-sensitive Admin Web screen.

## Acceptance criteria

- Admin Web is no longer a stub and exposes the five scoped operational areas.
- Admin Web has tenant resolution, login, protected routes, and an Unauthorized view for non-admin users.
- Each scoped workflow has real backend integration, loading/error/empty states, and visible success/failure feedback.
- No admin-only trust boundary relies solely on hidden UI.
- Low-occupancy release and member assignment handle stale/conflict responses clearly.
- Negotiated booking can create a booking and then produce a payment link without requiring manual API calls.
- Manual refund override requires amount, reason, and confirmation, and does not send `adminId`.
- `apps/admin-web` production build passes.
- Playwright coverage exercises the real rendered Admin Web app for the scoped workflows, with at least one multi-tab/stale-state test.
- Any backend prerequisite gaps found above are either implemented under explicit approval or converted into a reviewed scope reduction before frontend work claims completion.

## Stop point

After approval, implementation may begin. After implementation and verification, no commit may be created until the user explicitly signs off with a commit instruction.
