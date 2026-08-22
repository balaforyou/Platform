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

*(none yet)*

## Promoted (audit trail)

*(none yet)*
