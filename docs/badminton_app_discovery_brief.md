# Multi-Branch Sports Booking Platform — Business Discovery Brief (v2)

**Status:** Living document — reconciled 30 Jul 2026 against `business_discovery_session2_consolidated.md` (a full second business-discovery session). This is now the single current source of truth; the consolidated session notes remain as historical record but should not be read as a second, independent set of rules — everything from that session is folded in below.
**Owner context:** 3 branches, ~12.5 badminton courts, plans to extend to yoga/other session types.

---

## 1. Problem Statement

Two revenue-leaking problems, currently unsolved by manual process and 3rd-party apps:

1. **Guest bookings via phone calls** — no payment lock-in, high no-show rate, and reliance on external apps (e.g. Playo) that charge commission per booking.
2. **Member attendance via WhatsApp** — unreliable confirmation, so courts reserved for members who don't show stay blocked and can't be resold to guests (dead inventory).

## 2. Vision

One unified booking + attendance platform (mobile + desktop admin) across all 3 branches, built on a **generic slot/resource engine** — so badminton courts today and yoga rooms (or any other bookable resource) tomorrow run on the same system, differentiated only by configuration, not by rebuilding the app.

## 3. Personas & Core Jobs-to-be-Done

| Persona | Need |
|---|---|
| Owner | Cross-branch revenue & utilization visibility; zero commission bookings |
| Branch front desk | Manual override/check-in for edge cases and app-averse users |
| Member | Frictionless daily attendance confirmation without losing their slot |
| Guest | Discover, pay, and book instantly without a phone call |
| Coach (added 30 Jul 2026, Premium #2) | Run training batches; branch-flexible, not locked to one branch like front desk |

## 4. Success Metrics

- Commission paid to 3rd-party apps → target ₹0
- Guest no-show rate (confirmed payment, no check-in) → target <5%
- Member-slot reclaim rate (unclaimed slots successfully resold to guests) → target >80%
- Court utilization % (booked-hours ÷ available-hours), tracked per branch/court
- Time for owner to pull cross-branch report → real-time dashboard, no manual reconciliation

## 5. Generic Engine — Data Model Concept

> Note (26 Jul 2026): the generic engine is now being built as a shared **Platform Core** reused across this badminton business and a separate driver-rental app (different business/owner) — see `platform_core_reusable_components.md`. This document (badminton brief) now sits as one **Tenant** on top of that shared core, white-labelled for individual court-owning businesses across Coimbatore.

```
Tenant (a white-labelled client business — e.g. this badminton business is Tenant #1)
 └─ Branch (1..3 for this tenant; other tenants configure their own)
      └─ Resource (court_1, court_2, yoga_room_1, ...)
           └─ ResourceType (badminton_court / yoga_room / pt_slot)
                - capacity (1 for a court, N for a class)
                - default slot_duration (60 min)
                - allocation_mode: FIXED_INSTANCE (courts/rooms are named, specific instances)

Slot (resource_id, date, start_time, end_time, status)

BookingRule (per resource_type + branch)
 - member_window (recurring subscription logic)
 - guest_open_window (when/how a slot opens to guest booking)
 - grace_period (minutes before auto-release if member unconfirmed)
 - cancellation/refund policy
 - prepayment_required (bool)

BlockedWindow (branch, resource(s), recurring days/times, reason)
 - e.g. per-branch "training hours" — no member or guest booking allowed

Booking (slot_id, user_id, user_type[member/guest], payment_status, checkin_status)
```

This lets new resource types (yoga, PT, etc.) be added later as configuration, not new development. Shared components (identity/login, payments, notifications, the base resource/slot engine, tenant/white-label management) live in the Platform Core doc; badminton-specific rules (training-hours blocks, member subscription model, court QR check-in) stay in this document.

## 6. Confirmed Business Rules (from discovery so far)

### 6.1 Member attendance confirmation — two-channel
~~Geofence auto-check-in~~ **dropped** (decided 26 Jul 2026) — unreliable in a PWA, especially on iOS, which has no background geofencing API outside a native app. Since the platform is going PWA-only (see 6.5), attendance confirmation relies on:
1. **App tap "I'm coming"** — primary path, push reminder before slot; sets `confirmed`
2. **Front desk manual mark** — fallback for non-smartphone or app-averse members

If neither fires by the grace deadline (exact minutes TBD), the slot auto-releases to guest booking.

Reporting should distinguish: *confirmed via app but didn't arrive* (true no-show) vs. *never confirmed, released* (disengagement signal) — useful for the owner to spot behavior patterns.

### 6.2 Member slot model — revised 30 Jul 2026

**Superseded:** the original description ("auto-generated for the month") described a batch-generation mechanism that was never actually built — the Stage 1 cross-check (`member_group_crosscheck.md`, Finding D) found no such mechanism existed anywhere in the system, only in this document's phrasing.

**Current model:** a fixed recurring slot (same court, same 1-hour clock time, Mon–Sat), but the daily booking record is created **lazily**, by whichever of three triggers fires first for that day: the member tapping "I'm coming" in-app, front desk manually checking them in, or the grace-period sweep running past the cutoff with nothing confirmed (which creates the record and immediately marks it released). No pre-generated rows, no separate cleanup needed when a subscription lapses — a suspended `Subscription` simply means nothing gets created going forward.

**Multi-slot (new, 30 Jul 2026):** a member can hold more than one standing slot assignment — admin-configurable how many, driven by the member requesting more time and admin checking court availability before agreeing. This is a Premium-tier capability (see Section 8a); Basic tier limits a member to one recurring slot.

**Court occupancy is per-court, not per-member-slot:** each court has an admin-configurable min/max occupancy — physically bounded by court type (half court: min 2, max 2; full court: admin sets both bounds, 8–10 typical) — so a "member slot" on a full court may itself represent a group of members sharing that hour, not one person.

### 6.3 Student Training — revised 30 Jul 2026, confirmed core revenue (not deferred)

**Superseded:** the original framing ("branch-specific training-hours block") only described the *blocking* mechanism, not the underlying business. Student Training is now understood as a full, separate business line — scoped as Premium #2 (Section 8a), not part of the original MVP's basic blocking concept.

- Training runs per branch, staffed by **Coach** — a new persona, branch-flexible (a coach can train across multiple branches, unlike front desk staff who are branch-locked)
- Admin-configurable number of coaches
- Daily fixed training slot per batch, admin-configurable
- Admin-configurable max students per batch
- Admin marks specific courts (or all courts at a branch) for training — once marked, that window is a **hard block**: zero guest or member spillover, unlike a member group's soft-release behavior where an unclaimed seat can flow back to guest availability
- No gender-based batches, no 1:1/private coaching, for now
- Monthly fee, subscription-style billing

The underlying blocking mechanism itself (a recurring closed window per branch/court, benchmarked ~3 hrs in the evening today) is unchanged from the original `BlockedWindow` concept — what's revised is recognizing the business around it as a real, substantial feature rather than just a scheduling constraint.

### 6.4 Guest payment model
Full prepayment required to confirm a booking (no more call-and-hold), via UPI Intent flow (see 6.7).

### 6.5 Platform mode (decided 26 Jul 2026)
- **Guests & Members:** PWA (Progressive Web App) — single web-based codebase, installable to home screen, no app-store friction/approval delays, works across Android and iOS.
- **Owner & Branch Admin:** Laptop/desktop-only responsive web app — no mobile app needed for this persona.
- Trade-off accepted: no native background geofencing for members (see 6.1).

### 6.6 Login mode & group booking
- **Guests & Members:** mobile-number + OTP login only, no email/password.
- **Group booking:** the booker adds co-players by mobile number at booking time (or after). Each added number gets an SMS with booking details, plus an app link if they're not yet users. The court slot remains **one booking record** with multiple attached players — not separate slot-holders — so it fits the existing generic `Booking` model without a schema change.
- Payment stays with the booker (single payer for the group) for MVP; split-payment across players deferred to Phase 2 due to added complexity (partial payments, chase-ups).
- **OTP provider:** MSG91 recommended over Firebase Phone Auth — India-focused (already powers Razorpay, Zomato, Swiggy at scale), INR billing, lower cost per OTP, local support.

### 6.7 Payment gateway (leaning Razorpay, pending final quote)
| | Razorpay | Cashfree |
|---|---|---|
| Domestic fee | ~2% + GST | ~1.75% + GST, but ₹4,999/yr AMC |
| Setup/AMC | Zero | AMC applies |
| UPI AutoPay (member subscriptions) | Mature product, Smart Intent flow, handles mandate lifecycle end-to-end | Growing, less mature |
| UPI Intent flow (guest one-time payments) | Built into standard Checkout, supports iOS, per-app targeting | Supported but needs manual webview/URL-scheme wiring, flag must be enabled by support |

**UPI Intent flow** — the "auto-opens GPay/PhonePe with amount pre-filled" experience — works in mobile web/PWA on both Android and iOS (falls back to QR on desktop), so it's fully compatible with the PWA-only decision in 6.5. This also powers the member subscription auto-debit via UPI AutoPay's Intent flow. Razorpay's more turnkey support for both flows (vs. Cashfree's extra integration lift) is currently the deciding factor — final call still pending a live quote from both at expected volume.

### 6.8 Business hierarchy & court occupancy — added 30 Jul 2026
Owner → Branch → Court is confirmed as the generic, reusable resource pattern (see Section 5). Court **type** (Full / Half) is a physical identity, not just a display label — it constrains what's physically possible. Occupancy (min/max) is per-court, admin-configurable within those physical bounds: half court min 2, max 2; full court, admin sets both bounds (8–10 given as a typical example, not a fixed rule).

### 6.9 Branch working hours — added 30 Jul 2026, new field
Working days + working hours are branch-level — not currently modeled anywhere in the built system. These should bound which time slots can even be generated for booking at that branch. Slot *duration* stays at the resource-type level, not branch-level, to keep the generic cross-business model intact. Minimum booking duration is a separate new rule from slot granularity.

### 6.10 Guest & member pricing — added 30 Jul 2026
- **Guest pricing is admin-chosen at the moment of release, not fixed.** When admin opens a court to guest booking, they choose a pricing mode — flat rate or per-person — and set the rate right then. A default lives on the court (`ResourcePool`), but admin can override both mode and rate per release.
- **Member premium-slot pricing:** a flat monthly surcharge above the base subscription fee, for slots admin designates as "premium" (time-of-day-based), decided on demand.
- Minimum-group-size rules affect **eligibility only** (can't book below the minimum), not the price itself.

### 6.11 Negotiated / manual bookings — added 30 Jul 2026, new Basic-tier capability
A phone-based booking channel outside self-service: a guest calls in, admin negotiates a price, admin creates the booking on their behalf. Court availability is still enforced (no double-booking), but price and group-size rules can be overridden by admin for this pathway. Payment is collected via a standalone Razorpay Payment Link — admin generates it and sends it manually via their own WhatsApp (Basic tier); automatic sending via an integrated WhatsApp channel is a Premium capability, reusing the same WhatsApp notification-channel backlog item already logged in `platform_core_reusable_components.md`.

### 6.12 Ad-hoc guest access (tied to live member attendance) — added 30 Jul 2026
Distinct from predefined guest slots (6.4) — this ties guest access to real-time member no-shows:
- Attendance confirmation cutoff: Basic tier = one tenant-wide value (e.g. 2 hours before slot) applied across all courts; Premium = configurable per court/slot. **This is a different mechanism from the 30-minute member check-in grace period in 6.1** — the grace period governs whether an individual member's seat is marked released; this cutoff governs whether admin gets an alert and the option to open that freed capacity to guests.
- Low-occupancy alert: percentage of court capacity, admin-configurable threshold (not fixed headcount — a fixed number doesn't scale correctly across half courts vs. full courts of very different sizes). Displayed to admin as both raw count and percentage.
- Cutoff enforcement is automatic (hard rule); what happens to freed seats is manual admin decision in Basic tier.
- Premium #1 (see Section 8a) makes the release itself fully automatic, with configurable per-court cutoffs and guest waitlisting.

### 6.13 Facilities / About page — added 30 Jul 2026
Tenant-level default banner (name, logo — already built); branch-level facility list + photo gallery is opt-in, defaulting to the tenant-wide banner if a branch doesn't customize. Presented as a dedicated "About this branch" page accessible after login, not a persistent banner across every screen. Real photo galleries need genuine object storage eventually — current placeholder is a hotlinked test image only.

### 6.14 Configuration classification framework — added 30 Jul 2026
A general design principle for the whole admin experience, not a single rule: every admin-facing behavior is classified as a **hard rule** (no override — self-service booking, payment, webhook confirmation), a **guardrail with override** (system computes a sensible default, admin can override with a recorded reason — e.g. guest cancellation refund, negotiated bookings), or **manual only** (system computes/enforces nothing — e.g. member cancellation notice periods). This exists because the business is explicitly human-relationship-driven; hard-coding every judgment call would fight the actual business rather than support it. Full classification table in `business_discovery_session2_consolidated.md` Section 8.

## 7. Guest Cancellation / No-Show Policy — resolved (26 Jul 2026)

**Decided:** tiered refund with a flat no-refund zone once close to slot time, thresholds tenant-configurable rather than hardcoded (matches the multi-tenant white-label model — each of the pipeline customers can set their own). Default seed values and full schema live in `payment_service_api_spec.md` Section 5.

## 8. MVP Scope — revised 30 Jul 2026, see Section 8a for the authoritative tier breakdown

**Superseded:** this section's original list (QR/code check-in, Owner dashboard, and Front-desk override screen as Basic must-haves) no longer matches the revised tiering. Corrected below; **Section 8a is the source of truth for what's actually in Basic vs. Premium** — this section is kept as a narrative summary, not a competing scope definition.

**Basic tier, current:**
- Multi-branch resource + rule configuration (desktop admin web panel) — including branch working hours (6.9), court occupancy (6.8), pricing mode (6.10)
- Guest PWA: mobile-OTP login → browse → add group players by mobile number → prepay via UPI Intent → confirmed booking → **self-serve "I'm here" check-in button** (not QR/scanner — that would need the front-desk screen this tier doesn't include, see Finding E in `member_group_crosscheck.md`)
- Negotiated/manual bookings (6.11)
- Minimal member handling: one recurring slot per member, self-confirm, automatic cutoff-release, simple low-occupancy alert, manual admin release decision (6.12)

**Deferred out of Basic** (moved to Premium #1, Section 8a): Owner dashboard, front-desk override screen, occupancy dashboard, member reallocation, multi-slot members, premium-slot pricing, fully automatic guest release, guest waitlisting.

**Premium #2/#3:** Yoga/other session types as new ResourceType (no new app needed), Student Training (6.3), Tournament hosting.

**Rollout note:** Build the generic engine once, but consider staggering the 3 branches' go-live by a week or two each, to absorb staff-training and member-adoption issues before all locations run live simultaneously.

## 8a. Product tiering (decided 26 Jul 2026, revised 30 Jul 2026)

The build order now maps directly to a packaging/pricing structure, since this product is going to ~20 more customers, not just internal use.

**Revised 30 Jul 2026:** the original split ("member handling fully in Basic") is superseded. Member Group Management turned out to be substantially more complex than originally scoped (see `member_group_crosscheck.md` and `business_discovery_session2_consolidated.md`) — full occupancy dashboards, multi-slot members, premium-slot pricing, and admin reallocation are genuinely premium-tier work. But leaving Basic with *zero* member handling would leave one of the two founding business problems (member no-shows blocking courts from guests) completely unsolved for Basic customers — so a deliberately minimal slice stays in Basic, solving the core problem without the full feature set.

| Tier | Scope |
|---|---|
| **Basic** | Guest booking (predefined slots: browse → pay → confirm), tiered cancellation with admin manual-override, negotiated/manual bookings (phone call-in, admin-created, Razorpay Payment Link sent manually via WhatsApp). **Minimal member handling**: admin assigns a member to one recurring slot, member self-confirms attendance via app, automatic cutoff-release on no-confirmation (reuses the Slot Engine grace-period sweep already built), simple low-occupancy alert, admin manually decides whether to open a freed seat to guest booking. No dashboard, no multi-slot, no premium-slot pricing, no reallocation tooling. |
| **Premium #1: Full Member Management + Guest Auto-Release** | Live occupancy dashboard across groups/branches, multi-slot-per-member (admin-configurable count), premium-slot fee surcharges, admin reallocation workflow (move members between courts on low occupancy). Paired with fully automatic guest release (no admin step at cutoff), per-court configurable cutoff durations, and guest waitlisting. |
| **Premium #2: Student attendance** | Not yet specced. Coaching/academy training batches — new `Coach` persona (branch-flexible, not branch-locked), admin-configurable coach count and batch size, daily fixed training slots that hard-block courts (no guest/member spillover, unlike member group's soft release). Monthly fee. |
| **Premium #3: Tournament hosting** | Fully specced already — parked. See `tournament_module_api_spec.md`. Builds on the Slot Engine's `BlockedWindow` + `Booking` primitives. |

This also means the Basic-tier components (Slot Engine, Identity, Tenant/White-label, Payment, Notification — see `platform_core_reusable_components.md` Section 5) plus a small new admin surface (minimal member assignment, negotiated bookings) are what need to be production-ready to start onboarding the 20-customer pipeline. All three premium tiers can follow once Basic is proven with the first tenant.

## 9. Still Open / To Discover Next — cleaned up 30 Jul 2026

**Resolved, removed from this list:**
- ~~Tech stack for the PWA + admin web~~ — fully resolved and built: `tech_stack_architecture.md`, `frontend_stack_architecture.md`, multiple approved implementation phases
- ~~Final payment gateway confirmation~~ — effectively decided through implementation: every backend phase built specifically against Razorpay's UPI Intent/AutoPay/Payment Links; no live comparison quote was formally done, but reopening this now would mean redoing real, working, tested infrastructure

**Two distinct time-based mechanisms, worth not confusing with each other:**
- **Member check-in grace period** (6.1): 30 min before slot start — governs whether an individual member's own seat gets marked released
- **Ad-hoc guest-access cutoff** (6.12): Basic tier default ~2 hours before slot — governs when admin gets a low-occupancy alert and the option to open freed capacity to guests. These are different mechanisms for different purposes, not two names for the same thing.

**Still genuinely open:**
- Per-branch training-hours block timings (actual data)
- Split-payment for group bookings (deferred to Phase 2 — confirm)
- Staff training/rollout plan per branch
- Member onboarding — how existing WhatsApp-based members migrate to the app
- Manual refund override design (`business_discovery_session2_consolidated.md` §9) — audit trail, approval step, reason field, not yet specified
- Exact percentage threshold default for the low-occupancy alert (6.12) — mechanism is decided, the actual default number isn't

## 10. Decision Log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Platform: PWA for guests & members; desktop-only web for owner/admin |
| 26 Jul 2026 | Geofence check-in dropped; attendance = app-tap + front-desk only |
| 26 Jul 2026 | Login: mobile OTP only, no email/password; group bookings via added mobile numbers on one booking record |
| 26 Jul 2026 | OTP provider direction: MSG91 |
| 26 Jul 2026 | Payment: leaning Razorpay for UPI Intent + AutoPay maturity, pending final quote vs Cashfree |
| 30 Jul 2026 | Member slot generation is lazy (trigger-based), not batch — corrects a mechanism this doc had described but that was never built |
| 30 Jul 2026 | Member multi-slot capability moved to Premium #1; Basic stays one slot per member |
| 30 Jul 2026 | Student Training confirmed as Premium #2, a full business line, not just a blocking rule |
| 30 Jul 2026 | Guest check-in for Basic tier: self-serve app button, not QR/scanner (avoids front-desk-screen scope conflict) |
| 30 Jul 2026 | Guest pricing: admin-chosen flat/per-person mode + rate, set per release, default on the court |
| 30 Jul 2026 | Negotiated/manual bookings added to Basic tier (Razorpay Payment Link, manual WhatsApp send) |
| 30 Jul 2026 | Low-occupancy alert metric: percentage of capacity, not fixed headcount |
| 30 Jul 2026 | This document reconciled against `business_discovery_session2_consolidated.md` as the single current source of truth |

---
*Compiled from ongoing discovery conversation. Update this document as each open item gets resolved.*
