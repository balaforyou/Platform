# F-133 — Addressable group hierarchy (and the analytics that sit on it)

**Status:** investigation complete, no implementation. **Date:** 15 Aug 2026.
Filled from `docs/business_discovery_checklist_template.md`. This is the first real use of that
convention.

---

## 1. The ask, in the business's own words

Admin should be able to push notifications to an entire tenant, to specific groups, or to specific
individual members — replacing what JBC does manually over WhatsApp today.

Expanded during the same discussion: an admin should be able to create a **master group** (e.g.
"JBC Morning Group"), add **named sub-groups** under it (e.g. "JBC Court 1 6AM", "JBC Court 2 6AM"),
and target a notification at **either level**.

A second, tightly coupled ask arrived alongside it: **attendance/booking analytics** — overall
attendance percentage over a period, historical booking volume as a graph showing peaks and lows,
and an attendance breakdown by master group with drill-down to sub-groups and individual members.

## 2. Evidence anchor

**Grounded, not a preference.** This maps directly onto JBC's real WhatsApp structure already
captured as evidence earlier in this project: a "JBC Evening" community containing 17+ named batch
groups, e.g. "JBC 7pm Batch Court 3". The hierarchy being asked for is not hypothetical — it is a
description of how the customer already organises their operation, in a tool they are trying to
replace.

## 3. Does it already exist? — checked, not assumed

**No. Confirmed by direct schema inspection, including a negative result.**

**Q1 — does `MemberGroupAssignment` (or anything else) carry a group name, or any admin-set field
identifying a batch as a named entity?** No. `schema.prisma:318-333` is a **per-member row**:

```
userId, resourcePoolId, daysOfWeek, startTime, status, @@unique([userId, resourcePoolId])
```

There is no name, label, or description field. The "group" today is **implicit** — it is whatever
set of members happens to share a `(resourcePoolId, daysOfWeek, startTime)` tuple. Nothing an admin
can name, address, or hand to a notification API. "JBC 7pm Batch Court 3" has nowhere to live.

**Q2 — does any parent/child or grouping relationship exist anywhere in the schema?** No. A search
across all **26 models** for `parent`, `children`, `hierarch`, `groupId` or a `Group` entity returns
nothing. The only occurrence of the word "group" is `MemberGroupAssignment` itself, which as above
is not a group.

**Q3 — verdict.** Confirmed, not assumed: **F-133 is not primarily a notification-targeting
feature. It is new data modelling.** The notification targeting is a thin consumer of a group
concept that does not exist yet.

## 4. Reusability

Nothing to reuse for the entity itself — there is no grouping mechanism to extend. The *targeting*
half can consume `NotificationRequest`, which already exists and is already written across the
notification service (see F-138, and F-054/F-025 which concern the same model).

## 5. Genericity — required, and the bar is measurable

**This must be built vertical-agnostic**, on the same reasoning that justified
`packages/job-scheduler`: multiple real use cases known **up front**, not hoped for.

| Use case | Super level | Sub level | Leaf |
|---|---|---|---|
| Badminton (JBC, today) | "JBC Morning Group" | "Court 1 6AM" | member |
| Student/training attendance (planned) | training batch | Beginners / Intermediate / Specialty | student |

Identical shape, different vertical.

**The bar, verified rather than asserted.** `packages/job-scheduler/package.json` declares
`"dependencies": {}` — zero runtime dependencies — with `@badminton/database` present only as a
**devDependency**, and a search of its source finds no `court`, `badminton`, `booking`, `pool`,
`slot` or `player` vocabulary. That is the standard to match.

**Where badminton would leak in, and must not.** The temptation is to hang a group off
`resourcePoolId`, because today's implicit grouping is defined by pool + days + time. That would
bake a court concept into the core structure and make the entity useless for a student batch.

The rule: **the group entity references nothing vertical. Anything court-shaped is attached from
the outside**, via the existing assignment mechanism, not held inside the group.

## 6. Dependencies and blockers

- **F-133's own group modelling blocks the notification-targeting UI.** Do not scope that UI first.
- **F-138** (notification history) connects downstream — filtering history *by group* is only
  meaningful once addressable groups exist.
- No hard blocker on starting the modelling itself.

## 7. Data reality — for the analytics ask, kept separate from the hierarchy question

These are two different pieces and should not be conflated. **The hierarchy does not exist. The
underlying history largely does.**

What is genuinely captured today, structurally:

- **`Booking`** (`schema.prisma:335-362`) — `status`, `heldAt`, `createdAt`, `resourcePoolId`,
  `windowId`, `userId`, `branchId`, `tenantId`, `price`, `isMemberBooking`. Sufficient for
  historical booking volume over time, by pool and by branch.
- **Attendance has two distinct signals**, and they mean different things:
  - `Booking.status = CHECKED_IN` — actual arrival. Written by the check-in route
    (`slot-engine/src/index.ts:2487`), CONFIRMED → CHECKED_IN, and irreversible by design.
  - `Booking.memberAttendanceConfirmedAt` — a member's *advance* confirmation, explicitly distinct
    from arrival per the schema comment.
- **`RELEASED_NO_SHOW`** exists in `BookingStatus`, giving a real negative signal.

**So an attendance percentage is computable in principle**, but which numerator is intended is a
business decision, not a technical one: arrivals (`CHECKED_IN`) over confirmed bookings is a
different metric from advance confirmations over bookings, and they will not agree.

**Unverified, stated as such:** I could not measure how much real history actually exists — Docker
was not running at the time of this investigation, so no row counts were taken. The schema supports
the analytics; whether enough real bookings have accumulated to make a graph meaningful is
**unmeasured**, and worth checking before promising a peak/low visualisation.

**The drill-down is the part that is genuinely blocked.** "Attendance by master group, drilling
down to sub-group and member" cannot be built at all until the hierarchy in §3 exists — there is
nothing to group by. Volume-over-time and overall percentage are available sooner.

## 8. Real design questions to settle before build

1. **Depth** — is two levels (master → sub) sufficient, or should the parent reference be
   self-referencing and arbitrarily deep? Self-referencing costs little now and cannot be
   retrofitted cheaply.
2. **Membership model** — does `MemberGroupAssignment` become membership *within* a group, or does
   a separate membership join arrive alongside it? Today's `@@unique([userId, resourcePoolId])`
   constrains a member to one assignment per pool, which may not survive contact with groups.
3. **Can a member belong to more than one group?** Today's schedule model effectively says no.
4. **Does a group own a schedule, or only members?** Today `daysOfWeek`/`startTime` live per member
   — a real duplication a group could absorb, but that is a migration, not an addition.
5. **Attendance metric definition** — see §7.

## 9. Scope verdict

**New data modelling, not a UI addition and not a new view over existing data.** A generic `Group`
entity (id, tenantId, name, optional self-referencing parent, timestamps) with the existing
assignment mechanism becoming membership within it. The notification targeting and the group-level
analytics drill-down are both **consumers** of that entity and cannot be scoped before it exists.

The booking-volume and overall-attendance analytics are a separate, smaller piece that can proceed
independently of the hierarchy, subject to the unmeasured-history caveat in §7.
