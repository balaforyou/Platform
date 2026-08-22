# Pending Findings — awaiting Chief confirmation

Added Batch 8, as the structural enforcement for the ID-assignment rule in root `CLAUDE.md`'s
"Source of truth" section. That rule ("new findings get described, not numbered, until Chief
confirms") has failed twice despite being written down — F-173 (Batch 5/6), then F-174–F-178
(Batch 7) — both times because an implementing thread assigned and committed an ID before Chief
actually saw the content. Restating the rule again wasn't the fix; this file plus
`scripts/check-register.mjs`'s pending-findings check is.

## How this works

1. Whichever thread surfaces a new finding appends it below, under "Awaiting confirmation" —
   **described, not numbered.** No ID column exists here for a reason: there is nothing to
   self-assign.
2. Chief reviews (relayed by Bala) and confirms by adding `Confirmed-ID: F-NNN` and
   `Confirmed: <date>` directly onto that entry. This is the only edit Chief-side makes to this
   file, and it's what turns "Chief reviewed it" from an in-conversation exchange into a durable,
   checkable artifact.
3. Only once `Confirmed-ID:` exists does the implementing thread write the register row for that
   ID, then move the entry below into "Promoted" (kept for audit, not deleted).
4. `pnpm register:check` enforces this mechanically for every register ID at or above **F-179**
   (the first ID this mechanism governs — the existing 174 findings predate it and are not
   retroactively checked): that ID must have a matching `Confirmed-ID:` line somewhere in this
   file's "Promoted" section, or the check fails. See `scripts/CLAUDE.md` for the check's own
   internals.

Entry template:

```
### <short slug>
Batch: <N>
Surfaced: <date>
Description: <full finding text — context, description, impact>
Confirmed-ID: <blank until Chief fills this in>
Confirmed: <blank until Chief fills this in>
```

## Awaiting confirmation

### dateOnly-silent-calendar-overflow
Batch: F-176/F-173 fix pass
Surfaced: 22 Aug 2026
Description: `dateOnly()` (`services/slot-engine/src/index.ts:303`) has the same vulnerability class
as F-176: it parses a date-only string via `new Date(`${value}T00:00:00.000Z`)` and only checks for
`NaN`, with no calendar-range validation, so an invalid day-of-month silently normalizes to a
different real date rather than being rejected. Live-fire confirmed directly: `dateOnly("2026-02-30")`
returns `2026-03-02T00:00:00.000Z`; `dateOnly("2026-04-31")` returns `2026-05-01T00:00:00.000Z`.
Callers: `datesInRange` (`index.ts:320-321`), used by `fromDate`/`toDate` on both
`POST /resource-pools/:id/availability-overrides` and its `GET` counterpart's query filter
(`index.ts:1477-1478`) — both admin-scoped, gated by `requirePoolScope`. Unlike F-176's own two
endpoints, `availability-overrides` is genuinely wired into the live `/scheduling` admin-web page
today. Real-world exposure is softened because a native `<input type="date">` element normally cannot
produce an invalid calendar date, so the realistic trigger is direct API access rather than a UI typo
— the same caveat F-176 itself carries. Two other call sites of `dateOnly()` (`index.ts:2106`, passing
a `Date` object; `index.ts:2136`, also a `Date` object by that point) go through the safe
object-input branch and are not affected. Surfaced during F-176/F-173's blast-radius investigation;
deliberately not fixed as part of that pass — described here for Chief to assign an ID and prioritize
separately.
Confirmed-ID:
Confirmed:

## Promoted (audit trail)

*(none yet)*
