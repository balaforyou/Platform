# Tournament Module — API Contract (v0)

**Status:** New (26 Jul 2026), badminton-specific — layers on the Slot Engine and Payment Service, not part of the shared Platform Core.
**Related docs:** `slot_resource_engine_api_spec.md`, `identity_auth_service_api_spec.md`, `badminton_app_discovery_brief.md`

---

## 1. Core idea — reusing existing primitives

A tournament match is, underneath, just a court booking — a `FIXED_INSTANCE` reservation for a specific time window, except the "booker" is the tournament bracket instead of an individual guest. Two existing Slot Engine primitives cover most of the hard work:
- **`BlockedWindow`** — a tournament automatically creates one covering its courts and date range, locking out member/guest/student booking there entirely, exactly as decided (26 Jul 2026): tournament mode fully blocks other booking types for the affected courts or center.
- **`Booking`** — each scheduled match becomes a booking against a court within that blocked window, just tagged with `booking_type: tournament_match` instead of `guest`/`member`, so it doesn't pollute no-show/utilization reporting for regular bookings.

What's genuinely new: registration, bracket structure/progression, and standings.

## 2. Core entities

| Entity | Purpose |
|---|---|
| `Tournament` | tenant_id, branch_id, name, format (`knockout` \| `round_robin`, tenant-configurable per tournament), courts/branch reserved, date range, entry_fee (nullable — tenant decides per tournament), registration window, status |
| `TournamentRegistration` | tournament_id, participant (type: `individual` \| `team` — team holds 2+ linked user_ids for doubles), payment_status (only relevant if entry_fee is set) |
| `Fixture` | tournament_id, round, participant_a, participant_b (each may be an individual or a team), scheduled_booking_id (FK to Slot Engine `Booking`), result, winner (for knockout: feeds into next round's fixture) |
| `Standings` | tournament_id, participant, wins/losses/points (round-robin only — knockout progression is tracked via `Fixture.winner` instead) |

## 3. Flow

1. **Setup** — admin creates a `Tournament`: picks format, courts/branch, date range, optional entry fee. Saving it auto-creates the corresponding `BlockedWindow`(s) on the Slot Engine.
2. **Registration** — opens per the configured window; if `entry_fee` is set, registration triggers a Payment Service charge (reusing the same UPI Intent flow as guest bookings) before the registration is confirmed.
3. **Bracket/fixtures** — **manual bracket** per your decision: the organizer sets seeding/pairings by hand rather than the system auto-generating them. For round-robin, the fixture *list* (every participant plays every other) is naturally derivable once the field is set, but seeding order for scheduling purposes stays admin-controlled.
4. **Auto-schedule** — once fixtures exist, the system assigns each to a specific court + time slot within the tournament's reserved window automatically, creating the underlying `tournament_match` bookings. For knockout, only the current round's fixtures can be scheduled at a time, since round 2 depends on round 1 results — auto-schedule needs to run **per round**, not all rounds upfront.
5. **Results & progression** — admin (or a simple score-entry screen) records each fixture's result. Knockout: winner auto-populates the next round's fixture slot. Round-robin: result feeds the `Standings` table.

## 4. Two things worth getting right early

**Round-by-round scheduling dependency for knockout.** Don't try to auto-schedule an entire knockout bracket's court/time slots in one pass — round 2's matchups aren't known until round 1 finishes. The auto-scheduler should be invoked per round, triggered once the prior round's results are all recorded.

**Blocked window scope must match what was actually reserved.** If a tournament reserves only 3 of a branch's 5 courts, the `BlockedWindow` must scope to exactly those 3 court `resource_id`s, not the whole branch — otherwise you're needlessly blocking member/guest access to courts the tournament isn't even using. Get the granularity of "courts or center" (your own phrasing) right at tournament-creation time, since it directly controls how much regular revenue is paused during the event.

## 5. Resolved decisions

- ~~Entry-fee cancellation policy~~ — **decided: milestone-based.** Refundable any time before the bracket locks; no refund after, since removing a participant post-seeding creates a disruptive bye/walkover rather than a simple resellable slot.
- ~~Team/doubles support~~ — **decided: yes, from launch.** `TournamentRegistration.participant` supports both `individual` and `team` (2+ linked players) — see updated Section 2.
- ~~Round-robin fixture generation trigger~~ — **decided: organizer-confirmed.** The full fixture list is deterministic once the field is final, but generation only fires after the organizer explicitly confirms the field — giving a checkpoint to handle late dropouts before it locks.

## 6. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Entry-fee cancellation: milestone-based (refundable until bracket locks) |
| 26 Jul 2026 | Doubles/team support included from launch |
| 26 Jul 2026 | Round-robin fixtures generate only after organizer confirms the field |

---
*This module intentionally does not become part of the Platform Core in Section 2 of `platform_core_reusable_components.md` — it's specific to badminton's tournament feature and depends on badminton-shaped resources (courts). If a future vertical needs event/bracket hosting too, this could be reconsidered as a shared component then.*
