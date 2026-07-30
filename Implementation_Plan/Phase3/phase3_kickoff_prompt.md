Read docs/coding_assistant_handover_plan.md Section 4 (Phase 3 row) and docs/tenant_whitelabel_management_api_spec.md in full before planning anything.

Phase 0, 1, and 2 are complete and approved. We are now starting Phase 3: Tenant/White-Label Management (services/tenant-management), which currently only contains the placeholder /health and /error-test routes from Phase 0.

Same working agreement as previous phases (handover plan Section 1) — comments on non-trivial logic, flag performance trade-offs explicitly, stop and ask on anything the spec doesn't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope for this phase

Implement the Tenant/White-Label service exactly as specced in docs/tenant_whitelabel_management_api_spec.md:
- Core entities: Tenant, Branch, RoleAssignment (Section 2)
- All endpoints in Section 4, including the subdomain resolution endpoint and dynamic manifest.json generation
- The draft → active branch gate (Section 3) — a branch must not be visible to guest-facing queries until explicitly activated
- Tenant creation stays platform-managed; branch addition is self-service (Section 6, resolved decisions)
- RoleAssignment scoping: owner (all branches), branch_manager (one branch), front_desk (check-in/override only)

## Ownership boundary reminder

Per Section 1 of the spec, this service owns Tenant and Branch — it does NOT own ResourcePool, Resource, AvailabilityWindow, or Booking (those stay in Slot Engine). Slot Engine's existing `tenantId`/`branchId` scalar fields (added in Phase 1 as plain UUIDs, no enforced relation) should now be treated as referencing real rows in this service's tables — but do not add a cross-service Prisma relation; the two services stay independently deployable per the "reusable unit is the service, not shared code" decision. If foreign-key-style validation across services is needed, it should be an API call, not a database-level foreign key.

## The specific checkpoint carried forward from Phase 2

Phase 2's Identity & Auth service already calls `GET /users/{id}/roles` on this service at login/refresh, fails closed to an empty roles array today (since this service didn't exist yet), and embeds whatever it gets into the issued JWT. Your plan and verification suite for this phase must include an end-to-end test proving the full chain works for real, not just that each side compiles in isolation:
1. Create a tenant and branch via this service
2. Assign a RoleAssignment (e.g. branch_manager) to a test user via `POST /tenants/{id}/roles`
3. Have that user log in through Identity & Auth
4. Decode the issued JWT and confirm it carries the real role assignment — not an empty array

This is the one non-negotiable checkpoint for this phase, the same way the double-booking race condition was non-negotiable for Phase 1.

## Also required
- A test proving the draft → active gate actually works: a branch in draft status must be excluded from whatever endpoint the guest-facing app would use to list bookable branches
- A test proving role scoping is enforced: a branch_manager assigned to Branch A cannot act on Branch B through whatever authorization check this service (or a shared-middleware helper) provides

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
