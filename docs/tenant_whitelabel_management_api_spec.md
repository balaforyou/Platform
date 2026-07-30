# Tenant / White-Label Management — API Contract (v0)

**Status:** Third Platform Core component, re-prioritized given the 20-customer pipeline.
**Related docs:** `slot_resource_engine_api_spec.md`, `identity_auth_service_api_spec.md`, `platform_core_reusable_components.md`

---

## 1. Scope & ownership boundary

This service owns the **organizational hierarchy and white-label identity**: `Tenant` and `Branch`. It does **not** own `ResourcePool`, `Resource`, `AvailabilityWindow`, or `Booking` — those stay owned by the Slot Engine, which simply references `tenant_id` and `branch_id` as foreign keys. Splitting it this way means: this service answers "does this tenant/branch exist, is it active, what's its plan/branding," while the Slot Engine answers "what can be booked here and by whom."

## 2. Core entities

| Entity | Purpose |
|---|---|
| `Tenant` | The owner/business — id, name, subdomain, branding (logo, theme color, app name), plan (`basic` + any active premium add-ons), contact/billing info, status |
| `Branch` | A "group" in your terms — physical location (badminton) or service zone (driver app). tenant_id, name, address/zone, timezone, status. **Dynamically addable at any time**, not fixed at onboarding |
| `RoleAssignment` | user_id, tenant_id, role (`owner` \| `branch_manager` \| `front_desk`), branch_id (null for `owner`, required for branch-scoped roles) — decided (26 Jul 2026) to live here since permissions are hierarchy-shaped data this service already owns |

`ResourcePool`/`Resource` (courts, doubles vs singles, cars) live in the Slot Engine, scoped to a `branch_id` — this service doesn't duplicate that data, it just guarantees the branch they point to is real and active.

## 3. Dynamic branch addition — the actual new capability

The badminton owner "taking over a new branch" mid-operation is the concrete case this needs to handle well:
1. `POST /tenants/{id}/branches` creates the `Branch` in a **`draft` status** — not yet visible to guests/members.
2. Admin configures that branch's resource pools/resources via the Slot Engine (`POST /resource-pools` scoped to the new `branch_id`), plus branch-specific `BookingRule`s and `BlockedWindow`s (training hours, etc.).
3. Once configuration is complete, `PATCH /branches/{id}` flips status to `active`, and only then does it appear in the guest-facing branch selector and start accepting bookings.

This draft → active gate matters: without it, a half-configured branch (missing rules, no resources yet) could show up as bookable before it's ready.

## 4. Endpoints (v0 draft)

| Method & path | Purpose |
|---|---|
| `POST /tenants` | Onboard a new tenant — **platform-managed** (you provision each of the 20 pipeline customers), not self-service |
| `PATCH /tenants/{id}` | Update branding, plan/add-ons, status |
| `GET /tenants/by-subdomain/{subdomain}` | Resolve a subdomain to a tenant — called by the app shell on load, before login, to fetch branding/config |
| `GET /tenants/{id}/manifest.json` | Dynamically generated PWA manifest (name, icons, theme color) per tenant, for home-screen install |
| `POST /tenants/{id}/branches` | Add a new branch (draft status) — **self-service**, exposed in the tenant's own admin console |
| `PATCH /branches/{id}` | Update branch details, flip draft → active, deactivate |
| `GET /tenants/{id}/branches` | List a tenant's branches (for admin console and guest-facing branch picker) |
| `POST /tenants/{id}/roles` | Assign a role (`owner` \| `branch_manager` \| `front_desk`) to a user, scoped to a branch where applicable |
| `GET /users/{id}/roles` | Fetch a user's role assignments — called by Identity at login/refresh to embed into the JWT (see Section 6) |

## 5. White-label resolution flow

The PWA shell, on first load, needs to know *which tenant it's serving* before a user even logs in (to show the right logo/name/theme). Subdomain-based resolution (`courtowner1.yourplatform.in`) is the mechanism decided earlier — `GET /tenants/by-subdomain/{subdomain}` is what makes that concrete: the app calls it once on load, caches the branding, and every subsequent API call carries the resolved `tenant_id`.

## 6. Resolved decisions

- ~~Self-service vs platform-managed creation~~ — **decided:** tenant creation is platform-managed; branch addition within an existing tenant is self-service (low-risk given the draft → active gate in Section 3).
- ~~Role-based access~~ — **decided:** `RoleAssignment` lives in this service (Section 2), since permissions are hierarchy-shaped data this service already owns. Identity calls `GET /users/{id}/roles` at login/token-refresh time to embed the role into the JWT, rather than doing a live lookup per request.
- ~~Plan/entitlement enforcement~~ — **decided:** entitlement (active premium add-ons) is embedded as JWT claims at login, refreshed every 15 minutes alongside the access token (matches the token lifetime decided in the Identity spec) — a plan upgrade takes effect within that window rather than requiring a live lookup on every gated request.

## 7. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Tenant creation: platform-managed. Branch addition: self-service |
| 26 Jul 2026 | RoleAssignment (Owner/Branch Manager/Front Desk) owned by Tenant service |
| 26 Jul 2026 | Entitlement checked via JWT claims, refreshed every 15 min |

---
*Fourth component once this is closed: Payment Service.*
