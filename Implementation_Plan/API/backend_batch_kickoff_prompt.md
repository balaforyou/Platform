Read docs/coding_assistant_handover_plan.md, docs/mvp_retrofit_plan.md, docs/badminton_app_discovery_brief.md (reconciled 30 Jul 2026 — this is now the primary business-rules reference, supersedes business_discovery_session2_consolidated.md where they overlap), and docs/badminton_booking_flow.drawio before planning anything. Also review the current state of services/slot-engine, services/tenant-management, and services/payment directly — this phase reopens all three.

All prior phases (0-5 backend, PWA shell) are complete and approved. This phase is a backend batch — Slot Engine, Tenant, and Payment additions needed to reach real Basic-tier MVP, per the retrofit plan. Grouped together because reopening each service once for a batch of related changes is cheaper than three separate reopenings.

Same working agreement as every previous phase — comments on non-trivial logic, flag trade-offs explicitly, stop and ask on anything the docs don't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

Given the size of this batch, structure your plan artifact in clearly separated sections by service (Slot Engine / Tenant / Payment / Notification), so I can review each section distinctly rather than as one undifferentiated block.

## One clarification worth reading before you design the Slot Engine section

The discovery brief (Section 6.12) explicitly distinguishes **two separate time-based mechanisms that must not be conflated into one field**:
- The existing member check-in **grace period** (`gracePeriodMinutes`, 30 min default) — governs whether one specific member's own seat gets marked released
- A **new, separate ad-hoc guest-access cutoff** (Basic tier: one tenant-wide default, e.g. 2 hours before slot) — governs when the low-occupancy alert fires and admin gets the option to release freed capacity to guests

These need to be two distinct configuration values, not the same field reused for both purposes — state in your plan where the new cutoff value lives (likely a new tenant-level or `BookingRule`-level field, your call, just don't default to reusing `gracePeriodMinutes`).

## Slot Engine additions

1. `ResourcePool`: add minimum occupancy (max already exists as `capacity`)
2. New: minimum booking duration field
3. `ResourcePool`: add `pricingMode` (FLAT | PER_PERSON) and a default rate — this is the **default**. Admin can override both when releasing a specific guest slot; design where that override value is captured (likely on `BookingRule` or the release action itself, your call, state it in the plan) — it should NOT silently fall back to the default if an override was set.
4. **New entity needed: a standing member-group assignment record.** Nothing currently exists to represent "this member has a recurring slot in this group" — the lazy booking-generation model we already decided (member taps confirm / front-desk checks in / grace-period sweep — whichever happens first creates the day's real `Booking` row) depends on a source-of-truth record to know *who* is even assigned to *which* group in the first place. For Basic tier this should be simple: one active assignment per member (userId, resourcePoolId, recurring time pattern, status). Confirm your design in the plan before implementing — this is a genuinely new entity, not a field addition.
5. New: occupancy-percentage computation, exposed via an endpoint (extends the resource-pool listing endpoint from the earlier admin phase work)
6. New: an endpoint for admin to explicitly release a specific freed capacity to guest booking

## Tenant Service additions

7. `Branch`: working days + working hours
8. New: facilities/about content — branch-level optional (description, facility list, photo array), tenant-level default if a branch doesn't customize

## Payment Service additions

9. New: admin-initiated negotiated booking — generate a **Razorpay Payment Link** (a distinct product from the Checkout SDK used in self-service guest booking), reusing the existing webhook-confirmation path so no new confirmation mechanism is needed
10. New: manual refund override — admin enters an amount and a reason, bypassing the tiered calculation for that specific case. This needs an audit trail: who overrode it, when, and the reason, recorded on the refund record — not just applied silently.

## Notification Service — light touch

11. New event type: low-occupancy alert to admin (channel policy, template — reuses the existing dispatch mechanism, no new infrastructure)

## Two things worth explicit care in your plan, not just implementation

**Trust boundary on negotiated bookings.** Admin is a trusted actor and can set a negotiated price — that's the whole point. But confirm this doesn't create a path where a *guest-facing* endpoint could ever accept a client-supplied price; the negotiated price must only ever be settable by an authenticated admin action (same `INTERNAL_SERVICE_KEY`/role-gated pattern used elsewhere), never something a guest client submits directly. This is the same trust-boundary class of bug closed back in Phase 4 — don't reopen a version of it here.

**Lazy booking generation must still go through the existing atomic path.** Whichever trigger creates a member's daily `Booking` row (app tap, front-desk check-in, or the sweep) needs to use the same concurrency-safe reservation logic already built in Phase 1 — not a new, unguarded insert path. If two triggers could theoretically fire near-simultaneously for the same member/day, that needs the same protection as any other booking creation.

## Checkpoints for this phase

1. A test proving the pricing-mode override actually applies at real payment time — create a `ResourcePool` with a flat default, release a specific guest slot with a per-person override, confirm the charged amount reflects the override, not the default.
2. A test proving the full lazy-generation chain works end to end for the new member-assignment entity: assign a member, simulate the grace-period sweep with no confirmation, confirm a `Booking` row gets created and correctly released — through the same atomic path as Phase 1's existing concurrency tests, not a new one.
3. A test proving the manual refund override records who/when/reason, not just the overridden amount.

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
