# Slotflow — Business Validation Closure Sheet — Responses

Filled per item, in the sheet's own order. Where a proposed decision text conflicts with already-proven, shipped behavior, the conflict is stated explicitly rather than silently resolved — approve the intent, amend the text.

Decision Owner for all items below: Bala (product owner).

---

# P0

## VALIDATION-016 — Business Time Semantics

**[X] APPROVE**

Matches F-066/F-087/F-088's already-implemented design exactly — branch-local for business meaning, UTC for storage, elapsed-time for technical retry/lease durations. Ratifying shipped, proven behavior.

---

## VALIDATION-001 — Capacity Formula

**[X] APPROVE WITH CHANGE**

The proposed text as written ("physical capacity calculation must not differ by booking path") conflicts with F-035/F-041's already-shipped, deliberately-designed, independently-verified split between guest occupancy and member attendance — these answer genuinely different business questions ("can this seat still be sold" vs. "who is physically present") and must remain separately computed.

**Amended decision**: one canonical formula for *bookability / capacity consumption* across all booking-creation paths (browse, normal, negotiated, member). *Occupancy display* metrics (guest occupancy, member attendance) are explicitly permitted to differ from the booking-capacity formula and from each other, since they serve different operational purposes, not because of inconsistency.

### Clarify

What consumes capacity: **[X] HELD booking** **[X] CONFIRMED booking**

What releases capacity: **[X] Hold expiry** **[X] Cancellation** **[X] No-show release** **[X] Manual authorized release**

---

## VALIDATION-002 — Booking Confirmation

**[X] APPROVE WITH CHANGE**

The literal precondition "hold has not expired" creates a real, dangerous edge case: a slow payment approval (e.g. UPI) where capture genuinely completes at the exact moment the hold technically expires. Rejecting confirmation there produces the worst possible outcome — real money taken, no booking created.

**Amended decision**: if payment has genuinely captured, the booking must be confirmable even if the hold technically expired in that same window. Hold-expiry protects *inventory before payment*; once payment is captured, the customer has paid and the booking should win. Record this explicitly as a stated rule with its reasoning, not as a silent exception.

Internal service trust must still not bypass these invariants — agreed as proposed.

---

## VALIDATION-004 — Payment Captured but Booking Confirmation Fails

**[X] Retry first; refund if confirmation cannot be completed** — "refund" here means routed to manual operations/reconciliation, not an automatic customer-facing refund. Primary path: automatic reconciliation re-drives confirmation on F-044's existing tick mechanism (no new interval needed). A real operator-visible alert fires if the mismatch persists beyond the threshold below.

**Customer-visible outcome**: booking should complete transparently if reconciliation succeeds quickly; if not, customer sees a "processing" state, not a failure, while ops is alerted.

**Maximum acceptable recovery time before escalation: 10 minutes** — final. Reasoning: real, already-captured customer money sitting unconfirmed on the main revenue path; at current volume a tighter threshold costs nothing in alert fatigue and protects trust. Revisit once real volume data exists.

---

## VALIDATION-010 — Subscription Identity

**[X] APPROVE**

### Authorized actors
**[X] Member for self** **[X] Trusted payment/internal service** (for provisioning/admin-driven creation)

### Required identity source
**[X] Both depending on operation**

---

## VALIDATION-015 — Tenant / Ownership Authority

**[X] APPROVE**

No changes — this is the exact pattern already proven across F-045, F-048, F-049, F-053, F-061, F-071, F-090, and F-097, with real live-fire evidence behind every clause.

---

## VALIDATION-017 — Booking Check-In Authorization

**[X] APPROVE WITH CHANGE — window finalized**

### Authorized actors
**[X] Booking customer** **[X] Branch staff**

### Required conditions
**[X] Authenticated caller** **[X] Same tenant** **[X] Booking ownership for customer check-in** **[X] Branch authorization for staff check-in** **[X] Booking must be CONFIRMED** **[X] Check-in allowed only within defined time window**

### Check-in Window — final
**Earliest**: BR-092's existing ~2-hour figure, reused directly — this rule already existed in the reconstruction; the fix is enforcing it server-side (F-094), not redeciding the value.
**Latest**: `window.endTime` — the slot's own booked end time. Check-in's purpose is presence-tracking during a session; once the slot has ended there's no operational reason to allow it. Reuses existing data, no new field required.

This directly connects to **F-094** (currently unenforced server-side) — this decision is what F-094's fix should implement.

---

## VALIDATION-018 — Notification History Privacy

**[X] APPROVE**

Matches the architect review's original recommendation — recipient strings (phone/email) are delivery attributes, never authorization identities.

---

# P1

## VALIDATION-003 — Hold Expiry vs Confirmation Race

**[X] APPROVE WITH CHANGE** — inherits VALIDATION-002's carve-out. Confirmation succeeds if the hold is valid *or* if payment has genuinely captured, even in a technical-expiry race window. Once expiry/release wins *and no payment capture exists*, the booking cannot subsequently be confirmed.

---

## VALIDATION-005 — Payment Verification Ownership

**[X] APPROVE**

Matches F-061's already-shipped, proven fix exactly.

---

## VALIDATION-006 — Direct Verify vs Webhook

**[X] APPROVE**

Converge on one internal capture operation; keep both entry points.

---

## VALIDATION-008 — Member Confirmation

**[X] APPROVE**

Widen `canConfirm`'s read side to match real executable write-side behavior.

---

## VALIDATION-009 — Member No-Show

**[X] NO — represent it as attendance/no-show history instead**

A synthetic booking a member never made appearing in their real booking history is a live, user-visible defect, not a modeling preference open to debate.

---

## VALIDATION-011 — Cancellation and Refund

**[X] Depends on cancellation/refund policy — condition finalized**

**Condition, final**: split by whether the refund amount is deterministic.
- **Standard cancellations, within the tenant's defined cancellation policy** → auto-enqueue, no human step. The system already computes the correct tiered refund percentage from the policy — nothing for a human to judge.
- **Negotiated bookings** → always require human approval via the existing `FLOW-060` override path. These are admin-priced by definition; no standard formula a system could trust blindly.

This formalizes when the already-built override path is mandatory versus optional — no new infrastructure required.

---

## VALIDATION-012 — Meaning of Refund

**[X] Multiple states are required**

Follow the sheet's own recommendation: model the provider-refund lifecycle explicitly rather than treating local `Refund` row creation as proof money moved. Directly blocked behind **F-026** (per-tenant payment routing) — decide the target model now, implement once F-026 lands.

---

## VALIDATION-013 — Notification Reliability

**[X] Recommended Baseline, as written** — durable `NotificationRequest` creation guaranteed for business-required notifications; actual delivery remains async with retry/dead-letter tracking. Connects directly to F-054 (retry ladder gap), F-025 (delivery never proven real), F-103.

---

## VALIDATION-014 — Scheduler / Dispatch

**[X] APPROVE**

Already proven in F-044 Phase A's shipped work — shared lease semantics, F-057/F-060 already addressed in that implementation.

---

# P2

## VALIDATION-007 — Negotiated Booking

**[X] YES — intentional business variant**

Waiving group-size and pricing rules *is* the negotiated-booking feature by design — already correctly implemented this way. Constraint (canonical availability/capacity from VALIDATION-001) already holds.

---

# All items closed — ready for `DECISION-xxx` assignment and propagation

Every item above is now a final, real decision. No open numbers remain.
