# F-250 UX review screenshots

Real captures for Chief's UX review before addressing F-252/F-253/F-254/F-255, per the 19 Sep 2026
capture request. **This branch is disposable — delete it once Chief has reviewed.**

Captured with Playwright (real Chromium) against the live local dev stack, real JBC data
(`Japan Badminton Court, Coimbatore`), no code changes. Real time at capture: ~16:11–16:37 UTC,
19 Sep 2026 — branch clock is UTC, so that's mid-afternoon on the branch's own day.

## Files

- `dashboard-desktop-full.png` — Dashboard, full page, desktop (1280px). Real active+upcoming mix:
  3-4PM closed & booked, 4-5PM through 9-10PM all "Active" identically (F-254 visible).
- `dashboard-desktop-slotmonitor-liveallocation.png` — Slot Monitor's tail and Live Guest
  Allocation in one frame (F-255's stacked layout + missing timestamp both visible together).
- `dashboard-mobile-full.png` — Dashboard, full page, mobile (390×844).
- `inventory-desktop-grid.png` — Guest Slot Inventory, full grid, desktop. Past cells (6AM–2PM)
  render identically to genuine future ones (F-252).
- `inventory-desktop-walkinflow.png` / `inventory-mobile-walkinflow.png` — `WalkInBookingFlow`
  open mid-flow on a genuine future vacant cell (5-6PM, Court 1, ₹400) — the flow's normal working
  state, not the past-cell dead-end (see notes below).
- `inventory-mobile-grid.png` — Guest Slot Inventory, full grid, mobile (390×844).

## Notes from capture (not filed as findings yet — flagged, not fixed, per the request)

1. **No genuinely-empty cell exists anywhere in JBC's real data.** Confirmed during F-250's own
   verification: the pool's `AvailabilityPattern` covers every hour of every day, so a `+` (empty)
   cell only exists on non-JBC fixture pools. `inventory-desktop-grid.png` shows past/active/
   booked/vacant-future instead of a true empty cell.
2. **Mobile Inventory grid (`inventory-mobile-grid.png`): the Branch/Date row visibly overlaps** —
   "Coimbatore" collides with the date field, and the date value is partly clipped. Only 2 of 4
   court columns fit before being cut off, with no visible scroll affordance.
3. **A cell that's already started but not yet ended shows "Open" on the grid but dead-ends
   identically to a past cell when tapped.** Traced to a pre-existing, already-tracked, unrelated
   route behavior (`GET /resource-pools/:id/availability`'s F-155/F-162 exclusion of
   already-started windows, explicit in that route's own code comment), not something new — and
   already covered by F-252's existing description (same "no time-comparison" root cause).
4. The first attempt at the `walkinflow` shots accidentally landed on a *past* cell, which
   produced a "No open slots" empty state — real (proves F-252's dead-end), but not representative
   of the flow's normal working state, so both were recaptured against a genuine future vacant
   slot (5-6 PM) instead.
5. A `fullPage` screenshot artifact worth knowing about: the mobile shots' bottom nav bar can
   appear to overlap mid-page content in a stitched full-page capture — confirmed via a real
   scroll-to-bottom check that this is a Playwright stitching artifact only (fixed-position
   elements get captured at their fixed viewport position on each internal scroll step), not a
   real rendering defect. The nav sits correctly below all content during actual scrolling.
