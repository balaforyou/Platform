# Identity & Auth Service — API Contract (v0)

**Status:** Second Platform Core component being specced.
**Related docs:** `platform_core_reusable_components.md`, `slot_resource_engine_api_spec.md`

---

## 1. Scope

Owns: user identity, OTP/email login, session/token issuance, and tenant-scoping. Does **not** own booking data, payment data, or profile fields specific to a vertical (e.g. driver KYC documents live in the driver app's own backend, referencing a `user_id` from this service).

## 2. Core entities

| Entity | Purpose |
|---|---|
| `Tenant` | Same tenant concept as the Slot Engine — a user's identity is namespaced per tenant unless SSO is explicitly enabled between tenants |
| `User` | Core identity record: mobile number and/or email, verified status, tenant_id |
| `AuthSession` | Issued token (JWT) after successful OTP/email verification, with expiry and refresh |
| `PendingInvite` | A mobile number added to a group booking who isn't yet a registered `User` — resolves into a real `User` on first login |

## 3. Login channels by persona

- **Guests:** mobile OTP only — keeps SMS cost down for one-off bookers, and a phone number is needed anyway for group-booking invites.
- **Members:** mobile OTP **or** Google sign-in (OAuth) — daily login for attendance confirmation makes per-message OTP cost add up, so Google is offered as a free, fast alternative. Mobile number remains the required core identifier on every member's profile (needed for attendance reminders regardless of login method) — Google is a *linked* fast-login method on top of that, not an independent identity. First-time signup still captures and verifies a phone number once, even if the person chose to sign in with Google.
- **Owner/Admin (desktop):** assumed same as members (mobile OTP or Google) for consistency and to avoid SMS cost at the admin level — flag if a different approach is wanted here.

## 4. Endpoints (v0 draft)

| Method & path | Purpose |
|---|---|
| `POST /auth/otp/request` | Send OTP to a mobile number (via MSG91) for a given tenant |
| `POST /auth/otp/verify` | Verify OTP, create `User` if new, issue `AuthSession` |
| `POST /auth/google/verify` | Verify a Google ID token; link to an existing `User` (matched by phone captured at signup) or start a signup flow requiring phone verification if this is a brand-new account |
| `POST /auth/refresh` | Exchange a refresh token for a new access token |
| `POST /auth/logout` | Invalidate a session |
| `GET /users/{id}` | Fetch a user's core identity record (called by app backends, not clients) |
| `POST /users/resolve-invite` | Given a mobile number not yet registered, create/return a `PendingInvite` record — used by the badminton app's group-booking flow when a booker adds a co-player who hasn't signed up yet |

## 5. Two things worth getting right early

**OTP abuse prevention.** Since `POST /auth/otp/request` is a public, unauthenticated endpoint (a user hasn't logged in yet — that's the point), it's a natural target for abuse (someone spamming OTPs to rack up your MSG91 bill, or as a denial-of-service against a specific number). Rate-limit per mobile number (e.g. max 3 requests per 10 minutes) and per IP, and consider a short cooldown between consecutive requests to the same number.

**Invite-to-account resolution.** When a badminton group booking adds a co-player by mobile number (Section 6.6 of the badminton brief), that number becomes a `PendingInvite`, not a full `User` — no password, no verified session, just a placeholder tied to the booking. The moment that number completes its own OTP login (for the first time, on any tenant/app), `POST /auth/otp/verify` should check for any `PendingInvite` records matching that number and tenant, and link them to the newly-created `User` — so their booking history/attendance shows up correctly once they're a real account, not orphaned under a phone-number-only placeholder forever.

## 6. Tenant scoping — how it interacts with white-label

Per the badminton white-label decision, each tenant is a separate business — a user's mobile number logging into Tenant A's app and Tenant B's app should, by default, create **two separate `User` records** (same phone number, different tenant_id), not one shared identity. This keeps each white-labelled business's user base fully isolated, matching "individually" white-labelled from the original scoping discussion. Cross-tenant SSO (one login across multiple of your own apps) is possible to add later but is explicitly **not** the default.

## 7. Resolved technical decisions

- ~~JWT expiry / refresh token lifetime~~ — **decided: 15 min access token, 30 day refresh token** (standard, favors low-friction daily logins for members).
- ~~Email as login channel~~ — **decided: Google OAuth (not generic email OTP)** for members and (assumed) owner/admin, layered on top of a required verified mobile number; see Section 3.
- ~~Session storage~~ — **decided: httpOnly cookie** for refresh tokens (safer against XSS than local storage for a PWA).

## 8. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Guests: mobile OTP only |
| 26 Jul 2026 | Members: mobile OTP or Google sign-in, phone remains required core identifier |
| 26 Jul 2026 | Owner/admin: assumed same dual-channel as members — flag if different |
| 26 Jul 2026 | Token lifetime: 15 min access / 30 day refresh |
| 26 Jul 2026 | Session storage: httpOnly cookie |

## 9. Integration with Tenant service (added 26 Jul 2026)

At login and token refresh, this service calls `GET /users/{id}/roles` on the Tenant/White-Label service to fetch the user's `RoleAssignment` (Owner/Branch Manager/Front Desk) and active plan entitlements, embedding both into the issued JWT as claims. See `tenant_whitelabel_management_api_spec.md` Sections 2, 4, and 6 for the full detail — Identity doesn't own role/entitlement data, it just carries it in the token so other services don't need a live lookup per request.

---
*Next: Payment Service, or start handing these two specs (Slot Engine + Identity) to the coding assistant to begin implementation.*
