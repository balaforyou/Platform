# Business Discovery — Consolidated Session Notes (30 Jul 2026)

**Purpose:** Full traceable record of today's business walkthrough, numbered in order, before any wireframe or implementation work touches these areas. Several items here revise or extend `badminton_app_discovery_brief.md`, the Stage 1 member-group cross-check, and the guest-booking cross-check — reconciliation noted where relevant.

---

## 1. Business Hierarchy

1.1 Owner → Branches → Courts — confirmed as the generic, reusable resource-booking pattern (same shape would apply to hotel rooms, tables, vehicles for any future business on this platform).
1.2 Court **type** (Full / Half) is a physical identity, not just a label — it constrains what's physically possible, not merely a display attribute.
1.3 Occupancy (min/max) is per-court, admin-configurable. Half court: min 2, max 2. Full court: admin sets both bounds (8–10 given as an example, not a fixed rule).
1.4 White-labeling (name, logo, theme) stays tenant-level, already built.

## 2. Branch Configuration

2.1 **Working days + working hours are branch-level** — new, not currently modeled. These should bound which time slots can even be generated for booking.
2.2 **Slot duration stays resource-type level**, not branch-level — keeps the generic cross-business model intact.
2.3 **Minimum booking duration** — a new, separate rule from slot granularity (the shortest span a booking can span).

## 3. Student Training (confirmed as a core revenue stream, not a deferred nice-to-have)

3.1 Training runs per branch.
3.2 **Coach** — a new persona, not currently modeled anywhere. Admin-configurable count; a coach can train across multiple branches (not branch-locked, unlike Front Desk).
3.3 Daily fixed training slot, admin-configurable.
3.4 Max students per batch, admin-configurable.
3.5 Admin marks specific courts (or all) for training — once marked, those slots are a **hard block**: zero guest or member spillover, unlike member group's soft-release behavior.
3.6 No gender-based batches, no 1:1/private coaching for now.
3.7 Monthly fee, subscription-style billing.

## 4. Member Booking

4.1 Ongoing/standing relationship, not a fixed term.
4.2 Hourly slot per workday, admin-decided — matches the existing Stage 1 model.
4.3 **Premium vs. standard slot pricing** — a new pricing dimension (time-of-day-based fee variance), stacking on top of what's already built.
4.4 Fee is charged per slot.
4.5 **A member can hold multiple standing slot assignments** — admin-configurable count, driven by the member requesting more time and admin checking availability. This revises the earlier assumption of one assignment per member.
4.6 Monthly membership fee — existing `Subscription`/AutoPay, unaffected.
4.7 Member cancellation: **manual only**, one month's notice, handled entirely outside the system as business policy — no system logic needed.
4.8 Admin manages all grouping/placement manually — confirmed, no member self-select.

## 5. Guest Booking — Predefined Slots

5.1 Admin predefines which courts/days are open to guest booking; can leave fully open or restrict.
5.2 **Pricing is admin-chosen per release, not fixed.** When admin opens a court to guest booking, they choose a pricing mode — **flat rate** or **per-person** — and set the rate at that moment. Not a permanent property of the court; a decision made fresh each time a slot is released.
5.3 Guest group size: min 2, max up to 10, configurable — may legitimately differ from a member group's occupancy range on the same physical court.
5.4 Payment upfront at booking — existing, built.
5.5 **Cancellation refund: admin can override the tiered calculation on a case-by-case basis.** This is a real, currently-unsupported gap — the system today only executes the automated tiered amount or the fixed 100% `admin_forced` category; there is no path for a human-decided, one-off refund amount.

## 5a. Guest Booking — Negotiated / Manual Bookings (new, not covered in original discovery)

5a.1 A phone-based booking channel, entirely outside self-service: a guest calls in, admin negotiates a price, admin creates the booking on their behalf.
5a.2 **Court availability is still enforced** — can't double-book an already-taken slot — but price and group-size rules can be overridden by admin for this pathway.
5a.3 Payment is collected via a **Razorpay Payment Link** (a standalone link, not the in-app Checkout SDK) — admin generates it, sends it manually via their own WhatsApp. This reuses the existing webhook-confirmation infrastructure as-is, since Razorpay fires the same `payment.captured` event regardless of which product generated the payment — only a new admin-initiated intent-creation path is needed, not a new confirmation mechanism.
5a.4 **Basic tier: fully manual** — admin copies the link and sends it themselves, no system integration.
5a.5 **Premium: automatic sending via an integrated WhatsApp channel** — this is the concrete use case behind the WhatsApp notification-channel item already sitting in `platform_core_reusable_components.md`'s backlog; that generic backlog item and this specific need should be treated as the same piece of work, not built twice.

## 6. Guest Booking — Ad-hoc Slots (tied to live member attendance)

6.1 Attendance confirmation cutoff duration: **Basic tier** = one tenant-wide value (e.g. 2 hours) applied across all courts/slots; **Premium** = configurable per court/slot.
6.2 Low-occupancy alert to admin when confirmed attendance falls below a threshold — **resolved 30 Jul 2026: percentage of court capacity, admin-configurable** (not fixed headcount — a fixed number doesn't scale correctly across half courts vs. full courts of very different sizes). Displayed to admin as both raw count and percentage (e.g. "3/10 confirmed, 30%") for clarity, even though percentage is what the rule itself is based on.
6.3 **Cutoff enforcement is automatic** (hard rule) — unconfirmed seats release exactly at the deadline regardless of whether admin is present.
6.4 **What happens to freed seats is manual in Basic tier** — admin decides whether/how to open them to guest booking.
6.5 **Premium add-on #3 — "Guest Auto-Release":** fully automatic release to guest booking (no admin step), per-court/per-slot configurable cutoffs, guest waitlisting.

## 7. Facilities / About Page

7.1 Tenant-level default banner (name, logo — already built); branch-level facility list + photo gallery is opt-in, defaulting to one tenant-wide banner if a tenant doesn't customize per branch.
7.2 Presented as a **dedicated "About this branch" page** accessible after login, not a persistent banner across every screen — booking screens stay focused on booking.
7.3 Practical note, not urgent: real photo galleries need genuine object storage; current placeholder is a hotlinked test image only.

---

## 8. Configuration Classification (per the framework agreed today)

| Item | Classification |
|---|---|
| Guest self-service booking, payment, webhook confirmation | Hard rule |
| Ad-hoc attendance cutoff enforcement (§6.3) | Hard rule (automatic, non-negotiable timing) |
| What happens to freed ad-hoc seats in Basic tier (§6.4) | Manual |
| Guest cancellation refund (§5.5) | **Guardrail with override** — system computes the tiered default, admin can override with a recorded reason. This is a reclassification worth flagging explicitly: the Payment spec currently treats the tiered result as final, not a default. |
| Admin-forced cancellation (power/rain/maintenance) | Trigger is manual (admin decides to invoke it); outcome is a hard rule (always 100% refund) |
| Member cancellation / notice period (§4.7) | Manual only, no system logic |
| Member and training slot placement | Manual only, admin-driven, no self-select |
| Predefined guest slot toggling (§5.1) | Manual decision to open; once open, the booking flow itself is a hard rule (self-service) |
| Negotiated/manual booking (§5a) | **Guardrail with override** — court availability stays a hard rule (no double-booking), price and group-size become admin discretion |
| WhatsApp payment link sending (§5a.4-5) | Manual in Basic tier; Premium unlocks automatic sending — extends the existing backlog item, not a separate build |

---

## 9. Open items still needing a decision

- ~~Low-occupancy alert metric~~ — **resolved 30 Jul 2026:** percentage of capacity, admin-configurable (§6.2).
- Manual refund override (§5.5, §8): needs actual design — does it need an audit trail, an approval step, a reason field?
- ~~Pricing~~ — **resolved 30 Jul 2026:** guest pricing is admin-chosen (flat or per-person) at time of slot release, not a fixed model (§5.2); member premium-slot pricing is a flat monthly surcharge (§4.3); minimum-group-size affects eligibility only, not price (confirmed).
- Reconciliation pass needed against the existing Stage 1 member-group cross-check and the guest-booking cross-check — several items here (multi-slot members, guest min/max, ad-hoc release, negotiated bookings) directly extend what those documents already cover.

---

## 10. New personas and premium tier, summarized

**New persona:** Coach — branch-flexible, distinct from Owner / Branch Manager / Front Desk / Member / Guest.

**Premium add-ons, now three:**
1. Student attendance (scoped, not yet specced)
2. Tournament hosting (fully specced, parked — `tournament_module_api_spec.md`)
3. Guest Auto-Release (new today) — configurable per-court cutoffs, automatic release, guest waitlisting
