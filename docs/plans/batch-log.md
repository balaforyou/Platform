# Batch Log — cross-thread work tracking

Maintained by the Chief/PO thread. One entry per batch handed off to a Technical Lead thread.
**Source of truth remains `docs/findings_register.md` and git** — this file is a fast index, not a
replacement for either.

## Format per entry

```
## Batch N — <short name>
Findings: F-xxx, F-yyy
Handed off: <date>
Status: In progress | Done | Blocked
Commits: <hashes, added as they land>
Notes: <anything a future thread needs that isn't in the register yet>
```

### Standing rule — what "Done" means

**A batch is not Done until its findings are actually `Resolved` in the register, not merely
committed.** A shipped, verified, pushed fix whose entry still sits under `## Open` is drift, and it
reads to every later thread as unfinished work. This rule exists because it happened: F-047 and F-087
were fully fixed, verified and pushed, each carrying a dated evidence note, and both sat Open for days
until a routine count caught them. Verify with `pnpm register:check` and a section check, not from
memory of having committed.

Two corollaries:

- **A partially-fixed finding stays Open, and the batch says so** rather than claiming Done. F-046 and
  F-038 are both correctly Open with one half discharged each.
- **Moving a finding to Resolved can break `pnpm diagram:verify`**, because the diagram tags findings
  by section. Run both gates after any status change, not just `register:check`.

---

## Batch 1 — F-153/F-156/F-167 (mobile slot feedback, upcoming bookings, tint observation)

**Findings:** F-153, F-156, F-167
**Status:** Done
**Commits:** `075192b` (implementation), `ebea64d` (plan)
**Notes:** F-156's register text was corrected — the root cause was an unwired placeholder, not a cache
gap; the card had never been connected to booking data since the baseline commit. F-167 opened from an
observation surfaced during F-153's investigation and deliberately kept out of F-153's own fix.

## Batch 2 — Register tooling + drift cleanup

**Findings:** F-038, F-073, F-146, F-163, F-125, F-126, F-127 (register status corrections)
**Status:** Done
**Commits:** `cffdc62` (CLAUDE.md environment facts and traps), `58ce58b` (checker), `45bd91c` (F-073
restore), `2479cc2` (f023 spec debt), `be55d14` (F-127 + plan docs)
**Notes:** Committed `scripts/check-register.mjs`, wired as `pnpm register:check`. F-073's restore
uncovered an untested spec (`f023-full-system.spec.ts`), since run and passing. Shared-parser refactor
(`scripts/lib/register.mjs`) deferred — logged as a CLAUDE.md note, not a finding, because importing
`generate-flow-diagram.mjs` would execute its module-scope CLI.

## Batch 3 — F-047 (test:e2e env loading) + F-046 (fixture identity collisions)

**Findings:** F-047 (Change A + Change B) — **Resolved**; F-046 — **Open**, one half discharged;
F-168 (retracted, was F-046)
**Status:** Done
**Commits:** `d5258e1` (Change A), `ac7a15d` (F-046), `7fe17f8` (Change B)
**Notes:** Change A required a new dedicated `badminton_db_e2e` database (not `badminton_db_test`, to
avoid regression-suite contamination). Change B required widening `packages/test-harness`'s
disposable-name guard to include `e2e`. **That guard is shared by all five regression suites — any
future change to it needs regression 5/5, not just an e2e run.** F-046's actual fix diverged
significantly from its own register text: the fix the entry proposed would have converted a crash into
a silent wrong-row bug, and the collisions it described were already handled by existing cleanup —
re-investigate before trusting any register text on identity or fixture issues. F-046 stays Open: the
sweep-reach half is deliberately unfixed. The e2e baseline is 4/4/1 but is **time-of-day dependent**
(CLAUDE.md, Verification traps) — never treat it as a fixed number without re-running.

## Batch 4 — F-087 + F-088 part (2)

**Findings:** F-087 — **Resolved**; F-088 — **Open** (part 2 discharged only)
**Status:** Done
**Commits:** `7e41843` (F-087). See also `73e24d0` under Batch 5, which carries F-088's coupling note.
**Notes:** F-087 fixed on **both** `availability-windows` and `blocked-windows` — the register text
originally named only one, and the sibling audit it asked for had never been run. F-088's audit found
the migration surface is small (JBC has zero recurring assignments) but discovered a **hard blocking
coupling: F-088 parts (3) and (4) must ship together** — assignment resolution and window generation
use different timezone-conversion functions that agree only because everything is currently on UTC.
This coupling must stay explicit in any future F-088 plan. The audit is a **snapshot** (windows span
19–23 Aug) — re-run before any real flip. **Access facts, non-obvious and each cost a failed attempt:**
the deployed database uses role **`badminton`**, not `postgres`, in container
**`gcp-vm-postgres-1`**, reached via `gcloud compute ssh badminton-demo-vm --zone=us-central1-a
--tunnel-through-iap`.

## Batch 5 — F-169 / F-170 (assignment matching defects, from F-088's audit)

**Findings:** F-169, F-170
**Status:** Done
**Commits:** `73e24d0` (logged both findings; also locked F-088's part-3/4 coupling), `5c2a118` (F-169 fix), `b2de974` (F-170 fix)
**Notes:** Both are **independent of F-088 and of timezone** — reproduced on a UTC branch, and neither
mechanism involves a conversion. F-170 folds in the sweep's silent `continue`; no separate finding for
that. **F-170's reproduction is re-runnable**, and the probe choice matters: use the **member-attendance
endpoint**, not the sweep. The sweep only acts within `gracePeriodMinutes` of `window.startTime`, so
outside that band it returns nothing for every assignment and looks like a null result when it is
simply not due yet — that misread cost a cycle. The fixture seeds three assignments against a pool with
18:00 and 19:00 windows: one declaring 19:00 (matches), one declaring 17:30 (silently rebinds to 18:00
and is reported as 18:00), and one on a pool with no windows (`WINDOW_NOT_FOUND`).

**Outcome (21 Aug 2026).** Both shipped. **F-170 resolved as Option A — the one-hour tolerance removed entirely, exact match only — chosen on a real production read, not assumption.** The Step 0 pre-check found **zero** near-miss rebinds: the whole deployment holds **exactly one** ACTIVE `MemberGroupAssignment`, a seed row on a pool with no `AvailabilityPattern` of any status and no window in a 14-day span, so it already resolved to nothing and its behaviour is unchanged. JBC holds none. **Two corrections to the batch's own assumptions, both established against code:** (1) the tolerance is **forward-only**, not symmetric — a window earlier than the declared time never matched; (2) a pool-level "has a pattern" check is **not sufficient**, because patterns are weekday-scoped and a pool may hold several (`availabilityGeneration.ts:247-258`), so F-169's check is per declared weekday. `PATCH /member-group-assignments/:id` was confirmed **not** to inherit the gap — it accepts only `status` — so no finding was needed there. Two new findings came out of the work: **F-171** (the admin UI's start-time dropdown derives from branch working hours, not patterns, so it can now offer times F-169 rejects — medium priority) and **F-172** (admin attendance and the member view lack the sweep's try/catch on a malformed stored `startTime` — low priority, deferred). The re-runnable reproduction noted above held up exactly as described and was used for F-170's RED/GREEN across all three consumers.

---

## Queued, not yet batched

- **F-088 parts (1), (3), (4)** — deliberately held for its own dedicated session, not queued alongside
  smaller batches, given the coupling and the production-flip stakes.
- **`docs/plans/guest-flow-fix-groups.md` — Groups A through H all still open; Group G partially
  advanced by Batch 4.** Confirmed against the register: **0 of 36 grouped findings are Resolved.**
  Batch 1 predates that document and covered findings it lists under "Cleared before grouping", so no
  group was consumed by it.
