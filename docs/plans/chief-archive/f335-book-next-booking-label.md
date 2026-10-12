# F-335 — label the "next booking" bar on /book

Date: 7 Oct 2026 · Reviewer: Chief · Founder: Bala · PR #138 (draft)

**Source note.** There is no handover document from Chief for this finding. This is Claude Code's own plan, approved by Chief on 7 Oct 2026 with the rulings below; the register row text and the wording
rulings came from Chief's messages. Evidence and CI are in `docs/plans/batch-log.md`, not here.

## Problem
The green bar above the date ribbon on `/book` (`BranchBooking.tsx`) showed only a weekday and time ("Thu 6:00 AM"). It is the guest's own soonest upcoming booking in a *different pool* from the one open
(`BranchBooking.tsx:196-205`, rendered at `:657-665` before this change). Bala, booking at JBC Old Court, saw his 6 AM Thursday booking at JBC New Court and read it as an availability hint.
Unlabeled since the F-235 `/book` Slice A screen (`832cfc6`); no earlier fix is documented.

## Rulings (Chief)
- Keep the bar and label it: **"Your next booking · JBC New Court · Thu 6:00 AM"**, with a **Manage** link to `/bookings/my` (the `CourtBooking.tsx:508-520` precedent). Leave the dead, unrouted `CourtBooking.tsx` copy alone.
- **Stale venue name** (the most important part): a map keyed by branch id plus a settled-without-result flag, derived at render, following the F-333 precedent (`branchAboutById`, `branchAboutSettledEmpty`).
- **Stale-response guard** rides with F-335: it protects the bar's own "another pool only" rule, so it is not an adjacent finding.
- **Time zone:** the production branches are not all UTC (JBC's two are `Asia/Kolkata`, read 7 Oct 2026). **No time without a known time zone, and no UTC fallback.** Pending and failed lookups show only
  "Your next booking" and Manage.
- **Height:** reserve the second line only while the venue is pending; release it on loaded or failed (as in F-331 and F-333).
- **Live-fire only**, no committed Playwright spec; helpers stay inline in `BranchBooking.tsx`.
- **Manage** tap target at least 44px high without making the bar look taller. **Contrast:** measure Manage in light and dark; use `accent-800` only if the pair is under 4.5:1.
- Scope: `BranchBooking.tsx` only. The Home card, F-333 and F-334 are out of scope. No F-327, no other finding bundled.

## What was built
- State: `upcomingResult` keeps `{ poolId, booking }`; the bar uses it only when `poolId` matches the pool open now. No `/bookings/my` request until the pool is known; a response for a pool the guest has left
  is ignored. `branchAboutFor` records which branch the current `branchAbout` (or its failure) belongs to (the `/about` payload has no id), and the branch-about effect ignores responses for a branch the guest left.
  Other-branch venues are fetched once per id into `upcomingAboutById`; a lookup that settles without a result is recorded in `upcomingAboutSettledEmpty`.
- Layout ruling (Chief, 7 Oct 2026, after the long-name finding): two lines as above.
- Render: `data-testid="upcoming-booking-bar"` and `data-venue-state="loaded|pending|unavailable"`; line 1 is the label and Manage, line 2 is the venue (truncates) and the time (never shrinks), with a `title` carrying the full text; Manage with an invisible hit area; `isKnownTimeZone` gates the time.

## Known limitations / for later
- The same UTC-fallback pattern exists wherever `formatBranchTime` is handed a time zone that may not be loaded yet. A live audit (every `/about` delayed) showed it on History, the Home card, the confirmation screen and the `/book` slot grid; the rest were confirmed by code read. Listed in the batch-log; surfaced, not fixed here.
- Not provable locally: a real device and production venue names.
