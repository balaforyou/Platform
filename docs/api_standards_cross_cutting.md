# API Standards & Cross-Cutting Concerns (v0)

**Status:** Decided 26 Jul 2026. Applies house-wide across all 5 Basic-tier services.
**Related docs:** All five service specs, `tech_stack_architecture.md`

---

## 1. Principle

Each service (Slot Engine, Identity, Tenant, Payment, Notification) contains only the business logic already in its own spec. Anything true regardless of *which* service is handling a request — response shape, error format, request tracing — is standardized once here, not reinvented per service.

## 2. Standard response envelope

```json
Success: { "data": { ... }, "meta": { ... } }
Error:   { "error": { "code": "string", "message": "string", "details": { ... } } }
```
Applied consistently across all 5 services' endpoints, regardless of which one is responding.

## 3. Standard headers

- **`Idempotency-Key`** — already required on `POST /bookings` (Slot Engine spec); extended house-wide to any state-mutating endpoint across all 5 services, not a one-off convention
- **`X-Request-Id`** — a single ID that follows one logical request across service boundaries (e.g. Slot Engine → Payment → Notification), making it possible to trace what happened across services for a single booking, not just within one

## 4. API versioning

URL-based versioning (`/v1/...`) on every service — simple, explicit, and each spec's "v0 draft" status graduates to a real `/v1` once implementation starts.

## 5. DDoS / edge protection — deferred (26 Jul 2026)

**Decided:** skip Cloud Armor + Load Balancer for MVP, revisit if traffic growth warrants it. Worth knowing this isn't a fully unprotected state in the meantime — Cloud Run sits behind Google's own global front-end infrastructure, which provides baseline abuse/flood protection even without Cloud Armor explicitly configured. What you're deferring specifically is the *customizable* layer (WAF rules, fine-grained rate limiting, IP-based blocking) — reasonable to defer at 3-branch/pre-20-tenant scale, worth revisiting once real traffic or the tenant pipeline scales up.

## 6. Keeping services business-logic-only in practice

- **Shared middleware package** (`packages/shared-middleware` in the monorepo) — JWT verification, error formatting, response enveloping, written once and imported by all 5 services, rather than reimplemented in each
- This is where the OTP-abuse rate-limiting flagged in the Identity spec (Section 4) can also live, applied consistently rather than as a one-off in that single service

---
*Next: the crafted handover plan with checkpoints, now that all house-wide conventions are settled alongside the individual service specs.*
