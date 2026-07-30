# Platform Core — Reusable Components Across Verticals

**Status:** Living document — early discovery.
**Purpose:** Identify what can be built once and shared across independent apps/businesses — starting with (1) the white-labelled badminton court booking business (Coimbatore, multi-tenant) and (2) a separate driver-rental app (different owner/friend's business) — vs. what must be built separately per vertical.
**Related docs:** `badminton_app_discovery_brief.md`, `driver_rental_app_discovery_brief.md`

---

## 1. Principle

Two apps, two owners, two businesses — but both are fundamentally "a user books a unit of capacity for a time window and pays for it." The pieces that don't care *what* is being booked belong in a shared core. The pieces that depend on domain-specific behavior (court check-in vs. live GPS trip tracking) stay in each app.

## 2. Reusable — Platform Core

### 2.1 Identity & Auth Service
- Mobile OTP + email login, tenant-scoped (a user's identity is namespaced per tenant/app unless explicit SSO is wanted later)
- Provider: MSG91 for OTP (India-optimized, proven at scale, INR billing)
- Same service handles both apps — just configured per tenant/app for which channels are enabled

### 2.2 Tenant & White-Label Management
- Tenant record: business name, branding (logo, color theme, app name), subdomain, contact/billing info
- Dynamic `manifest.json` generation per tenant for PWA install (own icon/name on the user's home screen)
- Applies directly to the badminton white-label rollout (each Coimbatore court business = one tenant); the driver app can either be modeled as its own tenant (different owner) or, if it's ever white-labelled to other drivers-for-hire businesses later, reuse this same mechanism

### 2.3 Payment & Billing Service
- Gateway integration (Razorpay direction, per earlier decision), UPI Intent flow for one-time payments, UPI AutoPay for recurring
- Wallet/ledger primitives (for cancellation credits, refunds) — needed by badminton (guest cancellation policy) and useful for driver (fare adjustments, cancellation charges)
- **Cancellation policy engine is reusable as-is** (added 26 Jul 2026): the tiered, tenant-configurable schema decided for badminton (`{type: "tiered", tiers: [{min_hours_before_slot, refund_percent}, ...]}`, full detail in `payment_service_api_spec.md` Section 5) is entirely payment-amount-agnostic — it just maps time-before-slot to a refund percentage. It applies directly to the driver app's pre-scheduled hire cancellations with no changes; only the fare amount it's a percentage *of* is driver-specific.
- Fare/pricing calculation is **not** shared — badminton uses flat slot pricing, driver needs distance/time-based fare — but both plug into the same payment execution layer

### 2.4 Notification Service
- SMS, push, and email dispatch — booking confirmations, reminders, OTP, group-booking invites (badminton), trip status updates (driver)
- Single provider integration (MSG91 + a push provider e.g. FCM), reused by both apps with different message templates

### 2.5 Base Resource & Slot Engine
- Generic model: `ResourcePool` (with `allocation_mode: FIXED_INSTANCE | POOLED`), `AvailabilityWindow`, `Booking`
- Directly reusable for: badminton courts (`FIXED_INSTANCE`), classrooms/yoga (`FIXED_INSTANCE`, capacity>1), **and** the driver app's pre-scheduled hire model (`POOLED`)
- **Not** sufficient alone for on-demand dispatch — see 3.2 below

### 2.6 Admin Console Framework
- A generic desktop-web shell (auth, navigation, tenant/branch/resource CRUD, reporting widgets) that each vertical's admin panel is built on top of, rather than two unrelated admin apps
- Badminton: courts, branches, rule config. Driver: driver roster, vehicle fleet, zones — different data, same shell/patterns

## 3. NOT Reusable — Vertical-Specific

### 3.1 Badminton-specific
- Member subscription model, training-hours blocks, court QR check-in, guest group-booking flow
- (Full detail in `badminton_app_discovery_brief.md`)

### 3.2 Driver-app-specific (the bigger divergence)
- **On-demand dispatch/matching engine** — real-time nearest-driver matching, accept/reject/timeout/reassign logic
- **Live GPS tracking** — driver-side location pinging, rider-facing live map, Google Maps SDK integration and its ongoing per-trip API cost
- **Trip lifecycle state machine** — requested → matched → en route → ongoing → completed → rated, distinct from a simple booking `confirmed/checked-in/no-show` status
- **Distance/time-based fare engine** — dynamic pricing, surge logic if wanted, vs. badminton's flat per-slot price
- **A separate driver-side app** — the resource (driver) is also an active app user, unlike a badminton court which has no app of its own

## 4. Suggested Build Sequencing

Since these are two separate businesses/owners, they likely won't be built by the same team at the same time — but if the badminton platform core is built first, the driver app can bootstrap significant time by reusing Sections 2.1–2.4 and 2.6 as-is, building only 2.5's `POOLED` mode extensions plus the entirely new 3.2 dispatch subsystem.

**Decided (26 Jul 2026):** Separate codebases per app — no shared runtime/deployment between the badminton app and the driver app. Reuse happens through **independent backend services with clean APIs** (Identity, Payment, Notification, Slot/Resource Engine, Admin shell) that any app's backend calls over an API, regardless of that app's own tech stack. This avoids forcing every future app onto the same language/framework while still avoiding rebuilding the same logic each time — the reusable unit is the *service*, not shared source code.

## 5. Build priority order (badminton launch)

| Priority | Component | Why first/later |
|---|---|---|
| 1 | Slot/Resource Engine | The foundation — nothing else works without it. Spec: `slot_resource_engine_api_spec.md` |
| 2 | Identity & Auth Service | Needed immediately alongside it — no booking without login. Spec: `identity_auth_service_api_spec.md` |
| 3 | Tenant/White-Label Management | **Re-prioritized 26 Jul 2026** — see note below. No longer deferrable. |
| 4 | Payment Service | Needed for MVP launch (prepayment is core to the no-show fix). |
| 5 | Notification Service | **Specced 26 Jul 2026** — `notification_service_api_spec.md`. All five Basic-tier components now have complete specs. |
| — | Admin Console Framework | Start as badminton's own admin panel; abstract into a reusable shell once the driver app actually needs one. |
| — | Tournament module | **Parked (26 Jul 2026)** — reclassified as Premium add-on #2, not part of Basic-tier launch. Spec is complete and stable (`tournament_module_api_spec.md`) whenever picked back up. |
| — | Student attendance | **New, unspecced (26 Jul 2026)** — Premium add-on #1, ahead of Tournament in the premium sequence. Needs its own discovery session once Basic is underway. |

**Why Tenant/White-Label moved up:** the badminton owner has a **committed pipeline of ~20 more Coimbatore court-owning customers** post-launch. This was previously treated as a "generalize once you have a second tenant" concern — with 20 committed, it needs to be built correctly from day one rather than hardcoded for tenant #1 and retrofitted under onboarding pressure.

## 6. Backlog / Phase 2+ candidates (not in current specs)

Surfaced during a second brainstorming sweep (26 Jul 2026) — logged for later, not scoped into any current service spec:

- **WhatsApp as a customer notification channel** — alongside SMS/push/email on the Notification Service. High India-market relevance given near-universal WhatsApp adoption; would extend the channel-policy matrix already designed in `notification_service_api_spec.md` Section 5.
- **Telegram as an internal staff/ops channel** — *not* a customer-facing channel (Telegram's Indian user base doesn't match WhatsApp's reach for this use case) — instead, real-time alerts to branch managers/staff (maintenance flags, no-show spikes, system issues) via a free Telegram bot, separate from the guest/member notification stack.
- **No-show pattern flagging** — surfacing guests/members with repeated no-shows to admins, distinct from the per-booking cancellation refund logic already specced. Touches both the Slot Engine (booking history) and Notification Service (alerting staff) — cross-cutting, not owned by a single service as currently scoped.

---
*Compiled from ongoing discovery conversation. Update as decisions are made.*

## 7. Confirmed generic patterns (from badminton business discovery, 30 Jul 2026)

Today's deep business walkthrough for badminton surfaced several patterns worth explicitly separating into **platform-level, cross-business concepts** vs. **badminton-tuned specifics**. This section exists specifically so the driver-rental discovery (next thread) starts from what's already proven reusable, rather than re-deriving it — and so it's clear which numbers/rules are badminton's own and shouldn't be assumed to transfer.

### 7.1 Confirmed generic — reusable as structural patterns

- **Owner → Branch → Resource hierarchy**, with resources having a **physical/typed identity that bounds (but doesn't fully fix) admin-configurable min/max capacity** — e.g. badminton's full/half court is one instance of "resource type constrains, admin tunes within it." A vehicle class or hotel room type would follow the same shape.
- **Two pricing modes, chosen per booking-release, not fixed platform-wide**: flat rate vs. per-unit (per-person for badminton) — the *choice itself* being admin-configurable at the moment of releasing a bookable slot is the generic insight, not the specific badminton numbers.
- **Tiered-default-with-manual-override for cancellation/refund** — system computes a sensible default, admin can override with discretion on a case-by-case basis. This is a first-class generic pattern (see 7.3), not a badminton-only refund rule.
- **Percentage-of-capacity, not fixed headcount, for occupancy-based alerting** — a fixed number breaks across resources of different sizes; percentage scales correctly regardless of vertical.
- **Recurring assignment → self-confirm before a cutoff → automatic release to general availability** — the core member-group mechanism (admin assigns a standing slot, participant confirms attendance, unclaimed capacity releases automatically at a deadline) is a generic subscription-resource-sharing pattern, not specific to court sports. The *exact* cutoff durations, group sizes, and alert thresholds are badminton-tuned and should be treated as configuration, not assumed defaults, for any new vertical.
- **Roving staff role** — badminton's Coach (branch-flexible, not locked to one branch) is a generic RBAC shape: a staff role whose scope spans multiple branches rather than being pinned to one. Worth checking whether driver-rental has an equivalent (e.g. a dispatcher or supervisor covering multiple zones).
- **Admin-initiated booking on someone's behalf, reusing the same payment-confirmation webhook infrastructure** — badminton's negotiated/manual booking (phone call-in → admin creates booking → Razorpay Payment Link → same webhook confirms) is a generically useful escape hatch for any business with a human-mediated sales channel alongside self-service.
- **Hard block vs. soft release** as two distinct resource-reservation behaviors — training slots (hard block, zero spillover) vs. member group slots (soft release, unclaimed capacity flows back to general availability) are genuinely different mechanisms, not degrees of the same one. Worth checking explicitly which behavior any new resource type in a new vertical actually needs.

### 7.2 Badminton-specific — do not assume these transfer

- Exact occupancy numbers (2 for half court, 8-10 for full court), exact cutoff durations (2 hours), exact group size bounds (guest 2-10) — all admin-configurable *values*, not platform defaults suitable for another vertical.
- The specific tiering decision (member handling minimal-in-Basic, full management as Premium #1) reflects badminton's own build-order and complexity trade-offs — a new vertical starts its own tiering conversation from scratch, not by copying this one.
- Coach/training-batch specifics (no gender-based batches, no 1:1 coaching, monthly fee shape) are badminton's own business rules.

### 7.3 The classification framework itself — the most reusable artifact from today

Beyond any specific pattern, today's discovery produced a general design principle worth carrying into every future vertical's admin-experience design, independent of domain:

| Classification | Meaning |
|---|---|
| **Hard rule** | No override, ever — used where certainty/speed matter (self-service booking, payment, automated confirmation) |
| **Guardrail with override** | System computes a sensible default, admin can override with a recorded reason — used where the relationship/judgment matters (refund exceptions, reallocation) |
| **Manual only** | System doesn't compute or enforce anything — pure admin/business-policy territory (e.g. membership cancellation notice periods) |

This framework exists because the badminton owner's business is explicitly human-relationship-driven, and hard-coding every judgment call would make the software fight the actual business rather than support it. Worth applying this same classification pass early in any new vertical's discovery — including driver-rental — rather than discovering the need for it mid-build the way badminton did.

