# F-269 — draw each POOLED booking on its own court — implementation plan

**Backfill, not a correction — this doc didn't exist in `claude/` until now, despite the work already
having shipped.** PR #100 (`66a3f7d`, merged) shipped without a plan file committed alongside it, against
this project's own standing practice. Written 2026-09-25, reconstructed from the actual approved plan
this work was implemented against (saved plan-mode file `jolly-squishing-gray.md`), not from the diff
alone — the diff only carries the "what," not the grounding or the rejected alternatives.

**Status:** already implemented, merged, deployed, and independently re-verified in production. Nothing
here changes code or the register — documentation catching up to already-shipped, already-verified work.

---

## 1. Context and what was found

Bala reported the admin-v2 Guest Slot Inventory for **JBC – New Japan Badminton Court, 25 Sep 2026**
showing **all 4 courts booked at 7:00 AM by the same user**. A read-only check against real production
data confirmed: the pool is POOLED (4 real courts, capacity 4) with **one** shared 7:00 window
(`resourceId: null`) and **one** CONFIRMED booking on it (`sviji3584@gmail.com`, ₹600) assigned to
**one** real court (`resourceId c9334046…`, `courtSlotIndex` 1). Three courts were genuinely free.

Root cause, `services/slot-engine/src/index.ts:1635-1668` (Guest Slot Inventory grid): each court column
finds the pool's one shared window (`w.resourceId === resource.id || w.resourceId == null`), then marks
the cell booked purely from `window.guestBookings.length > 0` — never checking which court the booking
is actually on. The identical pattern existed in the Guest Dashboard's live-allocation panel
(`:1502-1525`), which showed every court as `guest` with the same guest name.

This is open finding F-269, first surfaced 20 Sep 2026 while investigating F-263's fix, Chief-confirmed
independently as structural rather than caused by F-263's own cosmetic-fallback path, and originally
logged as needing a redesign — "would mean redesigning how POOLED bookings map onto a per-resource-column
grid, a materially bigger, separate change... needs its own plan-mode pass if pursued."

## 2. Why it was fixable now without the redesign the original row anticipated

The 20 Sep row's premise was that no reliable per-court identity existed to draw a POOLED booking on.
That changed: **F-205 has since given every new POOLED booking a real `resourceId`**, and
`computeBranchGuestDay` already loads it (`GuestDayBooking.resourceId`, `:1206`). So by 25 Sep the actual
gap was narrower than the finding anticipated — not "invent per-court identity," but "the grid and
dashboard both ignore the court identity that already exists." Approved scope: **both screens, one
shared helper**; bookings with no court fall back to the first free court in Court N order.

## 3. Real grounding checked before design (rule 2 — evidence, not reasoning from code alone)

- Production active guest bookings, POOLED pools: **11 with a real court, 2 with no court at all** (no
  `resourceId`, no `courtSlotIndex` — pre-F-186/F-205 bookings), **0** using the courtSlotIndex-only
  fallback path. So the no-court fallback rule is needed, but genuinely narrow in real data.
- "Court N" order is `createdAt asc` (`assignPooledCourt`, `:120-151`). `computeBranchGuestDay`'s
  `resources` select (`:1261`) had **no `orderBy`** at the time — column order was unspecified.
- Cell response shape (`admin-v2/src/screens/guestManagement/types.ts:252-259`) needed no change — the
  fix is server-side only.
- No regression coverage existed for `guest-inventory-grid` before this fix.

## 4. Alternative considered and rejected: leave it as general/shared allocation

Both the grid and the dashboard's pre-existing code treated a POOLED pool's lack of per-court display
identity as an accepted limitation — the dashboard carried an explicit comment to that effect: POOLED
pools have no fixed per-court identity to disambiguate further, the same limitation
`ReservationsPanel`'s own "Court is assigned automatically for this pool" copy already accepts. That was
the correct call **before** F-205, when no real per-court identity existed to draw from. It stopped being
correct once F-205 started giving every new booking a real court, because the display was now actively
wrong (4 courts shown booked for 1 real booking) rather than merely imprecise. Rejected in favor of real
per-court placement, once the underlying data supported it.

## 5. Alternative considered and rejected: first-free-court-only placement, ignoring real assignment

A simpler fix would ignore `resourceId`/`courtSlotIndex` and just assign each booking to the first free
column in Court N order for display purposes only. Rejected: it would silently disagree with
`assignPooledCourt`'s own real F-205 assignment whenever a booking already has a genuine `resourceId`,
making the grid lie about which physical court a guest is actually on — reintroducing a drift one level
down from the one F-269 exists to remove. The approved design instead treats the real assignment as
authoritative and only falls back to first-free-court placement for the narrow real case that has none.

## 6. Design (as approved)

**A. `computeBranchGuestDay` (`:1239`)** — two data additions: `resources` select gets
`orderBy: { createdAt: 'asc' }` so columns follow Court N order; `courtSlotIndex` added to the booking
`select` and to `GuestDayBooking`.

**B. New helper `placeBookingsOnCourts(bookings, orderedCourtIds)` → `Map<courtId, booking>`**, placed
next to `assignPooledCourt`:
1. A booking whose `resourceId` is one of the pool's courts goes on that court.
2. Remaining bookings (no court, or a court no longer in the pool): court
   `orderedCourtIds[courtSlotIndex - 1]` if set and free, else the first free court in order.
3. More bookings than courts can't happen under the existing capacity check; any extra is simply not
   placed — occupancy counts elsewhere don't use this helper, so an unplaceable extra changes no count.

**C. Inventory grid (`:1635-1699`)** — for a shared window (`window.resourceId == null`), placement
computed once per window: live `guestBookings` first, then elapsed `cancelledBookings` onto courts left
empty. A court shows `guest-booked`/`completed`/`cancelled` only if a booking is placed on it, otherwise
`guest-vacant`/`elapsed` as before. Windows with a real `resourceId` (FIXED_INSTANCE) keep existing
behaviour exactly. `member-blocked` stays whole-row — that matches the real F-207.2 rule (the whole slot
is withheld from guests as a whole), so it is correct and deliberately untouched, not part of this bug.

**D. Dashboard live allocation (`:1502-1525`)** — same helper; a court shows `guest` plus that booking's
guest name only when a booking is placed on it. The now-stale "no fixed per-court identity" comment
updated to describe the real placement.

## 7. Blast-radius check (rule 3a)

- `computeBranchGuestDay` callers: exactly two, both in scope — dashboard (`:1449`) and grid (`:1612`).
  The `orderBy` change affects both callers' column order to Court N order — intended, matches numbering
  used everywhere else.
- `guestBookings` counts used for occupancy (`:1458`, `confirmedSeats += …length`) are untouched — the
  helper only affects which court a booking is *drawn* on, never how many are counted.
- admin-v2: no code change required — `GuestSlotInventory.tsx` keys cells by `resourceId|startTime` and
  simply receives correct states; tapping a now-free court opens the walk-in flow as usual.
- guest-member-pwa, payment, other services: not touched.

## 8. Adjacent issues found — described, not fixed here (rule 9, for Chief to number)

1. **Walk-in court choice is ignored for POOLED pools.** The walk-in flow sends the tapped court's
   `resourceId`, but `/bookings/negotiated` always re-picks the first free court via
   `assignPooledCourt`. Invisible before this fix (the whole row showed booked regardless); after it, an
   admin could tap Court 3 and see the booking land on Court 2.
2. **The grid ignores `guestBookable`** (tracked separately as F-225) — a court not open to walk-in
   guests still shows as `guest-vacant`, but a walk-in booking can never actually be assigned to it.
3. F-133D's `endDate`-window assertion proved timing-sensitive during full-regression verification —
   failed by 4ms once, passed clean on a full rerun.

## 9. Verification (real evidence, not reasoning from code alone)

1. New regression sections (slot-engine, `pooled-court-placement.regression.ts`, 3 sections), confirmed
   red before the fix and green after: (a) one booking on Court 3 → only Court 3 `guest-booked`, Courts
   1/2/4 `guest-vacant`; (b) two bookings → exactly two booked cells, each on its own court; (c) a
   no-court booking → placed on the first free court in Court N order; (d) an elapsed cancelled booking
   → `cancelled` on its own court only; (e) FIXED_INSTANCE pool unchanged; (f) dashboard
   `liveAllocation` shows `guest` on the booked court only, with the correct guest name, others `open`.
2. Real UI check in admin-v2 on the dev stack, both tenants:
   - **JBC**, through admin-v2: only Court 3 shows Booked; Courts 1, 2, 4 show Open.
   - **courtowner1**: not entitled to `GUEST_BOOKING` on the dev database, so admin-v2 itself returns
     `MODULE_NOT_ENTITLED` — checked directly against the running route with the internal key instead:
     only Court 3 shows `guest-booked`.
3. Full regression: 5/5 suites, 182 sections (rebuilt from `dist` first, per the standing rebuild-before-test
   rule). `pnpm register:check`: PASS (Open 116 / Resolved 154). `pnpm diagram:verify`: clean.
4. Post-deploy, on production (read-only): the reported slot — JBC New Japan, 25 Sep, 7:00 AM — confirmed
   showing the booking on its one real court only (F-269 production close-out, `e4ffe32`).

Behaviour note, called out rather than left implicit: in the dashboard, other courts in a slot where a
guest was placed now show their own real state (e.g. `member_released`) instead of all showing `guest`.

## 10. Close-out and sign-off

F-269 → Resolved (Description kept as originally logged; Resolution names both screens), batch-log entry
in the same pass, `pnpm register:check` + `pnpm diagram:verify` clean. Already merged (PR #100) and
deployed under the review flow this project already runs (Claude Code investigate-and-implement →
Technical Lead spot-check and gatekeep → independent re-verification before Chief consolidation),
including F-269's own production close-out confirmation. This backfill doc requires only doc-level
sign-off before merging to `main` — no code, no register change, nothing to re-verify.
