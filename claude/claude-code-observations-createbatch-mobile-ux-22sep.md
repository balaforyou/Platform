# Observations — admin-v2 "Create Batch" form, mobile viewport

From: Claude Code
Context: Bala's real observations testing `Manage Members` → `Create Batch` on a phone. Verified
live against the local dev-stack (`http://localhost:5175/members`, already-authenticated JBC
session, real JBC branch/pool data) at a 375×812 mobile viewport, plus direct code reads of
`apps/admin-v2/src/screens/membersManagement/CreateBatchForm.tsx`,
`apps/admin-v2/src/components/{Select,TimeField}.tsx`. Described only, no IDs assigned.

---

## 1. Branch / Court-Pool fields overlap and overflow off-screen — confirmed

Real screenshot at 375px width: the "Court / Pool" select's content ("Japan Badminton Court,
Co...") runs past the white card boundary and off the right edge of the visible viewport
entirely — not just truncated, genuinely overflowing.

**Root cause, confirmed by code read.** `CreateBatchForm.tsx:104`:
```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: ... }}>
```
`minmax(0, 1fr)` on the grid *track* only bounds the outer cell — it does not stop a child from
overflowing that cell. `Select.tsx`'s wrapper `<div>` (line 22) and the native `<select>` itself
(line 27-43, `flex: 1`) never set `minWidth: 0`. A flex/grid item's default `min-width` is `auto`,
so the select's own intrinsic content width (driven by the currently-selected `<option>`'s text —
here, a long real pool name like "Japan Badminton Court, Coimbatore - Main Courts") sets a floor
wider than the grid cell, and the select pushes out past its column instead of shrinking or
wrapping. Same missing `min-width: 0` on both the Branch and Court/Pool selects, so both are
affected — worse for Court/Pool since JBC's real pool names are the longer of the two.

**Not fixed here** — this needs an actual layout decision (stack the two fields on narrow
viewports via a responsive breakpoint, and/or add `minWidth: 0` through `Select`'s wrapper/native
element so the text truncates with ellipsis instead of overflowing) rather than a one-line patch.

---

## 2. "Unable to set time" — not independently reproduced here; real code-level cause identified

Tapping the Start Time field correctly opened the picker modal, and tapping a value (e.g. "09" in
the hour column) correctly updated the display to "09:00 AM" and persisted onto the form after
closing — worked cleanly in this environment.

**Caveat, stated plainly**: this environment emulates a mobile *viewport* with synthetic mouse
events, not a real phone's touch/swipe physics. `TimeField.tsx`'s picker (`WheelColumn`,
lines 180-271) is built as a scroll-snap wheel, `ITEM_H = 40`px per row, resolved via a **140ms
debounced `onScroll` handler** (`settle.current`, lines 206-215) that reads `scrollTop` after
scrolling stops to infer the selected value. Two real, verifiable-but-unverified-here risk
factors for a genuine finger/swipe interaction:
- **40px row height** is below the commonly-cited ~44-48px minimum touch-target guideline —
  plausible source of mis-taps on a real device, even though a direct tap (as tested here) works.
- **Momentum-scroll physics differ meaningfully** between a real touchscreen (elastic overscroll,
  variable deceleration) and a synthetic wheel/mouse scroll — the 140ms settle window and
  `Math.round(scrollTop / ITEM_H)` snap-to-index logic could plausibly land on the wrong row, or
  never fire `onScroll` cleanly, on a real device in a way this environment can't reproduce.

**Not confirmed as broken** — flagging the plausible mechanism, not claiming reproduction. Would
need testing on Bala's actual phone (or a real touch-emulation trace) to confirm.

---

## 3. No peak/non-peak rate shown — confirmed, and worse than cosmetic on JBC's real tenant

`CreateBatchForm.tsx:162-164` renders only a `Toggle` between the literal words "Peak"/"Non-Peak"
— no numeric rate anywhere. Confirmed by grep: `memberPeakDefaultRate`/`memberNonPeakDefaultRate`
are never *read* anywhere in `apps/admin-v2/src/screens/membersManagement/` or
`guestManagement/queries.ts` — only a mutation exists (Branch Settings' own save action), never
surfaced back into this form.

**Confirmed live on JBC's real production tenant**: `memberPeakDefaultRate` and
`memberNonPeakDefaultRate` are both `null` (`GET /tenant/tenants/b3c40ef8-.../`). Server-side,
`POST /groups` rejects a save with no resolvable rate (own customRate, else the matching tenant
default) — so **today, on production, any admin who toggles Peak/Non-Peak without also filling in
Custom Rate will hit an opaque save failure**, with the form giving no indication beforehand that
this tenant has no configured default at all. This compounds the display gap into a real,
currently-live UX dead end for JBC specifically.

**Not fixed here.**

---

## 4. Court/Pool dropdown shows the pool's descriptive name, not a court number — confirmed

`CreateBatchForm.tsx:123-125` renders `{p.name}` (the `ResourcePool.name`, e.g. "Japan Badminton
Court, Coimbatore - Main Courts") — never an individual numbered court.

**Architectural note, so this doesn't get mis-scoped**: a `Group`/batch attaches to a
`resourcePoolId`, not to an individual `Resource` (numbered court) — that's the POOLED allocation
model this whole platform uses (a batch gets *any* available court in its pool at booking time,
not one fixed numbered court). Both of JBC's real branches today happen to have exactly one pool
each, containing several individually-numbered courts as `Resource` rows underneath it — so
showing the long pool name is redundant *today* (1:1 branch:pool), but "the dropdown should be
the Court Number" isn't directly implementable without changing what a batch actually reserves,
unless the intent is just a shorter/clearer label for the existing pool-level selection. Real
design question for Chief, not a one-line fix.

---

## 5. Days default to none selected — confirmed, real suggestion

`CreateBatchForm.tsx:35`: `const [days, setDays] = useState<number[]>([]);` — no day is
pre-selected; the admin must tap all seven individually if creating a typical 6-day batch.
Bala's suggested default (Mon–Sat pre-selected, Sunday left off) is a real, low-risk UX
improvement — matches the common case without removing the ability to change it.

**Not fixed here.**

---

## Summary for Chief

All five real and confirmed except #2, which is a plausible-but-unverified mechanism (couldn't
reproduce a failure via this environment's synthetic touch emulation; flagging the code-level risk
factors instead of a false claim of repro). #1 and #3 are the most actionable — #3 in particular
is a live production dead-end for JBC specifically, not just a display nicety.
