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

**Findings:** F-169, F-170 — both Resolved
**Status:** Done
**Closed:** 21 Aug 2026
**Commits:** `73e24d0` (logged both findings; also locked F-088's part-3/4 coupling), `5c2a118` (F-169), `b2de974` (F-170), `d9e4809` (register + batch-log)
**Notes:** Both are **independent of F-088 and of timezone** — reproduced on a UTC branch, and neither
mechanism involves a conversion. F-170 folds in the sweep's silent `continue`; no separate finding for
that. **F-170's reproduction is re-runnable**, and the probe choice matters: use the **member-attendance
endpoint**, not the sweep. The sweep only acts within `gracePeriodMinutes` of `window.startTime`, so
outside that band it returns nothing for every assignment and looks like a null result when it is
simply not due yet — that misread cost a cycle. The fixture seeds three assignments against a pool with
18:00 and 19:00 windows: one declaring 19:00 (matches), one declaring 17:30 (silently rebinds to 18:00
and is reported as 18:00), and one on a pool with no windows (`WINDOW_NOT_FOUND`).

**Closure (21 Aug 2026).** **Shipped:** F-169 adds creation-time validation (**pattern-existence** check, per the prior investigation's correct judgment call — **not** window-count, since generation is lazy/on-access). F-170 **removed the ±1h tolerance entirely** (exact match, "Option A") rather than keeping tolerance with better reporting — justified because **Step 0's production pre-check found zero near-miss rebinds platform-wide**, so the more conservative fallback (Option B, tolerance kept with transparent reporting) was never needed. **Three approved deviations from original plan text:** `INVALID_DAYS_OF_WEEK` added as a real dependency of the alignment check, per-weekday (not pool-level) pattern strictness to match actual generation semantics, `INVALID_TIME` reused over a new error code.

**Honest framing, worth repeating if this comes up later:** production held **exactly one** ACTIVE `MemberGroupAssignment` (a seed row), **already `WINDOW_NOT_FOUND` before either fix**. F-170 closed a real defect, but **not one any live customer data was actually hitting at the time**. Don't let this get overstated as "fixed a live customer issue" in any future summary.

**New findings surfaced:** F-171, F-172. Both real, **IDs assigned by the Technical Lead thread directly rather than routed through Chief first — a process deviation from the handoff brief's explicit instruction.** No actual register collision resulted (the "F-171" informally referenced earlier in the Chief thread was deliberately never committed to the register — redirected to `CLAUDE.md` instead), so the numbers stand, but this is flagged as a process note for future batches: Technical Lead threads should hold new-finding IDs for Chief confirmation **even when next-in-sequence seems obvious**. Now recorded as a standing rule in `CLAUDE.md`.

  * **F-171** — admin UI's start-time dropdown sources from branch hours, not the pool's own pattern, so it will now produce F-169's new validation 400s on submit. **Medium priority** — worth picking up before assignment creation sees real use, not left to drift.
  * **F-172** — admin-attendance/member view lack the sweep's malformed-`startTime` guard. Pre-existing, low priority, deferred.

**Caveats carried forward:** F-169 is creation-time validation only — legacy rows are unmigrated by design. Step 0's production pre-check is a snapshot; re-run before any real rollout if assignment volume changes between now and then.

**Gates:** `register:check` PASS, `diagram:verify` PASS, regression **5/5** re-run post-commit.

---

## Queued, not yet batched

- **F-088 parts (1), (3), (4)** — deliberately held for its own dedicated session, not queued alongside
  smaller batches, given the coupling and the production-flip stakes.
- **`docs/plans/guest-flow-fix-groups.md` — Groups A through H all still open; Group G partially
  advanced by Batch 4.** Confirmed against the register: **0 of 36 grouped findings are Resolved.**
  Batch 1 predates that document and covered findings it lists under "Cleared before grouping", so no
  group was consumed by it.
