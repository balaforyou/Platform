# Driver Rental App — Business Discovery Brief (v0)

**Status:** Living document — very early discovery, separate business/owner from the badminton app.
**Related doc:** `platform_core_reusable_components.md` — for what this app can reuse vs. build fresh.

---

## 1. Scope decided so far

- **Both models needed at launch:** pre-scheduled hire (book a driver ahead of time, like reserving a slot) **and** full on-demand dispatch (request now, matched live — like ride-hailing).
- On-demand is confirmed as a **launch requirement**, not a later phase — this is the significant scope driver for this app (see Section 3 of the Platform Core doc: dispatch, live GPS, fare engine, and a driver-side app are all net-new builds, not reused from the badminton core).

## 2. Still to establish (next discovery session)

- **Problem statement** — what specifically is broken in how this business runs driver bookings today (manual/phone-based? another app?), mirroring how the badminton discovery started
- **Personas** — rider/customer, driver, business owner/admin, and how each interacts with the app
- Is this **hire-a-driver-for-your-own-car** (driver only) or **car + driver** (vehicle rental bundled in)?
- Service area — one city, multiple cities/zones?
- Fleet/driver pool size and how drivers are onboarded (employees vs. gig/independent contractors — affects payout model)
- Fare model — flat zone pricing, distance/time metered, surge/dynamic pricing?
- Cancellation policy — for both rider-side and driver-side cancellations
- Driver-side app requirements — availability toggle, trip accept/reject, navigation, earnings view
- Payment — same Razorpay direction reusable from the core, but need to confirm payout-to-driver flow (this app needs a payout/settlement leg the badminton app doesn't)
- Trip safety features — live trip sharing, SOS, driver verification/KYC (likely needed given it's transportation, not court booking)

## 3. What this app reuses from Platform Core (see full detail there)

- Identity/Auth (mobile OTP + email)
- Payment execution layer (Razorpay/UPI Intent) — fare *calculation* is new, but payment *execution* is shared
- Notification service (SMS/push/email)
- Admin console framework (shell only — driver/fleet data is new)
- Base resource/slot engine — **only for the pre-scheduled hire path**; on-demand needs the new dispatch subsystem

## 4. What's net-new for this app

- On-demand dispatch/matching engine
- Live GPS tracking (rider + driver side)
- Trip lifecycle state machine
- Distance/time-based fare engine
- Separate driver-side app
- Driver payout/settlement flow
- KYC/driver verification, trip safety features

---
*This brief is intentionally thin — it starts once your friend (the business owner) is ready for a proper discovery session, following the same structure used for the badminton brief: problem statement → personas → success metrics → business rules → MVP scope.*
