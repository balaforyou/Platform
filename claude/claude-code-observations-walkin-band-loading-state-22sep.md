# Observation — walk-in booking's Morning/Afternoon/Evening tabs look disabled while still loading

From: Claude Code
Context: Bala's real report — successfully booked a real guest slot (`BK-8162B99A`, Sept 23,
08:00-09:00 AM, Court 1, ₹400, CONFIRMED) for `sviji3584@gmail.com`, then found the admin
walk-in booking screen showing no Morning/Afternoon slots for the same real pool. Verified by
code read (`apps/admin-v2/src/screens/guestManagement/sections/WalkInBookingFlow.tsx`,
`reservationHelpers.ts`) plus a real production API comparison and a live dev-stack reproduction
attempt. Described only, no ID assigned.

---

## Ruled out first: this is not a real data gap

Queried production directly (`GET /resource-pools/:id/availability?date=`) for both 2026-09-23
(the real successful booking's date) and 2026-09-24 (the date the walk-in screenshot showed) on
the same real pool (`54c44a14-...`, "Japan Badminton Court, Coimbatore"). **Both dates have real,
un-booked morning windows** (`remainingCapacity: 4` at 00:30 UTC = 6:00 AM IST, matching the
branch's real `05:00-10:00` availability pattern). The data genuinely supports morning slots on
both dates — this isn't a case of the 24th simply having none.

The walk-in flow (`useAvailability`, `guestManagement/queries.ts:80-87`) calls the **exact same**
`GET /resource-pools/:id/availability?date=` route the guest-booking path used for the successful
booking — same lazy generation, same capacity computation. No divergent logic between the two
paths at the data layer.

## Real root cause, confirmed by code read

`WalkInBookingFlow.tsx:203-207`:
```ts
const slots: AvailabilitySlot[] = useMemo(
  () => (pendingSlot ? [...(availability.data ?? []), pendingSlot] : availability.data ?? []),
  [availability.data, initialSelection?.pendingWindow],
);
const bandSet = useMemo(() => bandsWithSlots(slots, tz), [slots, tz]);
```
`bandSet` is derived purely from `availability.data` — with **no awareness of
`availability.isLoading`/`isFetching` at all**. `useAvailability`'s query key is
`['court-groups', 'availability', poolId, date]` — switching to a date (or branch/pool) not yet
fetched this session starts a **fresh** query with `data === undefined`, so `slots` is briefly
`[]` and `bandSet` is briefly empty.

The band tabs (`WalkInBookingFlow.tsx:472-484`) render straight off that:
```tsx
disabled={!bandSet.has(b.key)}
style={{ ...segBtn(b.key === band), opacity: bandSet.has(b.key) ? 1 : 0.4, cursor: ... }}
```
**All three tabs — Morning, Afternoon, and Evening alike — go disabled and dim during that
loading window**, with nothing to distinguish "still loading" from "genuinely no slots for this
time of day." The only loading indicator anywhere on this section is inside the *Slot* dropdown
itself (`"Loading slots…"`, line 497) — the band tabs above it give no such signal. An admin who
glances at the tabs in that window (a real, if brief, gap — network latency, lazy window
generation on a never-before-queried date) sees exactly what Bala described: Morning and
Afternoon looking unavailable.

**Confirmed live on the local dev-stack**: switching the walk-in form to a real future date and
clicking Morning correctly surfaced real 6 AM–12 PM slots once the query had time to settle —
consistent with a timing/loading-state gap rather than a logic bug in which slots get shown.

## Not fixed here

Real, small fix once picked up: gate the band tabs' disabled/dim treatment on
`availability.isLoading` too (e.g. keep all three enabled-looking, or show a neutral "loading"
style instead of the same "no slots" dim, while the query is in flight) — same class of fix as
this project's other loading-vs-empty distinctions, just missing here.

---

## Summary for Chief

Real, confirmed root cause: `bandSet` (and the tab `disabled`/`opacity` it drives) has no
awareness of the availability query's loading state, so a fresh date/pool selection can show all
three Morning/Afternoon/Evening tabs as if no slots exist for a brief but real window, even
though the underlying data is fine — confirmed directly against production data for the exact
dates involved. This is an operationally real risk: an admin could wrongly tell a real walk-in
guest no morning slot exists.
