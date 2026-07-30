# MVP Retrofit Plan (30 Jul 2026)

**Purpose:** Reconcile everything surfaced in today's business discovery against what's already built, and what the previously-drafted `minimal_admin_phase_kickoff_prompt.md` covers vs. misses. That kickoff prompt predates this entire discovery session and is now materially incomplete — this doc replaces it as the source of truth for what's actually left to reach real Basic-tier MVP.

---

## 1. Already built and unaffected

- Slot Engine core (booking, hold/release, concurrency safety, cancellation with tiered refund calculation)
- Identity & Auth (OTP, Google mock, roles/entitlements in JWT)
- Tenant/White-Label core (tenant, branch, subdomain resolution, dynamic manifest, role assignment)
- Payment core (UPI Intent checkout, webhook confirmation, AutoPay subscriptions, tiered refund execution)
- Notification core (channel policy, retry/dead-letter, all event dispatch mechanics)
- PWA shell (tenant resolution, dynamic branding, OTP/Google login, install flow)
- The grace-period sweep mechanism that minimal member handling depends on — no new backend logic needed for the core release-on-no-confirm behavior

## 2. Backend gaps — by service, with reason

### Slot Engine (reopens again)
- `ResourcePool`: add **minimum occupancy** (max already exists as `capacity`)
- New: **minimum booking duration** field
- New: **pricing mode** (flat vs. per-person) + rate — **resolved 30 Jul 2026: a default lives on `ResourcePool`, admin can override per-instance each time they release a guest slot.** So this needs both a permanent field on `ResourcePool` (the default) and an override value captured at release time (likely on `BookingRule` or the specific release action, not a new permanent record).
- New: minimal member assignment endpoint (admin creates one recurring slot for a member)
- New: occupancy-percentage computation, exposed for the low-occupancy alert
- New: an admin action to release a specific freed seat to guest booking

### Tenant Service (reopens again)
- `Branch`: add working days + working hours (flagged back on 30 Jul, still not built)
- New: facilities/about content — branch-level optional, tenant-level default (description, facility list, photo gallery)

### Payment Service (reopens again)
- New: admin-initiated **negotiated booking** — Razorpay Payment Link creation (distinct product from the Checkout SDK used for self-service), reusing the existing webhook-confirmation path
- New: **manual refund override** — admin-entered amount + reason, bypassing the tiered calculation for a specific case

### Notification Service
- New event type: low-occupancy alert to admin (mechanism already exists, just a new event/template)

## 3. Frontend gaps — by app

### Admin web (none of this exists yet — the earlier minimal admin phase kickoff only covered branch/court/booking-rule CRUD)
- Branch working hours config
- Court min/max occupancy + pricing-mode config
- Minimal member assignment screen
- Low-occupancy alert view + manual release action
- Negotiated booking creation (enter details, generate payment link, copy to share)
- Manual refund override screen
- Facilities/about content editor

### Guest/Member PWA
- **The actual guest booking screens were never built** — the cross-check and flow diagram design work happened, but implementation paused when this business-discovery detour started. This is still the single biggest piece of unbuilt guest-facing surface area.
- Member self-confirm-attendance button (reuses the same pattern as guest check-in, not yet wired for members)
- Dedicated "About this branch" page

## 4. What this means for sequencing

The previously-drafted minimal admin kickoff is superseded — it's not wrong, just incomplete against what's now understood. Proposed revised phase breakdown, grouping by what shares a service/dependency rather than by admin-vs-guest:

| Phase | Covers | Why grouped this way |
|---|---|---|
| **Backend batch** | All Slot Engine + Tenant + Payment additions in Section 2, done together | These are all small, independent field/endpoint additions to already-approved services — cheaper to reopen each service once for a batch of related changes than multiple times |
| **Admin web** | Everything in Section 3's admin list | Depends entirely on the backend batch above being done first |
| **Guest booking screens (PWA)** | The actual browse → select → pay → confirm flow, from the cross-check/diagram already designed | Can happen in parallel with Admin web — doesn't depend on it, since guest self-service was always meant to be independent |
| **Member self-confirm + About page (PWA)** | Smaller additions to the PWA | Lowest priority of the four, can trail behind |

## 5. Decisions closed (30 Jul 2026)

- Pricing mode placement: resolved, see Section 2.
- Sequencing: **Backend batch (Slot Engine + Tenant + Payment) goes first**, before Admin web or Guest booking screens — both of those depend on this batch being done.
