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

Batch 14 (22 Aug 2026): rotated the `badminton` Postgres role's password on `badminton-demo-vm`, following Batch 13's plaintext-password mistake. New value generated locally (hex, not base64 — avoids `/`/`+`/`=` needing URI-escaping inside `DATABASE_URL`), never printed; `ALTER USER` and the `.env` update both ran via file-based/heredoc methods with query output discarded, not inlined through `gcloud compute ssh --command`. The five `DATABASE_URL`-consuming services recreated (not `caddy`, not `migrate`); all five confirmed healthy via live `/health`, plus one real DB-dependent request (tenant lookup) proving the new credential actually works end-to-end. **First verification attempt was invalid, not just the rotation** — testing over `127.0.0.1` passed for both the new *and* old password, which read as a false success until `pg_hba.conf` was read directly and showed `host all all 127.0.0.1/32 trust`: loopback bypasses password auth entirely on the stock Postgres image. Re-tested against the container's real Docker-network IP (the path `scram-sha-256`-gates, matching what the actual services use) — new password succeeds, old password now cleanly rejected (`password authentication failed`). No repo commit (`.env` is gitignored); all local and VM-side scratch files holding either password value deleted after use. No credential value appears in any tool output this session, verified by construction — every command either discarded query output entirely or printed only fixed OK/FAILED markers and a non-secret row count. **[22 Aug 2026 — correction]** This claim was wrong. `sudo` itself logs the full command line of `-e PGPASSWORD=value`-style invocations to `/var/log/auth.log`, independent of anything the command's own stdout showed — a distinct exposure mechanism from Batch 13's `sed`-mask failure, not caught until the follow-up close-out (Batch 15).

---

Batch 15 (22 Aug 2026): exposure close-out for Batch 13/14's plaintext password. Located the original `sed`-mask failure's root cause with a real test: the pattern searched for `postgres://`, the actual scheme is `postgresql://` — no error, no warning, `sed` just passed the line through unmatched. Checked every plausible capture surface: local Claude Code session transcript (contains it, 6 occurrences, actively-written file I judged unsafe to edit live — flagged, not silently marked resolved); gcloud's local debug logs (checked and confirmed by design they never capture remote command output, not just a lucky non-match); VM `.bash_history` (clean — non-interactive `--command=` invocations don't populate it); `/var/log/auth.log` (contained it — a **second, independent exposure mechanism**: `sudo` logs full command lines including inline secrets, which is how Batch 14's `-e PGPASSWORD=value` verification calls leaked both the old and, by the same structural mechanism, the rotated password — redacted via a script whose own `sudo` invocation carried no secret in its argv); the systemd journal (same content, independently stored in binary form — **no safe per-entry redaction exists**, flagged as genuinely unresolved rather than force a destructive vacuum). Rotated a third time using only heredoc/stdin methods, zero secrets as command-line arguments anywhere; both the new password and a known-dead one verified against the real `scram-sha-256`-enforced network path, not the loopback trust-bypass Batch 14 initially and unknowingly used. **One real mistake during this very cleanup**: an intended structural check (`grep 'PGPASSWORD=' auth.log`) wasn't redacted and printed the second password in plaintext into this session's output — caught immediately, redacted, disclosed rather than absorbed quietly. `deploy/gcp-vm/CLAUDE.md` gained two new traps (the scheme-mismatch mask failure, the sudo command-line audit logging) and root `CLAUDE.md`'s register-status rule now explicitly names the batch-log line as part of the same close-out step, after this exact gap recurred a third time. Commit `107ca38`.

**[22 Aug 2026 — addendum, final close-out for Batches 13/14/15]** Two items surfaced after the
paragraph above was written, both resolved before Chief's sign-off. First, tracing rotation #3 (the
currently-live password) directly against the *recovered* log data — not the design intent of the
heredoc/stdin approach — confirmed it never touched the sed-mask, sudo-log, or session-transcript
surfaces; methodology validated by first confirming it correctly detects the already-known password-#2
leak before trusting a clean result. Second, redacting the sudo-log exposure via `sudo sed -i
's/<secret>/[REDACTED]/g' /var/log/auth.log` — trap 8's own suggested fix — silently broke `rsyslogd`'s
logging: `sed -i`'s default write-new-then-rename orphaned the daemon's open file descriptor on the
old inode, halting all new entries to the visible path for 22 minutes with no error. Caught via a
suspicious timestamp gap, confirmed via `/proc/<pid>/fd/` showing `(deleted)`, recovered by reading the
still-open orphaned fd while the process stayed alive, fixed via `SIGHUP` to force `rsyslogd` to reopen
the current path. `deploy/gcp-vm/CLAUDE.md` gained a third trap (9) documenting this as a worked
example, commit `748a1e1`. journald retention checked directly and reported as-is rather than assumed:
144MB used, no time-based retention configured, size-based defaults only, oldest entry 19 days old —
no bounded "ages out in N days" answer exists, so the residual copy there stays flagged as genuinely
unresolved, not implicitly time-limited. Chief reviewed both findings, assigned and confirmed **F-180**
(`docs/plans/pending-findings.md`, register commit `fc78508`) covering the two original exposure
vectors plus the rsyslog incident surfaced while tracing them, and signed off marking **Batches 13, 14,
and 15 Done.**

---

Batch 16 (22 Aug 2026): F-174 resolved — `admin-web`'s `patternSchema` and `overrideSchema`
(`main.tsx`) tightened from a digit-count-only regex (`patternSchema`, accepted `25:99`) and no
format check at all (`overrideSchema`) to the server's own `validateTimeString` regex, reused
verbatim rather than reinvented. Chief handed over a reference sketch from an isolated sandbox pass
(never pushed); re-verified fresh against real HEAD `88d4a6f` before implementing, per the standing
"don't trust the diff, confirm current code" rule — line numbers had drifted slightly, logic was
identical. Blast radius confirmed exactly two consumers each (own schema definition, own `.parse()`
call), no `z.infer` type consumer. RED/GREEN proven at the regex level (extracted verbatim into a
scratch script, no exported module boundary to import from): pre-fix, `25:99`/`24:00`/`00:60` wrongly
accepted; post-fix, all rejected and legitimate values still pass. Typecheck and build clean, new
regex fragment confirmed present in the compiled `dist` bundle. Backend regression suite explicitly
not run (zero backend files touched). Accepted verification gap stated up front: no `admin-web`
component-test or browser click-through infrastructure exists, same gap already accepted for F-171
and F-178. Commits `4fc37d5` (fix), `6bf248b` (register) — both push-verified against `origin/main`
(`git fetch` + empty diff) and the fix additionally SHA-pinned raw-fetched to confirm the exact regex
landed on origin, independent of the local checkout. **New candidate finding surfaced, not folded
in**: `branchScheduleSchema` (`main.tsx:193-196`) carries the identical weak regex, same file, same
server-backstop shape (`tenant-management`'s `WORKING_HOURS_RE`) — described to Chief for a real ID,
not self-numbered or fixed here.

---

Batch 17 (22 Aug 2026): P0 outage response — `jbc.elitecourts.duckdns.org` reported "tenant not
found" live. **Root cause: exact repeat of `deploy/gcp-vm/CLAUDE.md` trap 10.** Batch 15's third
Postgres password rotation updated `.env` on `badminton-demo-vm` (11:38 UTC) but never recreated the
5 `DATABASE_URL`-consuming app containers afterward, unlike Batch 14's rotation, which explicitly did
— the containers (started 11:07 UTC, before the `.env` write) kept the stale credential in memory
while Postgres began enforcing the new one, so every DB-backed request failed with Prisma `P1000`
platform-wide (`courtowner1` reproduced identically, ruling out a tenant-specific cause) for roughly
2 hours. The "tenant not found" symptom was a red herring: `TenantContext.tsx`
(`packages/ui-shared/src/context/TenantContext.tsx:136`) shows that generic message for *any* failed
API call, masking the real `500`/`P1000` underneath. **Diagnosis, not assumption**: confirmed via the
real API call the SPA actually makes (`/api/tenant/tenants/by-subdomain/jbc`, found by reading
`apiRequest`'s `/api` path-prefixing), the same version SHA (`8ec1d85`) deployed on all 7 components
ruling out a bad code deploy (so Batch 13's prepared rollback was correctly judged the wrong tool —
it can't fix an external `.env` credential mismatch), and a real SHA-256 fingerprint/mtime comparison
between the on-disk `.env` and each container's actual injected environment (`docker inspect
--format '{{json .Config.Env}}'`) — no credential value ever printed. **Fix**: `docker compose up -d
--force-recreate` on the 5 backend services only (`tenant-management`, `identity-auth`,
`slot-engine`, `payment`, `notification` — not `caddy`, not `postgres`), the same operation Batch 14
already used. **Restoration confirmed via real evidence, not `/health`**: `/health` stayed green on
all 7 components throughout the entire outage (masked it completely — see **F-181** below), so the
real proof was the live tenant-resolution API returning `200` with the actual JBC tenant row
(`Japan Badminton Court`, unchanged `createdAt`) and the same call succeeding on `courtowner1`,
confirmed platform-wide, not JBC-only. No code changed, no data touched — container recreate only.
**Timeline**: outage reported → root cause confirmed (real API call, fingerprint/mtime comparison) →
fix executed (user-confirmed force-recreate) → restoration confirmed (real API calls, both tenants) —
approximately 2 hours end to end, matching the outage window itself since diagnosis and fix were
immediate once the investigation started. **F-181 opened** (`docs/findings_register.md`): `/health`
across all 5 `DATABASE_URL`-consuming services checks process liveness only, not a real DB query, so
it cannot detect — and did not detect — this exact class of failure. Chief-confirmed via
`docs/plans/pending-findings.md`. `deploy/gcp-vm/CLAUDE.md` trap 10 updated with a cross-reference to
this incident, making the force-recreate step explicitly mandatory on every rotation regardless of
which prior batch happened to include it. `pnpm register:check` passes (177 rows, Open 102 /
Resolved 75).

---

Batch 18 (26 Aug 2026): F-183 filed — Multi-Slot-Time Booking, Phase 1 (single-court contiguous
booking extension, base 1 hour extendable in fixed 60-minute increments up to an admin-configurable
`maxAdditionalWindows` cap). Documentation only this part of the batch: `docs/plans/pending-findings.md`
entry added to Awaiting confirmation with `Confirmed-ID`/`Confirmed` already filled in (Chief confirmed
the ID inline, waiving the separate round-trip but not the Promoted-requires-a-register-row rule —
moves to Promoted only once F-183 gets a real `docs/findings_register.md` row at implementation/
resolution). Three real corrections landed during the investigation and review that preceded this
filing: `/confirm`, `/cancel`, `/check-in` do not currently run inside any `prisma.$transaction` (new
wrappers required, not extensions of one that existed); `POST /refunds/override` lives in
`services/payment/src/index.ts`, not slot-engine, and is not vulnerable to the admin-picker gap since
it hard-fails on a missing `PaymentIntent` for any child booking id; and — the significant one —
`GET /bookings/my` had no `parentBookingId` filter in the original plan and none of the three mutation
routes rejected a direct call on a child booking id, which chains into a real billing-integrity bug: a
guest could call `/cancel` directly on their own child booking id (passes the existing ownership
check, since they legitimately own that row), freeing the court in every windowId-keyed availability/
capacity query while the parent stayed CONFIRMED with the full paid price and no refund computed on
the child (its price is null by design). Fixed in the plan with a `parentBookingId: null` filter on
`GET /bookings/my` and a `CHILD_BOOKING_NOT_MUTABLE` guard added to `/confirm`, `/cancel`, `/check-in`.
Empirical finding from the investigation: neither real JBC pool is `FIXED_INSTANCE` (both are
`POOLED`, `resourceId` null on every real window) — the `FIXED_INSTANCE` resourceId-continuity guard
is being built now anyway per Chief's decision, dormant until a future tenant needs it. Chief signed
off on the corrected plan; implementation follows in this same batch, tracked separately below once
it lands. Commits: `bcaa329` (this filing — pending-findings.md + batch-log.md).

**[26 Aug 2026 — same-batch update: implementation landed and closed out.]** Chief accepted the
implementation after independently re-verifying the three flagged review items (the `BOOKING_RULE_
INTEGER_FIELDS` reuse, the `CHILD_BOOKING_NOT_MUTABLE` guard placement, and the three commit hashes
against `origin/main`). Shipped as `19da595`: schema migration (additive-only, applied to both
`badminton_db` and `badminton_db_test`), the full `POST /bookings` validation/lock sequence, new
`$transaction` cascades plus the `CHILD_BOOKING_NOT_MUTABLE` guard on `/confirm`/`/cancel`/`/check-in`,
`parentBookingId: null` filters on `GET /bookings/admin` and `GET /bookings/my`, and the
`CHILD_BOOKING_NOT_PREVIEWABLE` reject on `cancel-preview`. **One deviation from the signed-off plan,
flagged and accepted**: `maxAdditionalWindows` was also wired into `POST /booking-rules` and
`PUT /resource-pools/:id/booking-rule` (the existing `BOOKING_RULE_INTEGER_FIELDS`/F-068 validation
pattern reused, not new mechanism) — needed because the register text already describes the field as
admin-configurable, and without this wiring it would only ever be settable by hand against the
database. New regression coverage: `services/slot-engine/src/regression/multi-slot-booking.regression.ts`,
8 sections, real HTTP calls and database read-backs. Full 5-suite regression green, **rebuilt from
`dist` first** — 37/37 slot-engine sections (including all 8 new F-183 cases), 5/5 suites overall,
against `badminton_db_test`. Migration mechanics note: `prisma migrate dev` cannot run in this
non-interactive shell at all; the migration was hand-written (matching this repo's existing
additive-migration convention) and applied via `prisma migrate deploy`, which also surfaced
**pre-existing, unrelated drift** in `badminton_db_test` — two earlier migrations (F-115's unique
index, SCREEN-002's) had their underlying schema objects already present but were recorded as failed
in `_prisma_migrations`. Resolved via `prisma migrate resolve --applied` on each, **confirmed
bookkeeping-only**: both resolved rows show `applied_steps_count: 0` with `started_at` equal to
`finished_at` (the resolve signature — zero migration steps actually executed), the real P3018 "already
exists" errors from the original failed attempts independently prove the objects pre-dated any of
this session's commands, both migrations' SQL contains no data-manipulation statements at all (schema
guards plus a single `CREATE UNIQUE INDEX` each), and the subsequent `migrate deploy` proceeded straight
to the new F-183 migration without re-hitting either conflict — which it could not have done had
`resolve` re-executed either migration's `CREATE UNIQUE INDEX` against objects still in place. Close-out
commit (this same pass): `docs/findings_register.md` gains F-183 as a Resolved row; the
`pending-findings.md` entry moves from Awaiting confirmation to Promoted. `pnpm register:check` run and
confirmed green before committing — the first real exercise of the F-179+ Confirmed-ID enforcement for
this finding, not a no-op the way it was during the filing-only commit above. Commits: `19da595`
(implementation), `dce5b8b` (this close-out).

Batch 19 (26 Aug 2026): F-184 resolved — daily booking cap (guest-only, per-branch).
`BookingRule.maxDailyBookingsPerGuest` (`Int`, default 3, admin-configurable per pool, same
per-pool-not-per-branch precedent as F-183's `maxAdditionalWindows`) caps a guest's active
(`HELD` + `CONFIRMED`) self-service `Booking` rows per branch-local calendar day, counted across
every pool in the branch via `Booking` → `AvailabilityWindow` → `ResourcePool.branchId` — not the
untrusted `Booking.branchId` scalar, filed separately as a described-not-numbered candidate finding
in `docs/plans/pending-findings.md` alongside this one (`booking-branchid-unvalidated-client-scalar`),
per scope discipline (root `CLAUDE.md` rule 9). Enforced inside `POST /bookings`' existing
transaction. `POST /bookings/negotiated` deliberately left unguarded (staff override capacity), but a
negotiated row still correctly counts toward the guest's own next self-service attempt. **One
deviation from the signed-off plan, flagged and accepted — the same class F-183 hit on
`maxAdditionalWindows`**: the plan named `BOOKING_RULE_INTEGER_FIELDS` as the wiring point, but
`POST /booking-rules` and `PUT /resource-pools/:id/booking-rule`'s literal `create()` objects list
fields by name and silently never read `data.maxDailyBookingsPerGuest`, so a non-default value
validated but always persisted as the schema default. Caught by a real regression failure (a
deliberately non-default cap had no effect on a cross-pool test), confirmed with a temporary debug
log, fixed at both call sites. Also required fixing one pre-existing regression section
(`guest-booking.regression.ts`'s "Blocked-window overlap" test — its pool is created directly via
Prisma with no `BookingRule` row, and its shared fixture user had already accumulated bookings from
earlier sections in the same file, so the new default cap of 3 was reached before the test's own
blocked-window assertion ever ran) by giving that section's own pool an explicit high cap. Migration
additive-only (`Int` column with a default), applied to both `badminton_db` and `badminton_db_test`,
confirmed against the real schema on both. New regression suite
`services/slot-engine/src/regression/daily-booking-cap.regression.ts`, 7 sections, registered in
`run.ts`: exactly-at-cap, cross-pool counting, a concurrent `HELD` race, the branch-local midnight
boundary (proven against a purpose-built `Pacific/Kiritimati`, UTC+14, fixture branch — two windows
sharing a UTC calendar date but sitting on different branch-local days are correctly *not* the same
cap-day), the F-183 parent/child-counts-as-one interaction, the negotiated-bypass case, and the
unaffected 0–2-bookings/day regression case. Full 5-suite regression green, **44/44 slot-engine
sections** (37 pre-existing + 7 new), rebuilt from `dist` first, against `badminton_db_test`;
whole-repo typecheck and build clean; `pnpm register:check` and `pnpm diagram:verify` both green.
**Flagged for Chief, not silently resolved**: the sign-off brief's gate said "confirm 9/9 sections
green (not 5)," but the brief's own section list names exactly 7 distinct F-184 scenarios, which is
what was implemented and is what the suite contains — recorded here as a self-detected discrepancy
per root `CLAUDE.md`'s standing rule on this exact situation, rather than guessing at two more
sections to reach 9. Commits: `ce6a9d5` (Commit 1 — pending-findings.md filing, verified on
`origin/main` via SHA-pinned fetch before Commit 2 began), `4fe243c` (Commit 2 — implementation,
verified on `origin/main` via SHA-pinned fetch before Commit 3 began), this row (Commit 3 —
register + batch-log close-out, same pass, per the standing rule that these two updates are one
inseparable step).

Batch 20 (26 Aug 2026): F-186 resolved — `courtSlotIndex` display-only "Court N" number for
POOLED pools. Additive nullable `Int` on `Booking`, computed once per booking inside the same
transaction that creates it: union the occupied `courtSlotIndex` values across every window the
booking touches (the full `lockedWindows` array in self-service `POST /bookings`, not just its
first element, since a `[[F-183]]` multi-window booking is checked independently against each),
assign the lowest free index in `1..pool.capacity` to the parent and every child identically, or
leave it `null` on both if none exists — the existing per-window capacity check already governs
validity independently, so this never rejects a booking. Only computed for `AllocationMode.POOLED`
pools. **Real structural finding during implementation**: `POST /bookings/negotiated` turned out to
be genuinely single-window (one `windowId`, one `tx.booking.create`, no `lockedWindows` array, no
parent/child cascade) — confirmed by reading the route directly rather than assuming symmetry with
self-service. The negotiated compute step was written to match that reality (occupancy union over
the one window, no loop, single write), still applied there because negotiated and self-service
bookings share the same real capacity pool per window. New regression suite
`services/slot-engine/src/regression/court-slot-index.regression.ts`, 6 sections, registered in
`run.ts`: single-booking gets index 1; concurrent second booking gets index 2; a multi-window
booking with different pre-existing occupancy on each of its two windows shares one index equal to
the lowest free across their union; a deliberately engineered no-common-index case (index 1 free on
A/taken on B, index 2 free on B/taken on A) still succeeds with `courtSlotIndex` null on parent and
child; cancelling frees an index for reassignment on the same window; and a negotiated booking's
index is correctly visible to, and skipped by, a subsequent self-service booking on the same
window. Full 5-suite regression green, **50/50 slot-engine sections** (44 pre-existing + 6 new),
rebuilt from `dist` first, against `badminton_db_test`; migration applied to both `badminton_db`
and `badminton_db_test`; whole-repo typecheck and build clean; `pnpm register:check` and
`pnpm diagram:verify` both green. Commits: `bd4a4ac` (implementation), this row (register +
batch-log close-out, same pass).

Batch 20 continued (26 Aug 2026): F-187 resolved — Fast Grid guest booking integration, same
batch as `[[F-186]]`, started only after F-186 was verified pushed to origin. Fast Grid period
tabs (Morning/Afternoon/Evening) in `CourtBooking.tsx`, a duration stepper wired to `[[F-183]]`'s
previously-unpopulated `additionalWindowIds`, and daily-cap/cancellation-policy copy read directly
off the pool state `CourtBooking.tsx` already fetches — no new endpoint, no backend change for any
of this. `LoginScreen.tsx`'s dev-mock Google flow reskinned with Organic tokens (no real OAuth),
and its rejection handling now branches on `err.code` for `GOOGLE_LOGIN_ONLY_FOR_MEMBERS` and
`PHONE_VERIFICATION_REQUIRED` — both real `APIError` codes identity-auth already set, never
previously read here. **Two real deviations from the approved four-file scope, both confirmed via
blast-radius check and explicit sign-off before proceeding — the same discipline `[[F-183]]` and
`[[F-184]]` each hit on their own scope boundaries**: (1) neither `GET /bookings/:id` nor
`GET /bookings/my` included `childBookings`, exactly the scenario the approved plan flagged as a
stop-and-report condition rather than something to decide unilaterally — fixed with an additive
`include` on both (no schema change, no new route); (2) `BookingPay.tsx` was added to the file
list, found during the same check to carry the identical multi-window display gap as
`BookingConfirmation.tsx`/`BookingHistory.tsx` one screen earlier, directly on the payment-decision
screen. `main.tsx`'s "Upcoming Slots" dashboard widget has the same gap and was deliberately left
out — described, not numbered, for the Chief to schedule separately. **Live-fire verified against
the local dev stack**, not just typecheck/build: all 5 backend services plus `guest-member-pwa`
started locally against real JBC branch/pool data in `badminton_db` (a temporary local-only Vite
proxy mirrored the repo's Caddyfile routing since Caddy itself isn't installed on this machine;
reverted before committing, confirmed via `git status`/`git diff` showing no change to
`vite.config.ts`). Verified live: Fast Grid tabs showed real bucketed counts (Morning 3/Afternoon
2/Evening 7); the stepper capped at the pool's real `maxAdditionalWindows` of 1 and summed price
correctly (₹400 → ₹800); a real 2-hour booking's second hour rendered correctly on `BookingPay.tsx`,
`BookingConfirmation.tsx`, and `BookingHistory.tsx` alike, read back from the actual patched
endpoints; both Google-mock rejection codes produced their guest-facing message (via constructed
test users, not real JBC customer data). Full 5-suite regression green, **50/50 slot-engine
sections** (unchanged — the `childBookings` include is purely additive, no new server logic);
whole-repo typecheck and build clean; `pnpm register:check` and `pnpm diagram:verify` both green.
Commits: `056cbca` (implementation), this row (register + batch-log close-out, same pass).

Batch 21 (26-27 Aug 2026): F-190 resolved — Chief-directed six-slice visual revamp of
`guest-member-pwa`'s booking flow onto the Claude Design wireframe (Organic system):
`LoginScreen.tsx`, `CourtBooking.tsx`, `BookingPay.tsx`, `BookingConfirmation.tsx`,
`BookingHistory.tsx`, `CancelBookingModal.tsx`. Every underlying capability this restyles onto
already existed from `[[F-183]]`/`[[F-184]]`/`[[F-186]]`/`[[F-187]]` — a visual-parity pass against
the real committed wireframe source (`JBC Booking.dc.html`, `ds.css`), not new server capability.
`[[F-187]]`'s earlier UI work was functionally correct but never actually ran against the
wireframe files themselves, only a secondhand prose description of them. **Real architectural
conflict resolved during Slice 0**: `ds.css`'s accent palette is fixed/JBC-specific, but the app is
genuinely multi-tenant (`--brand-primary` set at runtime from `Tenant.themeColor`, confirmed used
across 6+ components) — adopting the wireframe literally would have hardcoded JBC's terracotta for
every tenant. Fixed with a new OKLCH ramp-generation utility (`packages/ui-shared/src/lib/colorRamp.ts`)
deriving a full 9-step accent ramp from each tenant's own `themeColor`, verified by reconstructing
`ds.css`'s own real ramp from its base color to within 1/255 per channel; `--color-accent-2` (sage)
stays fixed/universal, preserving the existing one-tenant-color convention. Six slices, each
stopped for review and explicit sign-off before the next began — Slice 0 (foundation tokens +
ramp generator), Slice 1 (`LoginScreen.tsx`), Slice 2a/2b (`CourtBooking.tsx`, the largest), Slice 3
(`BookingPay.tsx`), Slice 4 (`BookingConfirmation.tsx`), Slice 5 (`BookingHistory.tsx`/
`CancelBookingModal.tsx`). **Two real pre-existing bugs found and fixed along the way, not assumed
from the plan**: `showPicker()` throwing outside a trusted user gesture with no fallback (Slice 2a,
fixed with a try/catch `.focus()` fallback); a mid-Slice-5 self-caught investigation error — first
pass wrongly concluded no real venue data was reachable per `BookingHistory.tsx` card (checked
`ResourcePool.branchId`, a bare scalar with no relation) and proposed removing a hardcoded fake
"Coimbatore Hub" string outright, corrected before implementing once `Booking.branchId` (the
actually-relevant field, already used by `[[F-186]]`/`[[F-187]]`'s own `BookingConfirmation.tsx`
fetch) was found to make the real venue name and a real Directions link cheaply reachable instead.
`[[F-186]]`/`[[F-187]]`'s earlier "invalid Razorpay credentials" diagnosis also corrected during
Slice 3: real cause is Razorpay checkout requiring a static IP/HTTPS domain, not a bad key — no
credential rotation needed, documented as a standing environment fact in root `CLAUDE.md`.
**Live-fire verified** against the local dev stack for every slice (real JBC branch/pool data in
`badminton_db`, real bookings created and cancelled afterward, real computed-style checks proving
tenant-derived colors resolve to actual RGB values rather than literal `var(...)` strings on both
tenants). **Zero e2e regressions across all 8 real spec files** — every non-pass root-caused
individually (admin-web not running locally, a local ad-hoc proxy conflicting with `f043`'s
self-hosted one, the pre-existing IST day-boundary seed bug, a pre-existing missing `f061` seed
fixture — none touching the changed files) rather than compared against a raw pass count, since
root `CLAUDE.md`'s own e2e notes make clear no suite-wide number was ever a stable baseline to
begin with. All 5 backend regression suites verified 100% green run individually (`pnpm test:regression`'s
combined orchestration has a pre-existing port-cleanup issue between its own per-service steps on
this environment, unrelated to this batch — confirmed by isolating each suite). Whole-repo
typecheck and build clean throughout. **Filing correction, same batch**: `[[F-188]]`, `[[F-189]]`,
and this finding were all moved straight to "Promoted" in `docs/plans/pending-findings.md` with no
register row ever written, breaking the pattern this same batch-log's own prior entries
(`[[F-183]]`/`[[F-184]]`/`[[F-186]]`/`[[F-187]]`) correctly followed — caught and corrected in two
separate commits (`[[F-188]]`/`[[F-189]]` moved back to "Awaiting confirmation" since they are
still genuinely unimplemented; this finding's real promotion landed only alongside its real
register row, this same pass). **Second self-detected correction, same close-out**: the register
row's first draft used `Resolved: 26 Aug 2026`, matching the finding's original filing date — real
commit timestamps checked directly (`fe33b2a` at `2026-08-26 16:52:58 +0530`, `93218ad` at
`2026-08-27 03:40:37 +0530`) show the work genuinely crossed the IST midnight boundary, so the
correct `Resolved` date is 27 Aug 2026, not the filing date. `pnpm register:check` and
`pnpm diagram:verify` both green. Commits: `fe33b2a` (Slice 0), `9c24d51` (Slice 1),
`0679163`/`9ba36a1` (Slice 2a/2b), `55ac988` (Slice 3), `31d3480` (`CLAUDE.md` addendum), `c1303ce`
(Slice 4), `93218ad` (Slice 5), `1785967` (pending-findings.md filing correction for
`[[F-188]]`/`[[F-189]]`/this finding), this row (real promotion, register row, and batch-log
close-out, same pass).

---

## Batch 22 — F-192 guest-PWA Organic migration (JBC Migration wireframe), in progress

**Findings:** F-192
**Status:** In progress (Slices A–E done; Slice F pending)
**Handed off:** 27 Aug 2026

Six-slice (A–F) visual migration of `guest-member-pwa`'s booking flow off the F-146 palette onto
the Organic system per `wireframe/Badminton Court Booking PWA_Latest/JBC Migration.dc.html` (token
diff sheet, lines 1014–1099) — the follow-on to `[[F-190]]`. Slice A = the token file
(`apps/guest-member-pwa/src/index.css`), foundation-only and additive, same discipline as F-190
Slice 0: no screen markup changes, no live-consumed token repointed. The diff sheet's WAS→BECOMES
repoints (`--surface-background`→cream, `--mint-surface`, `--border-*`, the slot tokens) each move
into the per-screen slice that also edits the component, so a contrast-sensitive change (e.g. a
solid `--slot-selected` fill needs `CourtBooking.tsx`'s slot text colour changed in the same
commit) never lands split across two commits.

**Slice A — commit `638f848`.** Renamed the dead Inter `--font-body` shorthand →
`--font-body-legacy-inter` (zero consumers, frees the canonical name for the Figtree token in a
later slice); added `--slot-selected-label`, `--slot-selected-meta`, `--scrim-warm`,
`--color-destructive` (zero consumers today). Verified: tsc/build clean; compiled-CSS before/after
diff = only the rename + 4 added lines; full-source grep confirms nothing reads `var(--font-body)`
or the new names outside `index.css`; live browser both tenants (jbc `#166534`, courtowner1
`#e11d48`), git-stash before/after computed-style capture on the dashboard and on `CourtBooking`
with a slot selected (71 / 114 elements) — every rendered element byte-identical, only the `:root`
token-declaration lines differ. `pnpm diagram:verify` green (register not touched).

**Slice B — commit `5bdc2c8`.** Tenant-resolve loading/error screens + `BranchSelect.tsx` +
the shared dark band. `packages/ui-shared/src/context/TenantContext.tsx` gains additive
`loadingFallback`/`errorFallback` props (default path unchanged → **admin-web**, which also wraps
`<TenantProvider>` and has none of the Organic tokens, is byte-identical, proven by a git-stash
before/after computed-style capture of its tenant-not-found screen). `main.tsx` passes Organic
fallbacks and migrates `Layout`'s header to the `--color-neutral-900` band (Caprasimo wordmark,
route-derived state label, round `logout-btn` — `id` preserved, real e2e locator dependency) +
footer; this changes the chrome on all 8 authenticated routes, their bodies untouched.
`BranchSelect.tsx` fully re-themed (Caprasimo, white cards, `accent-700`/sage icons; 4×
`text-[var(--brand-primary)]` → `accent-700`, `--brand-primary` left dormant). Verified: `pnpm -r
typecheck` + both app builds clean; live browser both tenants (loading forced via a temp resolve
delay, reverted; identical across tenants); regression — `CourtBooking`/`BookingHistory` `<main>`
bodies byte-identical before/after; e2e vs `badminton_db_e2e` **3 passed / 5 failed / 1 skipped**,
matching the documented late-IST-day baseline (`apps/guest-member-pwa/CLAUDE.md:22`), all 5
failures pre-existing (`f041`/`f043`/`f061` fixture gaps, `guest-booking` = `alignTimeToBoundary`
IST-boundary seed bug). `pnpm diagram:verify` green (register not touched).

**Slice C — commit `d5b9217`.** `BranchDashboard.tsx` + `BranchAbout.tsx` (both "never
migrated"), rendering inside Slice B's Organic band. Dashboard: drops the gradient/`shadow-2xl`
hero; hardcoded "Coimbatore" pill → `MapPin` + real `branchAbout.address`; generic heading →
real `branchAbout.name` (both already in the `/branches/:id/about` response — no new fetch);
pool cards white-on-cream with `accent-200`/`accent-800` price pill, `font-mono` kept.
About: back button → "Back to venue" pill; directions/review links re-themed; info panel
`neutral-100`/`radius-lg`; **removes the two hardcoded `images.unsplash.com` photo fallbacks**
(wireframe annotation) → Organic "No photos yet" placeholder, real photos get
`filter: saturate(.72) contrast(.94)`. All four e2e ids preserved (`view-about-branch-btn`,
`court-pool-card-*`, `branch-directions-link`, `branch-review-link`); `guest-booking.spec.ts`'s
two copy-based locators updated in the same commit (`Welcome to the Branch Dashboard` →
`COURT CATEGORIES`, `Back to Court Dashboard` → `Back to venue`). Verified: build/typecheck
clean; live browser both tenants (jbc success + courtowner1 error state), every token resolves,
zero `surface-mint`/`font-outfit`/`brand-primary` in either `<main>`; diff scope = exactly the
3 files. e2e vs `badminton_db_e2e` **3 passed / 5 failed / 1 skipped** — same profile as Slice B;
`guest-booking` (exercises both migrated screens) went red→green, `f023-full-system` went
green→red on a pre-existing `LoginScreen` phone-input timeout, **confirmed pre-existing by a
git-stash re-run failing identically without Slice C**. `pnpm diagram:verify` green.

**Slice D — commit `811b33a`.** CourtBooking completion (was half-migrated by F-190 Slice 2a/2b).
`index.css`: the 5 `--slot-*` token values repointed — `--slot-selected-surface`/`-border` from a
10% `--brand-primary` tint to a **solid `var(--color-accent-700)` fill**, `--slot-available-border`
→ `--color-neutral-300`, `--slot-available-accent` → `--color-accent-2-700` (sage); amber
`--slot-almostfull-*` unchanged. **`--brand-primary` now has zero consumers anywhere** (still
defined + set at runtime, dormant). `CourtBooking.tsx`: slot-card time/price text →
`--slot-selected-label` (accent-100) when selected, seats line → `--slot-selected-meta`
(accent-200); **sticky reserve button `primaryReserveBtn` → `accent-400` fill / `neutral-900`
text** (old `accent-700`-on-`neutral-900` measured ~2.25:1, below WCAG AA's 3:1 UI floor; new
~6.8:1); DAY/START `bg-surface-mint` card wrappers dropped → plain sections on cream per frame 08;
loading/error/empty/`bookingError` states re-themed; `font-outfit` dropped. The wrapper's inert
`text-ink` kept as-is so the Slice 2a/2b parts stay byte-identical. Verified: build/typecheck
clean; compiled CSS confirms no `--brand-primary` in any `--slot-*` value; live browser both
tenants (JBC full flow + courtowner1 error/loading); **git-stash before/after computed-style
capture of the 12 Slice 2a/2b elements → byte-identical**; e2e vs `badminton_db_e2e`
**3 passed / 5 failed / 1 skipped**, identical spec set to Slice C (all 5 fail at login/fixtures,
not at a CourtBooking locator), `guest-booking` + `findings-verification` pass. `pnpm
diagram:verify` green.

**F-167 (Open) overlap — for Chief at close-out, NOT self-resolved.** `findings_register.md:138`
is exactly "the selected-slot highlight (`--slot-selected-surface`) is weak … a 10% brand tint
over white … likely a contrast or tint-strength adjustment." Slice D replaces that tint with a
solid `accent-700` fill + light text (`811b33a`), which effectively discharges F-167. Chief to
decide at batch close-out whether to mark F-167 Resolved and reference this commit; Slice D did
not touch the register.

**Correction, 27 Aug 2026** (append-only, per project discipline): Slice D's commit message
(`811b33a`) overstated `--brand-primary`'s status as "zero consumers anywhere in the app." A
direct whole-app grep (`var(--brand-primary)` across `apps/guest-member-pwa/src`) finds **16 live
consumers still present**: `BookingConfirmation.tsx:96`, `BookingPay.tsx:209`,
`BookingHistory.tsx:155`, and 13 sites in `main.tsx` (`MainDashboard` body +
`renderMemberSessionCard` — Slice E/F scope). What is actually true, and what Slice D's evidence
supports: **`CourtBooking.tsx` (this slice's own file) has zero remaining `--brand-primary`
consumers** — the `--slot-*` repoint completed exactly what Slice D needed, no more. The variable
becomes fully dormant only once Slices E and F land. The mistake: the pre-commit grep was run on
the two changed files only and the result was generalised to the whole app without re-running it
app-wide.

**Slice E — commit `b70db9c`.** `BookingPay.tsx` + a stacked-dark-band cleanup on both booking
screens. `BookingPay` was mostly migrated by F-190 Slice 3 (its pay button was already
`accent-400`/`neutral-900` — the diff sheet's "same decision, two screens" fix was done *here*
first). Frame-09 remainder: Simulate button emerald → **sage** (`--color-accent-2-*`),
`paymentError` banner → `--color-destructive` on `neutral-100` (matching Slice D's `bookingError`),
loading/error states re-themed, and the Razorpay checkout `options` — `theme.color: '#e11d48'` →
`tenant?.themeColor`, `name: 'Badminton Hub'` → `tenant?.appName || tenant?.name` (both "the
checkout overlay leaves your brand"; verified on JBC → `#166534` / "JBC Courts"; `useTenant` added).

**Stacked-band cleanup — a Slice-B-introduced regression, fixed here one commit after Slice D.**
Slice B's shared `Layout` band made the F-190 Slice 2a/3 per-screen dark headers redundant:
confirmed live that `/branches/:id/book/:poolId` and `/bookings/:id/pay` each rendered **two
stacked `#2e2b25` blocks** (Layout band `0..74`, local header `74..235`). Slice D "completed"
CourtBooking but treated `:369` as already-migrated (true as a no-op). Fixed: `CourtBooking.tsx`'s
dark header → a white pool-summary row + "Change" pill + sage upcoming pill (frame 08);
`BookingPay.tsx`'s dark back-arrow header → a "Back to slots" `neutral-200` pill;
`main.tsx` `bandLabelForPath` `/pay` label `PAYMENT` → `CONFIRM AND PAY`. Both screens now render
**one** dark band. Verified: build/typecheck clean; live browser JBC (one band each, all e2e ids
present, zero `surface-mint`/`font-outfit`/`brand-primary`/`emerald` in either `<main>`);
git-stash before/after computed-style capture — CourtBooking's slot grid/chips/tabs/duration/
rate-summary + BookingPay's pay button/amount/verified badge **byte-identical**; e2e vs
`badminton_db_e2e` **3 passed / 5 failed / 1 skipped**, same set as Slice C/D, `guest-booking`
(full booking→pay→simulate flow) passes. `--brand-primary` after Slice E: `BookingPay.tsx:209`
removed; remaining = `BookingConfirmation.tsx:96`, `BookingHistory.tsx:155`, ~13 in `main.tsx`
(Slice F scope). `pnpm diagram:verify` green.

**F-192 ID:** confirmed by the Chief thread as next-available (independently re-verified against
`origin/main` `ae2238c` — zero references anywhere; `[[F-191]]`'s filing `d05f3f8` is the most
recent register-touching commit). Deliberately **not** yet written into `findings_register.md` or
`docs/plans/pending-findings.md` — register/pending-findings filing is deferred to batch close-out,
landing alongside the real register row once all six slices are verified. This entry is the
implementing thread's in-progress record until then.

## Queued, not yet batched

- **F-088 parts (1), (3), (4)** — deliberately held for its own dedicated session, not queued alongside
  smaller batches, given the coupling and the production-flip stakes.
- **`docs/plans/guest-flow-fix-groups.md` — Groups A through H all still open; Group G partially
  advanced by Batch 4.** Confirmed against the register: **0 of 36 grouped findings are Resolved.**
  Batch 1 predates that document and covered findings it lists under "Cleared before grouping", so no
  group was consumed by it.
