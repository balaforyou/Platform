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

**Closure (21 Aug 2026).** **Shipped:** F-169 adds creation-time validation (**pattern-existence** check, per the prior investigation's correct judgment call — **not** window-count, since generation is lazy/on-access). F-170 **removed the one-hour tolerance entirely** (exact match, "Option A") rather than keeping tolerance with better reporting — justified because **Step 0's production pre-check found zero near-miss rebinds platform-wide**, so the more conservative fallback (Option B, tolerance kept with transparent reporting) was never needed. **That tolerance was forward-only, not symmetric:** the predicate was `startTime >= expectedStart` and `startTime <= expectedStart + 1h`, so a window *earlier* than the declared time never matched. Describing it as "±1h" is wrong and contradicts F-170's own register note. **Three approved deviations from original plan text:** `INVALID_DAYS_OF_WEEK` added as a real dependency of the alignment check, per-weekday (not pool-level) pattern strictness to match actual generation semantics, `INVALID_TIME` reused over a new error code.

**Honest framing, worth repeating if this comes up later:** production held **exactly one** ACTIVE `MemberGroupAssignment` (a seed row), **already `WINDOW_NOT_FOUND` before either fix**. F-170 closed a real defect, but **not one any live customer data was actually hitting at the time**. Don't let this get overstated as "fixed a live customer issue" in any future summary.

**New findings surfaced:** F-171, F-172. Both real, **IDs assigned by the Technical Lead thread directly rather than routed through Chief first — a process deviation from the handoff brief's explicit instruction.** No actual register collision resulted (the "F-171" informally referenced earlier in the Chief thread was deliberately never committed to the register — redirected to `CLAUDE.md` instead), so the numbers stand, but this is flagged as a process note for future batches: Technical Lead threads should hold new-finding IDs for Chief confirmation **even when next-in-sequence seems obvious**. Now recorded as a standing rule in `CLAUDE.md`.

  * **F-171** — admin UI's start-time dropdown sources from branch hours, not the pool's own pattern, so it will now produce F-169's new validation 400s on submit. **Medium priority** — worth picking up before assignment creation sees real use, not left to drift.
  * **F-172** — admin-attendance/member view lack the sweep's malformed-`startTime` guard. Pre-existing, low priority, deferred.

**Caveats carried forward:** F-169 is creation-time validation only — legacy rows are unmigrated by design. Step 0's production pre-check is a snapshot; re-run before any real rollout if assignment volume changes between now and then.

**Gates:** `register:check` PASS, `diagram:verify` PASS, regression **5/5** re-run post-commit.

---

## Batch 6 — F-171 / F-172

**Findings:** F-171, F-172 — both Resolved
**Status:** Done
**Closed:** 21 Aug 2026
**Commits:** `aabbf7a` (F-171), `bbe4c7e` (F-172), `d622c30` (register)

**Closure (21 Aug 2026).** **Shipped:** F-171 (`aabbf7a`) sources the admin assignment-creation start-time grid from the pool's actual ACTIVE `AvailabilityPattern` set, intersected across selected days, instead of branch working hours — closing the gap F-169 made user-visible. F-172 (`bbe4c7e`) gives admin attendance and the member view the same try/catch-and-skip guard the sweep already had, routing a malformed `startTime` to the existing `WINDOW_NOT_FOUND` state on both consumers rather than a 500. **RED was worse than anticipated on F-172:** admin attendance's 500 took down the whole branch view, not just the affected row.

F-171's key claim — **client and server boundary logic agree** — proven by extracting the shipped source functions and sweeping **384 real requests** (4 day-combinations × 96 times) against the live server: **zero mismatches**. RED quantified per-scenario: of 16 legacy-grid times, the server rejects **15, 16, 14, and 16** depending on day selection.

**One accepted verification gap, not silently waved through:** F-171's empty-intersection banner and disabled create button are verified by code inspection and a clean typecheck/build only — admin-web has **no component-test infrastructure of any kind** (confirmed repo-wide: no `vitest`/`jest`/`@testing-library`/`jsdom`/`happy-dom`, no runner config, no test file). Logged in F-171's resolution as an `ACCEPTED VERIFICATION GAP`, explicitly distinguished from the 384-point live-fire sweep.

**New finding surfaced and assigned by Chief, not self-assigned:** **F-173** — `branchLocalToUtc` only rejects a `startTime` when `Number()` yields non-finite, so a numerically-parseable but out-of-range value like `'25:99'` parses and silently rolls over to the next day rather than throwing. Neither F-172's new guard nor F-169's creation-time regex catches it. Benign today (rolls to an instant no window occupies), but **F-170's removal of match tolerance means an exact hit is now the only way to bind**, so a future window at that instant would bind silently to the wrong day.

**Two carry-overs from Batch 5's closure, closed here:** the PATCH non-finding folded into F-169's Description with a dated note (confirmed against current code: PATCH accepts only `status`, never touches `startTime`); the self-detected-contradiction process trap added to `CLAUDE.md`.

**Gates:** `register:check` PASS (169 rows, Open 102 / Resolved 67), `diagram:verify` PASS, regression **5/5** (initial 3/5 was a harness-startup flake in two untouched suites, confirmed by isolating and re-running, not assumed).

---

## Batch 7 — domain sweep (F-174 / F-175 / F-176 / F-177 / F-178)

**Investigation closed, logged, 21 Aug 2026 (`ab70166b137922d227507e7aa58747a550e30431`).** Scoped in response to F-171/F-172/F-173 all surfacing from the same three files across two batches — this sweep applied the new blast-radius rule (CLAUDE.md item 3a) to its own boundary up front, listing every file/function in the scheduling/assignment/attendance domain before investigation started, rather than trickling a third time.

**Five findings, all Open, none implemented — this batch was investigation and logging only.** The approved first target (`patternSchema`/`branchScheduleSchema`'s weak client-side time regex) split into two genuinely different outcomes: `patternSchema` is correctly backstopped server-side (**F-174**, papercut), but `branchScheduleSchema` posts to tenant-management, which has **no server-side validation at all** — confirmed live, `workingHoursStart: "25:99"` persists (**F-175**, real data-integrity gap, currently bounded since F-171 already removed the only scheduling consumer of working hours).

**Strongest finding: F-176.** `parseBranchLocalDateTime` silently normalizes out-of-range dates and times into a different day/month/year and **persists** the result — unlike F-173, which merely resolves to a harmless non-match. `2026-08-25T24:00` persists as the next day; `2026-13-01T10:00` persists as the next year. A plausible admin typo silently mis-dates a real availability or blocked window.

**F-177 surfaced mid-sweep, not in the original inventory** — `Branch.timezone`'s own unvalidated persistence, caught by the schema audit rather than the initial file list, a real instance of the blast-radius rule doing its job. Sits directly adjacent to F-088 part (1) but ruled distinct by Chief: F-088 part (1) is "no UI path exists to set it," this is "the API path that already exists accepts anything." Related, not merged; the two should be sequenced with that dependency in mind.

**F-178** closes the sweep's PWA inventory item: the member session card's `WINDOW_NOT_FOUND` copy asserts a single cause that F-170 and F-172 have since made one of three.

**F-088's timezone-flip coupling was deliberately out of this sweep's scope and was not folded in**, stated explicitly per the agreed boundary — even where F-177 sits directly against it. Every result in this batch reproduces on a UTC branch with no timezone conversion involved.

**Sequencing set by Chief for follow-on fix work:** F-176 alone first (highest severity, ordinary trigger, no dependency); F-175 + F-177 together second (same tenant-management handler, same missing-validation root cause, different fields — one implementation pass); F-178 third (standalone, cheap); F-174 last (zero data-integrity stakes, already backstopped both places it appears).

**Gates:** `register:check` PASS (178 rows counted including headers/dividers; 174 findings total, Open 107 / Resolved 67), `diagram:verify` PASS. Verified independently on origin, SHA-pinned.

**Next up:** Batch 8 — CLAUDE.md restructuring (root + per-service split) plus a real enforcement mechanism for the ID-assignment rule (written-only version has failed twice: F-173, F-174–F-178). Decided directly with Chief, 21 Aug 2026 — not reflected in this log until now. F-176's kickoff (highest-priority finding from Batch 7's domain sweep) is sequenced to follow Batch 8's close, not run in parallel. Walkthrough Groups 1–3 remain queued behind the domain sweep's fix work.

---

## Batch 8 — CLAUDE.md restructuring (root + per-service split) + ID-assignment enforcement

**Status:** Done
**Closed:** 22 Aug 2026
**Commits:** `7cea90b`

**Split root `CLAUDE.md` (109 → 95 lines) into root plus four nested files**, each justified by
content genuinely exclusive to it — nothing invented, verified via grep against actual file
locations before moving anything: `scripts/CLAUDE.md` (mutator-naming convention, deferred-parser
note), `deploy/gcp-vm/CLAUDE.md` (5 VM/Caddy/SSH traps — a warranted addition beyond the original
brief's list, since that's where the Caddyfile and docker-compose.yml the traps reference actually
live), `packages/database/CLAUDE.md` (F-067/F-115 migration precedent), `apps/guest-member-pwa/
CLAUDE.md` (CourtBooking.tsx precedent, e2e time-of-day seed bug, e2e-suite specifics). Eight other
directories from the original brief's list got **no file**, reported plainly rather than forced:
current CLAUDE.md had zero content genuinely exclusive to any of them. Added a "Core principle"
section (generic-framework/reusable-component mindset) — the one deliberate new-content addition,
per the original brief. Content-loss audit: every original line traced to exactly one destination,
verified by phrase-grep across the full new file set, not asserted from memory.

**Two self-detected gaps between "established practice" and what CLAUDE.md actually said**, found
via an explicit audit before finishing (not five, not zero): the push-verification rule ("batch not
Done until pushed to origin, independently verified") existed nowhere in the repo despite being
treated as standing practice; the register-status-must-match-reality rule existed for *starting*
work (item 6) but not for the *closing* obligation that let F-047/F-087 sit `Open` for days after
being fixed. Both added as new standing-workflow items (6 and 7), explicitly flagged as new content
rather than silently folded in.

**Built the ID-assignment enforcement mechanism**, approved for same-batch build rather than deferred:
new `docs/plans/pending-findings.md` (findings staged there described-not-numbered; Chief confirms
by writing a `Confirmed-ID:` line) plus a new rule 6 in `scripts/check-register.mjs` — every register
ID at or above **F-179** must have a matching `Confirmed-ID:` entry there, or the check fails.
Floor set at F-179 since the existing 174 findings predate the mechanism and aren't retroactively
enforced. **Proven red/green on scratch copies, real register never touched**: an unconfirmed F-179
scratch row failed with exactly one violation (`unconfirmed-id`); adding a matching `Confirmed-ID:`
to a scratch pending file made the same register pass clean. Re-ran `pnpm register:check` against
the real, unmodified `docs/findings_register.md` before and after the script change — still 174
rows, still clean (the real file has nothing at or above F-179 yet, so the new rule is a no-op on
real data until the next finding).

**Gates:** `register:check` PASS (174 rows, Open 107 / Resolved 67, unaffected — this batch never
touched the register itself), `diagram:verify` PASS.

---

Batch 9 (22 Aug 2026): F-173+F-176 resolved together — calendar/clock range validation added to `branchLocalToUtc`/`parseBranchLocalDateTime`, plus adjacent guard on `/branches/:id/member-attendance`. Commits `de60d61` (fix), `66aa641` (register). New candidate `dateOnly()` staged in `pending-findings.md`, confirmed as F-179.

---

Batch 10 (22 Aug 2026): F-179 resolved — `dateOnly()` (`services/slot-engine/src/index.ts`) now regex-validates `YYYY-MM-DD` and range-checks month/day against `daysInMonth` before parsing, closing the same vulnerability class as F-176 (`POST`/`GET /resource-pools/:id/availability-overrides`). Commits `68bd648` (fix), `f526d0e` (register). RED/GREEN proven live against `badminton_db_test` with `psql` read-backs; full regression 5/5.

---

Batch 11 (22 Aug 2026): F-175+F-177 resolved together — `workingHoursStart`/`workingHoursEnd` and `Branch.timezone` now validated on `POST /tenants/:id/branches` and `PATCH /branches/:id`, mirroring `slot-engine`'s `validateTimeString`/`isValidTimeZone` locally rather than adding the platform's first cross-service dependency. Commits `07a8c08` (fix), `78b9843` (register). The batch's real find wasn't in either finding's original text: `scripts/provision-tenant.mjs`, not `admin-web`, is the actual currently-active creator of both fields on both endpoints — confirmed with a real (non-`--dry-run`) run against `badminton_db_test`, which also caught that `--dry-run` fakes every response locally and would never have exercised the new validation at all. No new candidate findings staged. Sequencing per Batch 7's domain sweep: **F-178 next.**

---

Batch 12 (22 Aug 2026): F-178 resolved — the member session card's `WINDOW_NOT_FOUND` copy neutralized to "No session found for today," reusing the admin attendance view's own already-shipped answer to the identical ambiguity rather than inventing cause-specific copy. Commits `95e9626` (fix), `8ec1d85` (register, with a dated correction: the finding's "three states already correctly distinguished server-side" claim overstated it — two of the three real-world causes share one code branch). Last item from Batch 7's domain sweep before F-174. **This entry was itself backfilled** — missed at the time, same gap shape as Batch 8's placeholder and F-179's missing entry, now the third instance; caught and flagged before Batch 13 rather than let ride.

---

Batch 13 (22 Aug 2026): production deploy to `badminton-demo-vm`, HEAD (`8ec1d85`) across all seven components. Two-checkpoint process (read-only audit, then a plan, each signed off separately before any execution) — Step 1 found the live stack split across three different stale SHAs (F-146/F-155/F-163), not the single deployed commit assumed going in; schema was already current, 15/15 migrations applied, zero divergence. Deployed backend-5 first, `caddy` (frontend bundles) second, per the plan's asymmetric-safety reasoning — verified via live `/health`/`version.json` on the real HTTPS URL, not container status alone. Real live spot-checks post-deploy: F-156's `/bookings/my` fetch confirmed firing (real login, real network request, `200`); F-153's mobile slot list confirmed fully reachable at 375px viewport (post-selection click-through not completed — a browser-pane tooling limitation this session, flagged rather than silently skipped). One real mistake during verification: a `sed` mask pattern failed and printed the production DB password in plaintext to this session's logs — flagged immediately, password not repeated, rotation recommended. Rollback plan (captured pre-deploy image IDs, per-service local re-tag) stayed unused — no rollback triggered.

---

## Queued, not yet batched

- **F-088 parts (1), (3), (4)** — deliberately held for its own dedicated session, not queued alongside
  smaller batches, given the coupling and the production-flip stakes.
- **`docs/plans/guest-flow-fix-groups.md` — Groups A through H all still open; Group G partially
  advanced by Batch 4.** Confirmed against the register: **0 of 36 grouped findings are Resolved.**
  Batch 1 predates that document and covered findings it lists under "Cleared before grouping", so no
  group was consumed by it.
