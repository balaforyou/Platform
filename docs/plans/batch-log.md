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

## Batch 22 — F-192 guest-PWA Organic migration (JBC Migration wireframe)

**Findings:** F-192
**Status:** All six slices (A–F) landed, verified, and pushed. **Awaiting Chief close-out** —
register row + `pending-findings.md` promotion not yet written (deliberately deferred to Chief per
this file's own rule below); F-167 register-status decision pending; frames 03/04 deferred work
needs scheduling. Not `Done` until those land.
**Handed off:** 27 Aug 2026 · **Slices complete:** 27 Aug 2026
**Commits:** `638f848` (A) · `5bdc2c8` (B) · `d5b9217` (C) · `811b33a` + `2085e6e` (D) ·
`b70db9c` + `01b1269` (E) · `4ac7272` (F). Plus per-slice batch-log back-reference rows below.

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

**Slice F — commit `4ac7272`.** Final token migration, batch close. Six files:
`main.tsx` (MainDashboard body + `renderMemberSessionCard` + `upcomingBadge` + `ProtectedRoute`
spinner), `BookingConfirmation.tsx` (loading/error + "Go to Dashboard" link — the last
`bg-surface-mint` on that screen — + pending amber → `--slot-almostfull-*`), `BookingHistory.tsx`
(loading/error + `<h2>` accent-word trick dropped + "Go Dashboard" pill + `getStatusBadge` HELD
amber → `--slot-almostfull-*` / CANCELLED red → muted `--color-destructive` + cancel-hover warm),
`CancelBookingModal.tsx` (`bg-black/80` → `--scrim-warm`; `#dc2626` → `--color-destructive`; close
button `p-1.5` ~34px → real 44px per frame 13's "fix it in code"; copy capitalised),
`LoginScreen.tsx` (shared dark band on sign-in + OTP, OTP in-band back arrow removed — the page's
"Wrong number?" already does `setOtpSent(false)`; error banner → `--color-destructive`; the
"never migrated" authenticated card fully tokenised), `PwaInstallPrompt.tsx` (a `brand-primary`
**Tailwind-class** consumer the plan's `[var(--brand-primary)]` grep missed — `bg-brand-primary`
→ `accent-700`, `bg-surface-mint`/`font-outfit` → neutral).

**Scope boundary confirmed during Slice F planning:** wireframe frames **03** (`NEW · name capture`
modal) and **04** (`NEW · landing with a booking` — the dashboard "upcoming-to-top" restructure +
profile menu) are `NEW` feature work, **not migration**. A whole-repo search found **no
"Stream 2 / Stream 3"** anywhere (code, docs, plan file) and **no "Edit your name" / name-editing
control** in any component — the frame-04 profile-menu "Edit your name" button is a mockup element
with zero implementation. Slice F re-tokened the *current* MainDashboard markup only.
**→ For Chief: frames 03 & 04 are unscheduled `NEW` work with no code owner — needs a decision on
whether/when to build (they were the original handover's "Streams 2–3 deferred to later
investigation").**

**Batch result — F-146 → Organic migration is complete for `guest-member-pwa`:**
`var(--brand-primary)` has **zero styling consumers app-wide** (verified against *both* the
`bg-[var(--brand-primary)]` arbitrary-value form and the `brand-primary` Tailwind-class form; the
single remaining textual reference is `BookingPay.tsx:194`'s defensive `getComputedStyle` *read*
of the runtime value for the Razorpay `theme.color` fallback, primary path `tenant.themeColor`).
`bg-surface-mint` and `font-outfit`: **zero app-wide.** `--brand-primary` stays defined in
`index.css` and set at runtime by `TenantContext.tsx:116`, **fully dormant — not aliased**, per
the handover's standing decision. `tailwind.config.js`'s `brand.*` token block is left in place,
also dormant. A handful of inert root-wrapper `text-ink`/`text-ink-muted` classes remain by
design (documented in each file) — they keep the git-stash regression diffs byte-identical and
still resolve to valid F-146 semantic tokens.

**Correction, 27 Aug 2026** (append-only): Slice F's commit message (`4ac7272`) and the
`PwaInstallPrompt.tsx` line above describe that file as "a `brand-primary` consumer the plan's
grep missed". That framing is inaccurate — `PwaInstallPrompt.tsx` was inside Slice F's scope from
the start: the plan-mode document's verification gate required "`var(--brand-primary)` — zero
consumers across `apps/guest-member-pwa/src`", which necessarily includes it. The file-list table
enumerated five files and not this one, and the consumer was located during implementation via
the Tailwind-class grep rather than the arbitrary-value grep — but the *scope* (the zero-consumers
gate) always covered it. The migration itself is correct and needs no code change; only this
record needed the correction.

**F-167 (Open) — discharged by Slice D (`811b33a`), Chief to decide register status.** See the
Slice D entry above: `--slot-selected-surface` went from the weak 10% brand tint F-167 describes
to a solid `accent-700` fill + light label/meta tokens. Slice D did not touch the register.

**Verification across the batch:** every slice — build + `pnpm -r typecheck` clean; live browser
on both real tenants (jbc `#166534`, courtowner1 `#e11d48`); git-stash before/after
computed-style capture proving the already-migrated parts byte-identical; e2e vs
`badminton_db_e2e` holding steady at **3 passed / 5 failed / 1 skipped** from Slice C onward
(the 5 failures pre-existing — `f023` login-input timeout stash-proven in Slice C, `f041`/`f043`/
`f061` documented fixture gaps in `apps/guest-member-pwa/CLAUDE.md`). Slice F's three passing
specs (`guest-booking`, `member-self-confirm`, `pwa-install-dismissal`) between them assert every
e2e-locked Slice F string/id: `#confirmation-title` "Booking Confirmed!", `text=Cancel Your Match`,
`#member-session-card` + "Attendance confirmed" + "No recurring member session is scheduled for
you today.", `#confirm-member-attendance-btn`, `#book-court-dashboard-btn`, `text=Welcome back to
<appName>`, `Install <appName>` + `Later`, and the full phone-OTP login flow.
`pnpm register:check` + `pnpm diagram:verify` green after each slice. One mid-batch correction
appended above (Slice D's over-broad `--brand-primary` claim, `2085e6e`).

**Still owned by Chief at close-out (not done by the implementing thread):**
1. **File F-192.** It has no `pending-findings.md` entry and no `findings_register.md` row yet
   (deliberate — see `docs/plans/pending-findings.md` process rules; `scripts/check-register.mjs`
   requires a `Confirmed-ID:` line in "Promoted" for any ID ≥ F-179 before its register row is
   valid). Chief adds the pending-findings confirmation, then the register row, then flips this
   entry's Status to `Done`.
2. **F-167 register status** — Resolved-by-Slice-D (`811b33a`), or keep Open for its own pass.
3. **Wireframe frames 03 & 04** — schedule the `NEW` name-capture modal + dashboard restructure,
   or explicitly shelve them.

**F-192 ID:** confirmed by the Chief thread as next-available (independently re-verified against
`origin/main` `ae2238c` — zero references anywhere; `[[F-191]]`'s filing `d05f3f8` is the most
recent register-touching commit). Deliberately **not** yet written into `findings_register.md` or
`docs/plans/pending-findings.md` — register/pending-findings filing is deferred to batch close-out,
landing alongside the real register row once all six slices are verified. This entry is the
implementing thread's in-progress record until then.

## Batch 23 — F-193 deploy pipeline + local compose

**Findings:** F-193
**Status:** Done — all four sub-batches implemented, each independently verified against real
code, real CI runs (`#167`/`#171` green), and a real production promotion of `354590012bdf`
to the live VM. F-193 `Resolved` in `findings_register.md`; `pnpm register:check` +
`pnpm diagram:verify` green.
**Handed off:** 28 Aug 2026 · **Done:** 28 Aug 2026
**Commits:** `f63b8be` + `7edf010` (sub-batch 1 — local compose files); sub-batch 2 (PR #1,
merged) — `46d510b` (pipeline), `bda310b` (pre-existing lint debt), `c79cd67` + `c706864`
(CI must build the workspace packages before typecheck — `pnpm install` has no postinstall),
`3790d40` (`--retries=0` on the non-blocking e2e step); sub-batch 3 (PR #2, merged) —
`0d93c17` (Batch 2 reliability: wait for all 7 components, not just slot-engine — main
`#169` race), `0cadc98` (Docker Hub push from the integration job); sub-batch 4 — `12c0e32`
(`deploy/gcp-vm/promote.sh` + `.gitattributes` + doc reconciliation); this row + the F-193
register row (register close-out).

F-193's brief has four internal sub-batches: (1) local compose files, (2) CI pipeline,
(3) Docker Hub tag+push, (4) GCP promotion script. Each gets its own plan → sign-off →
evidence cycle.

**Sub-batch 1 — local compose files.** New: `docker-compose.dev.yml` (fast hot-reload loop,
overlay on the base `docker-compose.yml`; each backend runs its existing `tsx watch` dev
script in `node:22-bookworm`, frontends run `pnpm exec vite --host 0.0.0.0` since the dev
scripts pin `--host 127.0.0.1`; deps in shared named volumes; one-shot `install` service),
`Caddyfile.dev` (root Caddyfile route table, compose-DNS targets), `docker-compose.gcp-verify.yml`
(repo-root overlay remapping Caddy to `8080:80` via `!override`, for `verify-deployment.mjs`
and Playwright — *not* placed in `deploy/gcp-vm/` because a `docker-compose.override.yml`
there would auto-apply to VM deploys; trap recorded in `deploy/gcp-vm/CLAUDE.md`). Plus
`dev:up`/`dev:down`/`db:reset:dev` scripts and a "Local development stacks" section in
`docs/deploy_via_dockerhub_reference.md`.

Evidence (live, not reasoned): both stacks brought up for real; dev stack — all 7 app
containers + Postgres healthy, all 5 service `/health` + guest `/` + admin `/admin/` = 200
through Caddy.dev; hot reload proven by editing `services/notification/src/index.ts` live
(tsx `change … Restarting`, pid 48→78, probe field round-tripped, reverted, tree clean) with
no `docker` command. Verification-gate stack — built all 7 production images, `migrate`
applied all migrations (SHA guard passed), `verify-deployment.mjs http://localhost:8080
5196a54c…` → **all 7 components PASS**, exit 0. Both stacks torn down after.

Deviations from brief, both flagged and signed off: `docker-compose.gcp-verify.yml` at repo
root (not `deploy/gcp-vm/docker-compose.override.yml` — VM auto-load hazard); frontends via
`pnpm exec vite` not the `dev` script (hardcoded `--host 127.0.0.1` can't be overridden by
append); `node:22-bookworm` not `-slim` (slim omits openssl → Prisma engine load failure).

**Sub-batch 2 — CI pipeline (`46d510b`).** `.github/workflows/ci.yml` rewritten from one
`install/lint/typecheck` job into three: `checks` (adds `register:check` + `diagram:verify`
as real gates; Node 22 + pnpm 11 via dropping the `version:` pin so `pnpm/action-setup@v3`
reads `packageManager` — verified against the v3 README), `regression` (the 5 suites vs an
ephemeral `postgres:16` service container, `badminton_db_test`), `integration` (build + up
the real shipped stack via `docker-compose.gcp-verify.yml`, `verify-deployment.mjs`
all-7-PASS as a hard gate, then Playwright e2e as `continue-on-error` with an explicit
passed/failed/skipped summary — non-blocking because `apps/guest-member-pwa/CLAUDE.md`
documents the suite as pre-existing 4/4/1 fixture debt; signed off). `regression` +
`integration` both `needs: checks`. New committed CI templates `.env.ci` and
`deploy/gcp-vm/.env.ci` (copied into place by the workflow — `env_file: .env` always reads
the on-disk file regardless of `--env-file`). `docker-compose.gcp-verify.yml` extended to
also publish the stack Postgres on `5432` for the e2e `badminton_db_e2e` seed/migrate step.
Toolchain-alignment decision (Node 22 / pnpm 11) folded in as a precondition, not a separate
change.

Two masked gates surfaced when the pipeline first ran, both the same class as the debt this
sub-batch exists to make real: (1) `pnpm run lint` had never passed — 11 pre-existing errors
(5 `no-useless-escape`, one `no-extra-boolean-cast`, an unnecessary `@ts-ignore`, a dead
`react-hooks` disable directive, one `prefer-const`, two in `wireframe/` uploads). Fixed in
`bda310b` (separate commit — not F-193 scope, debt this batch surfaced); `wireframe/**` added
to `.eslintrc.json` `ignorePatterns`. Confirmed pre-existing, not toolchain-caused: reproduces
on Node 22 and 24. (2) `pnpm run typecheck` had never been *reached* (lint failed first) and
needs the workspace packages built — `pnpm install` does no `prisma generate` or package
build. Fixed via a `./.github/actions/setup` composite action (`c79cd67`, then `c706864` to
build *all* `packages/*` after a hand-listed set missed `@badminton/test-harness`), verified
against a genuinely fresh `git clone` + `pnpm install`.

**Evidence — CI run `#167` (`33148070551`, head `3790d402`): conclusion `success`.**
`checks` 0.7 min (lint, typecheck, register:check, diagram:verify all green), `regression`
1.5 min (5 suites), `integration` 14.2 min (7 production images built, `Wait for Caddy`,
**`verify-deployment.mjs` all-7-PASS — the hard gate**, `badminton_db_e2e` provisioned +
migrated, Playwright e2e ran `continue-on-error` and the job still concluded `success`,
report artifact uploaded, stack torn down). Cross-checked by `#166` (retries=2) also
`success`. **Halt-on-red proven for real** by `#164` (lint fail) and `#165` (typecheck fail):
both show `regression` and `integration` as `skipped` — the pipeline stops at the failing
gate and spends no Docker-build minutes. e2e pass/fail/skip counts live on `#167`'s
job-summary page (`e2e summary line` step); not retrievable via the token-less API.

**Sub-batch 3 — tag + push to Docker Hub (branch `f193-batch3-push` / PR).** Automates
`deploy_via_dockerhub_reference.md` steps 2–4. Two guarded steps added to the `integration`
job **immediately after `verify-deployment.mjs`** — `docker/login-action@v3` then tag+push
all 7 `gcp-vm-<svc>` images as `balamuralikrishna/badminton-platform:<svc>` (movable) and
`:<svc>-<full-sha>` (immutable), every main run (F-193 decision 1). Push-from-`integration`,
not a separate rebuild job: the pushed bytes are the exact images `verify-deployment.mjs`
just approved — a rebuild on another runner could diverge (moved base tag, resolution
timing) and relocate the "verified ≠ shipped" gap `verify-deployment.mjs` exists to close.
Two shape changes to Batch 2: `integration` now `needs: [checks, regression]` (so the push
is gated on the whole pipeline, +~1.5 min); job-level `concurrency` scoped per-ref so
main-push runs serialise (no movable-tag race) while PR runs cancel-in-progress for fast
feedback. Push steps `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
— build + verify still run on PRs, credentials never exercised there.

Two GitHub repo secrets added by Bala: `DOCKERHUB_USERNAME` (`balamuralikrishna`) and
`DOCKERHUB_TOKEN` (Docker Hub Read/Write access token).

Known limitation, described to Chief for an ID (not fixed here): base images
`node:22-bookworm-slim` / `caddy:2-alpine` are moving tags, not digest-pinned — a
`:<svc>-<sha>` tag is immutable once pushed but a re-run on the same commit is not
guaranteed byte-reproducible. Touches the shipped Dockerfiles and the local deploy path, so
its own finding.

**Evidence — CI run `#171` (merge commit `354590012bdfb279312c363e66f819e022212f13`):
green.** `Log in to Docker Hub` + `Tag and push all 7 images` both ran (not skipped) on the
real merge-triggered push; all 7 components present on Docker Hub with matching
movable/immutable digests at that SHA. Also proved the Batch 2 readiness fix (`0d93c17`):
`main #169` (identical tree to green PR run `#168`) had failed `Verify deployment` in 0s —
`Wait for Caddy` only polled slot-engine while caddy `depends_on` services with
`service_started`; the fix polls all 7 endpoints verify-deployment checks.

**Sub-batch 4 — GCP promotion script (`deploy/gcp-vm/promote.sh`).** Consolidates
`deploy_via_dockerhub_reference.md` steps 5–10 into one bash script that runs on the VM,
takes a target SHA, and: **fetches `docker-compose.yml` / `Caddyfile` / `verify-deployment.mjs`
for `<sha>` SHA-pinned from `raw.githubusercontent.com`** (the VM's app tree is a plain copy,
not a git checkout — discovered during implementation; this makes the topology always match
the images with no operator sync step) → snapshots **both** the running images
(`gcp-vm-<svc>:rollback`) **and** the config (`*.rollback`) before any mutation → installs
compose.yml / Caddyfile only if they differ CRLF-insensitively (F-149 reconciliation, dated
audit copy on change) → pulls the 7 `:<svc>-<sha>` immutable images → retags → writes
`GIT_SHA=<sha>` to `.env` (the key Compose interpolation actually reads for the migrate
guard's `EXPECTED_GIT_SHA` — the old manual Step 7's `EXPECTED_GIT_SHA=` edit was dead
weight) → `export GIT_SHA` + `sudo -E docker compose run --rm migrate` (F-077 guard, never
bypassed) → `up -d --force-recreate` the **6** long-running services (`migrate` is one-shot,
`postgres`'s image is unchanged — neither is bounced) → **`wait_for_ready`** polls all 7
endpoints verify-deployment checks until 200 → Caddy HTTP-fallback grep must read `0` →
`verify-deployment.mjs https://elitecourts.duckdns.org <sha>` in a throwaway `node:22`
container, all 7 PASS. `--rollback` restores both halves. `set -euo pipefail`, ERR trap
prints the rollback command, `bash -n` + `shellcheck` clean.

Deviations from the approved plan, all flagged: (1) `up -d --force-recreate` scoped to the 6
long-running services (not unscoped) so the live customer Postgres is not bounced — the only
`.env` delta is `GIT_SHA`, which no running service reads; (2) git-checkout prerequisite
replaced by SHA-pinned GitHub-raw fetch (VM is not a git repo); (3) `--rollback` extended to
restore config, not just image tags (the fetch mechanism means the script now writes VM
config, so a mid-run failure could leave new config against old images); (4) `wait_for_ready`
added — the first live run deployed correctly but its verify step raced the recreated
services' port-bind (Caddy 502) and the ERR trap reported failure; same class as `0d93c17`,
same fix shape.

**Evidence — real end-to-end promotion against the live VM, `354590012bdf…`:**

- **First run** (`b86k…`): F-077 guard PASS (`[verify-build-sha] ok — image matches the
  deploy target (354590…)`), migrations clean, 6 services recreated, Postgres untouched
  (`Up 47 hours`), Caddy grep `0`, config `:ro` drift reconciled with audit copy. Verify
  step raced the boot → 502 → exit 1 (the deploy itself was correct). `wait_for_ready` added.
- **Clean re-run** (`blye2hn73`, exit 0): configs `already current` (idempotent — no
  rewrite), images `up to date`, guard PASS, 6 recreated, Postgres `Up 2 days` (not
  bounced), `wait_for_ready` visibly rode out `Connection refused` → `502` → `all 7
  endpoints answering after ~12s`, Caddy grep `0`, **`verify-deployment.mjs` all 7 PASS at
  `354590012bdf`**, `== PROMOTION COMPLETE ==`.
- **Independent re-verification** (this session's shell): `verify-deployment.mjs
  https://elitecourts.duckdns.org 354590…` → all 7 PASS; `elitecourts` / `jbc.elitecourts`
  / `courtowner1.elitecourts` all HTTP 200, `ssl_verify_result=0`; live API calls return
  `version: 354590012bdf…`. Fixed a **pre-existing split deploy** (services `eba3b93`,
  frontends `5196a54c`).
- **Rollback armed, not executed:** 7 `gcp-vm-<svc>:rollback` image tags +
  `docker-compose.yml.rollback` + `Caddyfile.rollback` on the VM.

Latent issue noted for the record (not blocking — both files exist on this VM): earlier
`install_if_changed` / snapshot lines used `[ -f x ] && cp …`, which aborts under `set -e`
when the file is absent (fresh/rebuilt VM). Fixed to `if [ -f x ]; then …; fi` before this
sub-batch closed.

## Batch 24 — F-195 adminHub build track (Phase 1: dependency upgrade + week-over-week trend)

**Findings:** F-195 — **Open / In progress** (one dedicated track; Phase 2 + build-order slots 2–6
still ahead — same "track stays Open while its slices land" treatment as F-088). F-201, F-202
surfaced and staged (see `docs/plans/pending-findings.md`).
**Handed off:** 29 Aug 2026
**Status:** In progress — two sub-pieces landed and independently verified; Phase 2 next.
**Commits:** `c90a362` (adminHub trend), `91ad666` (F-195 Phase 1 deps)

Two unrelated changes that shared a working tree only because the dev stack stayed up between
them — committed separately.

**Sub-1 — adminHub week-over-week guest-occupancy trend** (`apps/admin-web/src/main.tsx`,
`styles.css`). Branch-level aggregate occupancy % + a WoW delta in the Overview Guest Occupancy
panel header. Reuses `GET /branches/:id/guest-occupancy` twice from the client (`date`,
`date − 7d`), aggregates client-side (Option A, Chief-approved — a display %, not a money total).
New `shiftIsoDate` / `aggregateOccupancy` pure helpers + a named local `TrendIndicator` component
(built as a promotion candidate for `@badminton/ui-shared` — Phase 2 will port/re-theme it first).
`.metric-card` / `.occupancy-*` untouched; the wireframe token architecture is deferred to one
later cross-cutting adminHub pass. Live-fire on both tenants: every TrendIndicator branch matched
hand-computed values; regression 5/5, `f023` e2e green. Stages **F-201**
(`guest-occupancy-branch-endpoint-date-unvalidated`, low).

**Sub-2 — F-195 Phase 1: `apps/admin-web` toolchain upgrade** (dependency-only, no visual/mockup
changes). React 18→19.2.8, Vite 5→8.2.2, `@vitejs/plugin-react` 4→6.1.1, lucide-react
0.435→1.34, react-router-dom 6.26→6.30.6, `@tanstack/react-query` 5.52→5.101.4; `typescript`
specifier `^5.4.5`→`^5.9.0` workspace-wide (lockfile-neutral — already resolved 5.9.3).
- **Not admin-web-scoped in the end** (Q1's flagged risk, realized): pnpm hoists one
  `@types/react`; with two majors present, `guest-member-pwa`'s transitive React libs
  (`react-router@7`, `lucide@1.27`) resolved the hoisted 19 and broke its typecheck. Fix
  (Option B, Chief-approved): explicit `@types/react@^19.2.18` / `@types/react-dom@^19.2.5` in
  `guest-member-pwa`'s own devDependencies — **runtime `react`/`react-dom` stay 18.3.1**. Its type
  env now compiles against React 19 defs (a compatible superset; its router/query/lucide all
  support 19); build byte-identical.
- **Vite 8 dev-server fix (Option 1, Chief-approved retroactively):** `@badminton/ui-shared` gains a
  `"type": "module"` + `"exports"` field so Vite 8's dep optimizer pre-bundles it instead of
  serving it raw (`@fs/…?t=`), which had caused repeat re-optimization → a second React instance →
  `createRoot`-twice / `removeChild` NotFoundError in dev under React 19 + StrictMode.
  `apps/admin-web/vite.config.ts` gains `optimizeDeps.include` + `resolve.dedupe`. Same fix will be
  needed when guest-pwa moves to Vite 8 — solved once, in the shared package. `ui-shared` peer
  ranges also widened (`react`/`react-dom` `|| ^19`, lucide `|| ^1`).
- Evidence (0–9): Node floor ✓; `pnpm install` clean, zero peer warnings; admin-web typecheck +
  Vite 8 build clean (374 kB / 108 kB gz, up from 333/96 — React 19 runtime); full `pnpm -r
  typecheck` green; regression 5/5 (identity-auth isolation pattern as usual); `f023` e2e green;
  7-section × 2-tenant smoke with zero console errors; production `Dockerfile.caddy-static` builds
  + serves under Vite 8; `register:check` green. guest-pwa re-verified (byte-identical build,
  clean dev server). Stages **F-202**
  (`guest-occupancy-parallel-generation-transaction-exhaustion` — unbounded `Promise.all` fan-out
  of per-pool window generation, each its own interactive transaction; courtowner1's 88 polluted
  pools × concurrent calls → `P2028`; 1-pool tenant unaffected; pre-existing, low live exposure).

## Batch 25 — F-195 admin-v2 build track (Slice 1: Google login + fingerprint + landing)

**Findings:** F-195 — still **Open / In progress** (Slice 1 of the new-app build; further slices
ahead). F-203 (Google OAuth) and F-196 (WebAuthn step-up) — **Resolved** this batch. F-197 (PWA
installability + service worker) — installability + the real service worker delivered; **stays
Open** for the deferred notification opt-in half. F-204 (walk-in booking + manual payment) — ID
confirmed, **not implemented**, sequenced later. F-194 gains a Chief-approved addendum (the e2e
suite's two failure modes, found while checking this batch caused no e2e regression — see
`docs/plans/pending-findings.md`). All five IDs were referenced in the Slice 1 plan/handover
documents and commit messages before Chief formally confirmed them; confirmed as-is (no renaming)
on 30 Aug 2026, recorded as dated appends in `pending-findings.md`, not silent backfills.
**Handed off:** 30 Aug 2026
**Branch:** `admin-v2-slice-1` (off `main` `cfe41ce` — NOT off the Phase 2 branch; see the
scaffold note below)
**Commits (code):** `61feda8` scaffold · `8979467` step 2 OAuth · `7638695` step 3 WebAuthn ·
`fb132c1` .env staging · `b62f073` step 4 frontend · `1d35b84` step 4a service worker ·
`52830e9` step 5 Caddy/Docker/deploy-verify. Plan-doc amendment: `e3909f9` (§7 added
retroactively). Register/pending-findings/batch-log close-out: this commit.

A wholly new PWA (`apps/admin-v2`), not a retrofit of `admin-web` — this supersedes F-195's
original 9-sub-area `admin-web` retrofit scope. The old investigation stays valid as reference
material feeding the new app's stories one at a time.

**Scaffold — branch-base correction.** First scaffold landed on `f195-phase2-tier-a` (the
checked-out branch), not `main`. Caught in review before backend work; re-scaffolded off `main`
`cfe41ce` as `admin-v2-slice-1`. Verified zero real dependency on the Phase 2 branch (admin-web
was already React 19.2.8 / Vite 8.2.2 with the `optimizeDeps`/`dedupe` block on `main`; Tailwind
v4 is added fresh to admin-v2's own `package.json`). `pnpm install` clean, zero peer warnings.

**Step 2 — admin Google OAuth** (`services/identity-auth`). New `POST /auth/admin/google/verify`,
separate from the members/staff mock. `src/adminGoogleAuth.ts`: `verifyGoogleIdToken()` — real
`jose` JWKS signature/iss/aud/exp verification, injectable key source (tests sign a local RS256
keypair, zero live Google). `resolveAdminUser()` — two-step, no `tenantId` filter on the `User`
match, then `roleAssignment.count` scoped explicitly to `(userId, that user's own tenantId)` with
`role in (OWNER, BRANCH_MANAGER)`; distinct outcomes not_found / role_excluded /
multiple_tenant_match (never a silent pick) / ok. Error codes: BAD_REQUEST 400 /
INVALID_GOOGLE_TOKEN 401 / ADMIN_ACCOUNT_NOT_FOUND 403 / ADMIN_ROLE_REQUIRED 403 /
MULTIPLE_TENANT_MATCH 409 / DEV_LOGIN_DISABLED 403. Dev fallback `dev-admin-token-<email>`, gated
`NODE_ENV !== 'production'` (OTP dev-code pattern). First `vitest` in the repo, package-local.
Seed: `apps/admin-v2/tests/seed-admin-v2-data.mjs` resolves JBC by subdomain at runtime, upserts
`User{balaforyou@gmail.com, STAFF}` + `RoleAssignment{OWNER, branchId:null}`, JBC only. Evidence:
19 vitest; live-fire 200 + 403×2 + 401 + 400 against a running stack; `identity-auth` regression 7/7.

**Step 3 — WebAuthn / fingerprint step-up.** New `WebAuthnCredential` model + `User` back-relation
+ migration `20260829120000_webauthn_credential_f196` (additive `CREATE TABLE`; `prisma migrate
diff` against the applied schema is empty). `@simplewebauthn/server` 13. Four routes under
`/auth/admin/webauthn/`: register options+verify (admin JWT), login options+verify (unauth,
discoverable credentials). Challenge in a 5-min signed httpOnly cookie — no challenge table.
Cloned-authenticator replay guard (`assertCounterProgress`). `resolveRpConfig` env-driven,
localhost dev default, throws on a non-suffix rpID. Session issuance refactored to a shared
`issueAdminSession` helper — both `google/verify` and `webauthn/login/verify` call it (cannot
drift); `identity-auth` regression 7/7 re-verified after the refactor. Evidence: 17 vitest (36
total); live-fire shape+rejection on all four routes; full register→login ceremony deferred to
step 4's browser virtual authenticator.

**Step 4 — frontend flows** (`apps/admin-v2`). Five design decisions, all reviewed and approved:
(1) no `ui-shared` `TenantProvider` — its hostname resolution hard-blocks the single-domain admin
app; tenant comes from the JWT. (2) own `src/auth/AdminAuthContext.tsx` — copies `ui-shared`
AuthContext's proven refresh/parseJwt/timer/dedupe pattern but not the provider (it is
`TenantProvider`-coupled); `ui-shared` untouched. (3) `email` added to the admin JWT
(`issueAdminSession` + `/auth/refresh`) so the landing page survives a reload; new `GET
/tenants/:id` in `tenant-management` (mirrors `by-subdomain`, same no-auth posture) for the venue
name. (4) static `public/manifest.json` — guest-pwa's per-tenant injected manifest doesn't fit a
single-domain app and is too late for Chrome's install check. (5) Playwright CDP virtual
authenticator as the register→login ceremony proof (neither MCP browser exposes
`WebAuthn.addVirtualAuthenticator`; Playwright is the repo's existing e2e tool and drives the
same CDP virtual authenticator). Components local to `src/components` (Button, Card, TextField,
Banner/InlineError, Spinner, PwaInstallPrompt — ported from guest-pwa, tenant-branding dropped).
Screens: LoginScreen (GIS Google button + passkey fast-path + `import.meta.env.DEV` dev-token
form), LandingPage (email + role chips + venue), EnrollPasskeyPrompt (skippable, per-user
localStorage gate). Evidence: 9 vitest; Playwright e2e against a CDP virtual authenticator —
criterion 2 (Google-only), criterion 1 (manifest + SW), criterion 6 (non-admin rejected cleanly),
criteria 3–5 end to end (enrol via real UI → sign out → passkey fast-path → remove authenticator
→ clean fallback), plus the §7 SW test. Zero live Google (criterion 7). `tenant-management`
regression 5/5 (first touch this slice).

**Step 4a — real service worker** (retroactive, plan §7 added at `e3909f9`). Replaced the step-4
pass-through stub: cache name `admin-v2-shell-<build-sha>` (stamped post-build by
`scripts/stamp-sw.mjs` from `GIT_SHA` → git short SHA → 'dev'); `activate()` deletes every other
`admin-v2-shell-*` cache; cache-first shell with clone-to-cache; network-first `/api/*`; both-miss
→ a real 503 `Response`; `push`/`notificationclick` listeners wired for F-044 Phase B (no backend
trigger yet). e2e extended: shell cache populated, cache-name format, stale-cache cleanup on a
real unregister+reload re-activation, offline → 503. Build-step proves SHA-in-cache-name
(`GIT_SHA=deadbeef1234` → `admin-v2-shell-deadbeef1234`). Not covered by e2e: push delivery (needs
F-044 Phase B backend); stale-content-after-deploy (needs two SW builds in one run) — both noted
in the step-4a report.

**Step 5 — Caddy + Docker + deploy-verify** (plan §8). Caddyfile: `@adminV2Host host
admin.elitecourts.duckdns.org` + a `/srv/admin-v2` handle block, after the `/api/*` handlers,
before the guest-pwa catch-all. `Dockerfile.caddy-static`: `VITE_GOOGLE_CLIENT_ID` ARG/ENV; third
`RUN GIT_SHA="$GIT_SHA" pnpm --filter @badminton/admin-v2 run build` (same `$GIT_SHA` the
`version.json` line uses — one source, no drift); `version.json` + `COPY` for admin-v2.
`docker-compose.yml`: caddy build-arg `VITE_GOOGLE_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID}`;
`identity-auth` env `GOOGLE_OAUTH_CLIENT_ID` + `WEBAUTHN_RP_ID`/`_ORIGIN`/`_NAME` (prod defaults —
beyond §8's text but required, or prod WebAuthn 500s). `verify-deployment.mjs`: optional 3rd arg
`<adminV2BaseUrl>` (8 components when given, 7 when omitted). `promote.sh`: `wait_for_ready` +
verify extended for the admin host, incl. `admin.…/api/identity/health` (proves the host block
doesn't shadow the API handlers). `.env.ci`: `GOOGLE_OAUTH_CLIENT_ID` placeholder. Requires at
deploy: `$SITE_ADDRESS` extended in the VM `.env`, `caddy` recreated for the cert, the VM's
`promote.sh` copy updated. Evidence: `docker compose config` resolves clean; `verify-deployment.mjs`
3rd-arg + stale-bundle-FAIL tested against a mock; **the Docker image build was confirmed via the
CI `integration` job on the PR (run 33287588578, success, 14m 17s)** — a local build was blocked
all session by Docker Desktop instability.

**Close-out (Phase A/C):** full regression **5/5 suites, 81/81 sections** on freshly-rebuilt
`dist` against `badminton_db_test` (identity-auth 7/7, tenant-management 5/5, slot-engine 50/50,
payment 12/12, notification 7/7). `register:check` green. `diagram:verify` green (no admin-v2
finding is diagram-tagged). The e2e suite (F-194, non-blocking) sits at 8 failed / 1 skipped —
**identical to `main`** across four recent `main` runs; this branch adds zero e2e delta.

## Batch 26 — admin-v2 Slice 1 production cutover (seed script + deploy config + manual-test bug fixes)

**Findings:** [[F-195]] — still **Open / In progress** (Slice 1 now live in production; further slices
ahead). No new register row — the seed script and the bug fixes below are Slice 1 operational
close-out under the F-195 umbrella. **Chief IDs still unassigned** for: the `seed-admin-v2-data.mjs`
`branchId: null` bug (Bug 1), the CI-placeholder-secrets-in-production bug (Bug 2), and the
`ADMIN_DEV_LOGIN` decoupling — all three are fixed and merged but not yet numbered; do not
self-assign.
**Handed off:** 31 Aug 2026
**Status:** Done
**Branch/PRs:** `fix-admin-dev-login` → PR #5 (`85b2731`) · `seed-admin-v2-script` → PR #6 (`5c4b532`)
**Commits:** `d55524e` (Bug 1) · `0288d97` (Bug 2) · `1c90f8f` (ADMIN_DEV_LOGIN) · `666975a` /
merge `5c4b532` (production seed script)

**Production seed script** — `packages/database/scripts/seed-admin-v2.mjs` (new, sibling of
`verify-build-sha.mjs`). One-off idempotent seed of the Slice 1 admin (`balaforyou@gmail.com`, JBC
`OWNER`, `branchId` null) into the real `badminton_db`. `findFirst` + `create`/`update` (not
`roleAssignment.upsert` — Prisma compound-unique `where` rejects explicit `null`, F-115).
F-077 guard wired via `spawnSync` of `verify-build-sha.mjs`, aborts non-zero before any DB write.
Hard-fails if the `jbc` tenant is absent. `DATABASE_URL` from `process.env` directly; imports
`../dist/index.js`. JBC only, no `courtowner1`. Evidence (`badminton_db_test`): run 1 creates
User + Role; re-run reports "already existed (updated in place)" with identical ids, no error.
Negative F-077: missing `EXPECTED_GIT_SHA` and a stale image both refuse the write. `identity-auth`
regression 7/7, `tenant-management` 5/5, `@badminton/database` build + repo typecheck clean. CI on
PR #6 green (checks + regression + integration). **Run against production by Bala** via the reviewed
bind-mount `docker compose run --rm -v <script>:…:ro --entrypoint sh migrate` (with `GIT_SHA`
exported for the guard) — end-to-end verified live 31 Aug 2026: Google login, WebAuthn on desktop
and mobile, and `curl`.

**Bug 1 — `seed-admin-v2-data.mjs` `roleAssignment.upsert` on `branchId: null`** (`d55524e`). The
local (dev/e2e) seed used `roleAssignment.upsert` with `branchId: null` in a compound-unique
`where`; Prisma 5.x rejects explicit `null` there (F-115 / `NULLS NOT DISTINCT` limitation).
Replaced with `findFirst` + `create`/`update`. Same pattern later reused verbatim in the production
seed script above. Both create and update paths proven.

**Bug 2 — CI placeholder secrets shipped to production** (`0288d97`). `promote.sh` PULLS
CI-built images without a rebuild (F-193), so any value CI consumed at build time ships to
production verbatim — the guest-pwa bundle was serving `rzp_test_ci`, a broken Razorpay checkout.
Fix (Option A, Chief-approved): real **public-by-design** values in `deploy/gcp-vm/.env.ci` for the
two `VITE_*` build-args only — `RAZORPAY_KEY_ID` (publishable test key `rzp_test_TJllXnaezST7MV`)
and `GOOGLE_OAUTH_CLIENT_ID` — with a "PUBLIC vs SECRET" header comment. Every `*_SECRET`,
`JWT_SECRET`, `POSTGRES_PASSWORD`, `INTERNAL_SERVICE_KEY` stays fake (backend-runtime, the VM
supplies real ones). Rebuilt `:caddy` via the exact CI path; greps confirm the real values and zero
placeholders. Likely an F-038 addendum rather than a new finding — Chief to rule.

**ADMIN_DEV_LOGIN — decouple admin dev-login from `NODE_ENV`** (`1c90f8f`, PR #5). The
`dev-admin-token-<email>` bypass on `/auth/admin/google/verify` was gated `NODE_ENV !== 'production'`
(mirroring the OTP dev-code pattern). But the demo VM runs `NODE_ENV=development` on purpose (guest
OTP `123456`, phone self-register), so the bypass was **live on `admin.elitecourts.duckdns.org`**.
Fix: new default-off / fail-closed `ADMIN_DEV_LOGIN` env flag; the gate is now
`ADMIN_DEV_LOGIN !== 'true'` → `DEV_LOGIN_DISABLED` 403. Wired `true` into `.env.ci`,
`docker-compose.yml` (`${ADMIN_DEV_LOGIN:-}` with a SECURITY-CRITICAL comment), and the admin-v2
e2e `global-setup.ts`; documented commented-out in `.env.example`. **The production VM `.env` must
never set it.** Live-fire: flag unset/empty → `DEV_LOGIN_DISABLED` while guest OTP still works on
the same stack; flag `true` → 200 + session. `identity-auth` regression 7/7. Confirmed live on
production after the PR #5 deploy: `dev-admin-token-*` → `DEV_LOGIN_DISABLED`.

**Operational note (not a finding yet):** the GCP VM ran out of disk from accumulated old Docker
images — `promote.sh` pulls a fresh 7-image `:<svc>-<sha>` set every deploy and never prunes the
previous one. Bala + the Technical Lead pruned manually 31 Aug 2026. Candidate fix: a filtered
`docker image prune` at the tail of `promote.sh` after health checks pass, keeping current +
previous SHA for rollback.

**Close-out:** `register:check` green. `diagram:verify` green (no F-195-track finding is
diagram-tagged). F-195 Description carries a dated Batch-26 production-cutover note.

## Batch 27 — F-189 guest court display + F-205 / pipeline record backfill

**Findings:** [[F-189]] — **Resolved**. Also in this PR: [[F-205]] Resolved-row + pending-findings
backfill (delivered and merged in Batch-less PR #9 → `c40d267`, never recorded), and the CI
pipeline consolidation (PRs #10 + #11 → `bb21b3c`).
**Handed off:** 2 Sep 2026
**Status:** Done
**Branch/PR:** `f189-guest-court-display` → PR #12
**Commits:** `b1acb11` (F-189 implementation) · this row (register + pending-findings + batch-log close-out)

**F-189 — real assigned court on guest confirmation/history.** `GET /bookings/:id` and
`GET /bookings/my` gained `resource: true` on their `include` (additive — no schema change, no new
route, `GET /bookings/my`'s `parentBookingId: null` filter untouched). `BookingConfirmation.tsx`
renders a "Court" row (id `confirmation-court-name`) between Venue and Players; `BookingHistory.tsx`
a hash-icon row per card. One fallback on both: real `resource.name` ([[F-205]]) → cosmetic
`Court N` from `courtSlotIndex` ([[F-186]]) → row not rendered (legacy pre-[[F-205]] booking, both
null). `BookingPay.tsx` deliberately unchanged (pre-payment screen, court not a payment-decision
input); `main.tsx` "Upcoming Slots" widget out of scope ([[F-188]]). Evidence: whole-repo typecheck
(14 pkgs) + slot-engine + guest-member-pwa build clean; slot-engine regression **55/55** unchanged
(additive `include`); live-fire on the local dev stack against the real JBC Coimbatore pool in
`badminton_db` — negotiated POOLED booking assigned `Resource` "Court 1", DB read-back + raw
`GET /bookings/:id` and `GET /bookings/my` both carried `resource.name`, legacy `resourceId: null`
booking fell back to `courtSlotIndex`; browser pass on both screens (test bookings cancelled after).
TL independent verification: real remote SHA + diffstat + file-by-file diff on all 5 files,
`register:check` / `diagram:verify` re-executed in a throwaway worktree — all matched. Signed off
2 Sep 2026.

**F-205 backfill** — POOLED booking-creation (`POST /bookings`, `POST /bookings/negotiated`)
hardcoded `resourceId: null`; `assignPooledCourt` now picks the first free real Resource (stable
`createdAt` order) across the booking's windows, `courtSlotIndex` derived from its position so
[[F-186]]'s cosmetic number and the real court agree; fallback to `resourceId: null` + [[F-186]]'s
scan when Resource count ≠ capacity. Delivered PR #9 → `c40d267`, commit `9ab2750`; CI regression
55/55 on the merge commit, +5 sections. ID was Chief-assigned directly in the handover (never went
through "Awaiting confirmation") — pending-findings entry labelled "F-205 close-out" accordingly.
Two plan corrections + one design decision (`courtSlotIndex`/`Resource` forced to agree, settled
with Bala) written up in `claude/technical-lead-f205-closeout-for-chief.md`.

**CI pipeline consolidation** (Bala-approved, unrelated to the findings) — `integration` + the
Docker Hub push now run on `push: main` only (once per change, post-merge), not on every PR;
merge queue was unavailable on a personal-account public repo (HTTP 422), so this is Option B.
A PR now runs `checks` + `regression` only. Branch ruleset `22084138` on `main`: require PR,
required checks `checks` + `regression`, block force-push and deletion. PRs #10 + #11 → `bb21b3c`.

**Close-out:** `pnpm register:check` green (196 rows, Resolved 90). `pnpm diagram:verify` green — F-189 touches
no diagram-tagged endpoint. PR #12 gated on `checks` + `regression`; `integration` runs post-merge
per the Batch-23 pipeline as consolidated here. Merged `094631b`; post-merge pipeline all green
(checks + regression + integration), images pushed at that SHA.

## Batch 28 — F-212 slot-exhaustion UX (date level)

**Findings:** [[F-212]] — **Resolved**. Chief-assigned in the Slice-2 handover (31 Aug 2026),
no register row or pending-findings entry until now — same backfill shape as [[F-205]] in Batch 27.
**Handed off:** 2 Sep 2026
**Status:** Done
**Branch/PR:** `f212-next-available-date` → PR #13
**Commits:** `02ee17c` (implementation) · this row (register + pending-findings + batch-log close-out)

**What it was:** [[F-187]] auto-advances an empty period tab to the first non-empty one within a
day; a fully-exhausted *date* only showed a generic "No slots available on this date" message,
with no pointer to which date has availability.

**What shipped:**
- New unauthenticated `GET /resource-pools/:id/next-available-date?from=<YYYY-MM-DD>` in
  `slot-engine` — forward-only server-side search, `{ date: <first date with a bookable window> }`
  or `{ date: null }`. The per-window bookability rules ([[F-155]] started-window filter,
  blocked-window overlap, HELD/CONFIRMED capacity) were factored out of `GET /availability`'s
  loop into a shared `windowBookable` helper (behaviour-preserving refactor — that route still
  scores every window); `poolHasAvailabilityOnDate` short-circuits on the first free window.
- **Plan correction folded in** (rule 9 — scope-precision, not a new finding): the handover said
  a flat "14-day forward search". A date past `today + guestOpenWindowDays` is one
  `GET /availability` itself rejects (`BROWSE_AHEAD_LIMIT_EXCEEDED`), so pointing a guest there is
  actively misleading. Real ceiling is `min(from + 14, today + guestOpenWindowDays)` — anchored
  at today, the same anchor `GET /availability` uses; 14 stays only as an outer cap for a pool
  with an unusually large `guestOpenWindowDays`. The TL plan already flagged and cleared this.
- `CourtBooking.tsx`: a fetch-completed effect calls the endpoint when a date resolves empty,
  `setBookingDate(next)`, and shows an **announced** inline notice ("No slots on {from} — showing
  the next available date, {to}") — not [[F-187]]'s silent jump (Bala's call, 2 Sep 2026: a date
  change is a bigger move than a tab switch). Guards mirror [[F-187]]: one search per distinct
  date, no re-search off the endpoint's own navigation (a destination that is also empty — a real
  race — shows the generic message, no bounce), any manual date pick re-arms. `{ date: null }` or
  a failed call → the generic message stays as the honest fallback.

**One implementation deviation, reported not hidden:** the plan's §2 asked for a per-query
call-count assertion proving `poolHasAvailabilityOnDate` short-circuits. The HTTP black-box
regression harness cannot express that without a unit-test framework slot-engine does not have.
Covered instead by a correctness section (a date whose earliest window is full still counts,
because the scan continues to a later free window) plus the 1-line `return true` being visible in
the diff. Flagged for the TL — a package-local `vitest` for slot-engine is a possible follow-up
if a real call-count assertion is wanted.

**Evidence:** whole-repo typecheck (14 packages) + slot-engine + guest-member-pwa build clean;
full 5-service regression green — **slot-engine 60/60** (55 pre-existing + 5 new
`next-available-date.regression.ts` sections), identity-auth 7/7 (first full run flaked on the
documented port/timing interaction, clean in isolation and on the full re-run), tenant-management
5/5, payment 12/12, notification 7/7. Live-fire against the local dev stack (real JBC Coimbatore
branch, `badminton_db`): a dedicated exhausted test pool — endpoint returned the exact free date
3 days out (DB read-back confirmed that window genuinely had capacity), `{ date: null }` when
fully exhausted, `{ date: null }` for a `from` past the horizon, 400 on a bad date. Browser pass:
guest landed on an exhausted date → auto-advanced with the inline notice → booked from the new
date; manual re-pick of an empty date re-searched; manual pick of a slotted date cleared the
notice; whole-pool exhaustion fell back to the generic message with **no search loop** (network
log: exactly one call per distinct date).

**Left behind for cleanup:** the live-fire test pool `c9bdfcc3-cefb-42a8-bae5-092e9a8ea07f`
("ZZ F-212 live test (safe to delete)") in `badminton_db` — one window, two cancelled bookings.
No pool DELETE endpoint exists; needs a direct DB delete or can be left as clearly-named clutter.

**Close-out:** `pnpm register:check` green (197 rows, Resolved 91). `pnpm diagram:verify` green —
the new endpoint is not on any FLOW node (advisory only, like the existing F-100/F-147 entries).
PR #13 gated on `checks` + `regression`; `integration` post-merge. Merged `b23073f`; post-merge
pipeline all green (checks + regression + integration), images pushed at that SHA.

## Batch 29 — F-206 module entitlement system

**Findings:** [[F-206]] — **Resolved**. Chief-assigned "Large" in the Slice-2 handover (31 Aug
2026), sequenced ahead of [[F-207]] because [[F-220]] must land already entitlement-gated (Chief's
Q7). No register row or pending-findings entry until now — same backfill shape as [[F-205]] /
[[F-212]].
**Handed off:** 2 Sep 2026
**Status:** Done
**Branch/PR:** `f206-module-entitlement` → PR #14
**Commits:** `03f2187` (implementation) · this row (register + pending-findings + batch-log close-out)

**Greenfield.** `Tenant.plan` was a decorative string; no feature-flag/module concept existed.

**Schema** (`20260902120000_module_entitlement_f206`): `TenantModule` enum (GUEST_BOOKING,
MEMBER_MANAGEMENT, STUDENT_MANAGEMENT, TOURNAMENT) + `ModuleEntitlement` model, `@@unique([tenantId,
module])`, FK `onDelete: Cascade`. **No row = not entitled** (fail-closed) — STUDENT_MANAGEMENT and
TOURNAMENT (zero real endpoints anywhere) need no seed rows. State is a pure function of `(now,
startDate, endDate, disabledAt)`, **never stored**: `resolveEntitlementState` in
`@badminton/shared-types` (both services already depend on it — no new service-to-service edge,
avoids the coupling the deferred-debt note in root `CLAUDE.md` flags). no-row / not-started /
lapsed → denied; active → read+write; `disabledAt` set & before `endDate` → read-only.

**slot-engine:** `requireModuleEntitlement(auth, module, reply, {write})` composes into the
existing `getInternalOrAdminAuth` chain immediately after auth (internal-key caller bypasses
unconditionally — same precedent as `isAuthorizedForBranch`). Wired onto 18 endpoints —
`GUEST_BOOKING` on the resource-pool / pattern / window / override / booking-rule / blocked-window
routes, `MEMBER_MANAGEMENT` on the two `member-group-assignment` writes + the list read (Decision
3). `GET /branches/:id/resource-pools` is shared guest+admin surface (the guest PWA lists bookable
pools through it) — made **caller-aware** per Bala's 2 Sep call: guest/member tokens (`roles: []`)
pass through untouched; an admin token (`owner` / `branch_manager:*`) additionally checks
`GUEST_BOOKING` before the query, so a hidden module can't still leak pool data to an admin via a
direct API call ("never UI-only"). The per-window bookability logic in `GET /availability` was
factored into a shared `windowBookable` helper along the way (behaviour-preserving; also used by
[[F-212]]'s `poolHasAvailabilityOnDate`).

**tenant-management:** `POST /tenants/:id/entitlements` (grant/renew — `requireInternalKey` only,
same tier as `POST /tenants`; renew extends `endDate` on the one row and clears any prior
wind-down, never a new row per term — matching [[F-207]]'s confirmed renewal design),
`GET /tenants/:id/entitlements` (any admin — `owner` or `branch_manager:*`; states computed per
row), `POST /tenants/:id/entitlements/:module/disable` (Owner-only, sets `disabledAt`/`disabledBy`,
idempotent, 404s an ungranted module; bodyless — send `{}`).

**admin-v2:** `AdminTenantContext` gains a parallel **authenticated** entitlements fetch (the
tenant fetch beside it is no-auth branding data — entitlement state must not ride on it), exposed
as `entitlements: Record<module, state> | null`. `nav.ts` `NavDestination` carries an optional
`module`; `filterByEntitlement` drops non-`ACTIVE`/`READ_ONLY` module destinations; a `null`
entitlements value (fetch in flight / failed) hides nothing so a transient failure never strands
an admin without navigation. Sidebar / bottom-nav / `/apps` overflow all filter through it.
Dashboard / Communications / Ledger / Inventory map to no F-206 module and stay always-visible
(Decision 1). The guest-facing booking/availability endpoints are **not** gated (Decision 2 — a
materially larger, riskier scope the handover never asked for; its own future finding if wanted).

**Seed ships atomically** (`20260902120100_seed_jbc_module_entitlements_f206`): JBC's real
`GUEST_BOOKING` + `MEMBER_MANAGEMENT` rows, keyed on `subdomain = 'jbc'` (env-portable, not a
hard-coded UUID), `ON CONFLICT DO NOTHING`, no-op on a fresh test DB. Without it JBC's live
admin-web usage of the gated endpoints would 403 the instant the gate deploys — the inverted form
of the "capture the before-state" rule.

**One plan-accuracy correction, reported not hidden:** the plan's §"Blast radius" claimed "every
existing regression section is unaffected by construction" because they use `internalKey`. False —
`admin-operations` and `availability-generation-api` hit gated routes with `owner` /
`branch_manager` JWTs. Fixed by seeding an ACTIVE entitlement for the regression tenant in
`setupBaseFixtures` (cleanDatabase stops at resourcePool, so one upsert covers the run) and adding
`tenantId: TENANT_ID` to those fixture tokens — which real admin tokens carry anyway (F-076).

**Evidence:** whole-repo typecheck (14 packages) + full build clean. Full 5-service regression
green — **slot-engine 68/68** (60 pre-existing + 8 new `module-entitlement.regression.ts`:
no-row / not-started / active / read-only / hidden (×2 paths) / internal-key-bypass /
caller-aware-branch-endpoint / MEMBER_MANAGEMENT-independent), **tenant-management 9/9** (5 + 4 new:
grant-validation / renew-extends-same-row / GET-auth-and-states / disable-owner-only-idempotent-404),
identity-auth 7/7, payment 12/12, notification 7/7. Live-fire on the dev stack against real JBC
data in `badminton_db`: entitled admin `POST /resource-pools/:id/resources` + member-assignment
list → 200; no-row and lapsed (past `endDate`) → 403 `MODULE_NOT_ENTITLED`; Owner wind-down →
read 200 / write 403, `disabledBy` captured; `GET /branches/:id/resource-pools` — guest 200 with
no entitlement, admin 403 then 200 once granted. Browser pass on admin-v2 (dev-login as JBC
owner): both modules active → all 7 nav destinations; lapse `MEMBER_MANAGEMENT` → "Manage Members"
gone from the desktop sidebar (6 left) and the `/apps` mobile overflow (2 left), bottom-nav
unchanged; re-grant → restored. Test artifacts (livefire resource, two throwaway tenants) scrubbed.

**Close-out:** `pnpm register:check` green (198 rows, Resolved 92). `pnpm diagram:verify` green —
the new endpoints are not on any FLOW node (advisory only). PR #14 gated on `checks` + `regression`;
`integration` post-merge.

## Batch 30 — F-220 admin-v2 §1a–§2 (Branch Settings + Guest Management shell)

**Findings:** [[F-220]] — **still Open** (partial delivery; its own register row + full close-out
are deferred to the end of the sequence, after §3). [[F-221]], [[F-222]], [[F-223]] — added to the
register + `pending-findings.md` this batch (the three standalone findings this work surfaced, per
Bala's direction to log them inline rather than at F-220's eventual close-out).
**Handed off:** 3 Sep 2026 (Technical Lead thread — `Technical lead plan f220 v2 guest management
branch settings.md`)
**Status:** merged to `main`
**Branch/PR:** `f220-guest-management` (kept, not deleted — the TL verification record cites its
per-slice SHAs) → PR #15, **Squash and merged**

Six independently-verified slices, each landed + TL-reviewed + Bala-signed-off before the next:

- **§1a** (`04d948e`→`12bac59`) — `/branch-settings` (F-210) rebuilt to the mobile mockup: branch
  card, merged operating-hours/schedule-overview card (12h AM/PM display, 24h `HH:MM` stored,
  unchanged `PATCH /tenant/branches/:id`), open-days card. New reusable `TimeField` (wheel-only
  picker in a `Modal`) and `Toggle` primitives. `gridTemplateColumns: minmax(0,1fr)` on the root
  grid + cards (the real fix for a 375px horizontal blowout). Save-guard: ≥1 open day + hours set.
  Same-time `.refine` (client-only — [[F-175]]/[[F-177]]'s server guard has no equivalent).
- **§1b-i** (`912687b`) — new `GET /resource-pools/:id/booking-conflicts` on slot-engine (F-222
  read-only stopgap: counts active bookings a prospective override would strand; changes nothing).
  Auth identical to the `availability-overrides` siblings. +1 `module-entitlement.regression.ts`
  section — **slot-engine 69/69**.
- **§1b-ii** (`c7439b6`→`4b3d609`) — "Special Hours" card (4th on `/branch-settings`):
  list/add/edit/delete `AvailabilityOverride` fanned across the branch's resource pools,
  `slotDurationMinutes`/`capacity` auto-filled from the pool (Finding 1), `TimeField.minuteStep`
  making an off-slot `MODIFIED` range unpickable by construction (Finding 3), non-blocking
  booking-conflict `Banner` (F-222). Add/Edit/Delete UI-gated to `isOwner` (`4b3d609`, Bala's call)
  — tracked as [[F-223]] that the backend routes have no matching owner check.
- **§1b docs** (`590142f`) — [[F-223]] to register + pending-findings.
- **§2** (`d98d558`) — `GuestManagementScreen.tsx` at `/guests` (swapped from `StubScreen`):
  branch `Select`, `Tabs` "Reservations" | "Setup Rules" (both honest `EmptyState`s this pass — the
  4 real Setup Rules sections are §3). `courtGroups/` subtree + `Textarea.tsx` ported verbatim
  from the unmerged `f220-court-groups` branch as `guestManagement/`. `nav.ts`: dropped
  `module: 'GUEST_BOOKING'` from `court-groups` (now a plain always-visible stub); `guests` keeps
  its gate + a screen-level `moduleVisible` guard matching `CourtGroupsScreen`.

**Evidence:** per-slice — typecheck + `vite build` + `eslint` clean every slice (8 pre-existing
warnings, none in new/changed files); slot-engine regression 69/69 (§1b-i); live-fire on the dev
stack against real JBC data (`badminton_db`) every slice — Special Hours CRUD with DB read-backs
(CLOSED nulls / MODIFIED auto-fill / CLOSED↔MODIFIED edits / fan-out), the conflict route's five
count cases against a real `CONFIRMED` booking (HELD excluded, CHECKED_IN counted), the 375px
no-horizontal-scroll check every screen, and the F-206 lapsed-entitlement pass for §2 (`/guests`
gate shows, "Guest Management" drops from nav, "Manage Court Groups" stays). TL independent
re-verification of every slice against the real branch (ancestry, full diffs, fresh rebuilds).

**Close-out:** `pnpm register:check` green — **201 rows, Open 109** (F-221/F-222/F-223 added).
`pnpm diagram:verify` green (no tagged FLOW node touched). **[[F-220]]'s own register row and the
`docs/plans/pending-findings.md` UI-only follow-ups entry are deliberately NOT written yet** —
deferred to the end of §2+§3 per the TL plan; §3 (the 4 Setup Rules sections) is still to come.
This batch row is the record that §1a–§2 reached `main`.

## Batch 31 — F-220 admin-v2 §3.1–§3.2 (Setup Rules: Authorized Guest Courts + Custom Pricing Rates) + F-224 + F-225

**Findings:** [[F-220]] — **still Open** (§3.3 Cancellation & Refund Policy and §3.4 Dynamic Guest
Scheduler still to come; its own register row + full close-out stay deferred to the end of §3).
[[F-224]] — `pending-findings.md` landed (`4551fcc`), then a **Resolved** register row this batch
(`f20f37f`) — same treatment as [[F-225]] (Bala's Option A, not folded into F-220's close-out).
[[F-225]] — `pending-findings.md` (`b56c3d8`), then a **Resolved** register row (`95148bf`, in PR #16).
**Handed off:** 4 Sep 2026 (Technical Lead thread — `Technical lead plan f220 v2 guest management branch settings.md`)
**Status:** merged to `main`
**Branch/PR:** `f220-guest-management` (kept, not deleted — TL verification cites per-slice SHAs)
→ **PR #16**, Squash and merged (`6645949`, one commit above #15's `1da6c7e`). A `git merge -s ours
origin/main` (`38bbcc3`) was recorded on the branch first to clear the post-#15 squash-merge orphan
conflict — tree unchanged (`git diff HEAD~1 HEAD` empty), every cited slice SHA preserved.
**This batch-log entry + F-224's Resolved row were missed from PR #16** and landed as a small
standalone docs PR (#17) off `6645949` — docs-only, no code, per standing rule 6 (batch-log entry
is inseparable from a merge to `main`).

Slices, each independently TL-verified + Bala-signed-off before the next:

- **§3.1** (`2fae8c3`→`2c5462a`) — Authorized Guest Courts, the first real Setup Rules section:
  tile grid, tri-state master select-all, bounded scroll box (`.agc-*` in `styles.css`).
  `usePools` already returned `resources`; typed + rendered here. Landed UI-only first (no backend
  field existed), plus a circle-visibility device-test fix.
- **F-224 backend** (`729ecde`) — guest-only Standard/Peak pricing. `Branch.guestStandardRate` /
  `guestPeakRate` (`Decimal(10,2)?`) + `guestPeakWindows` (`Json?`, `{start,end}` array, reusing the
  `cancellationPolicyJson` structured-list-in-one-column precedent). New owner-only
  (`verifyTenantOwnerOrInternal`) + `GUEST_BOOKING`-gated `PATCH /branches/:id/guest-pricing` in
  **tenant-management** (where `Branch` writes live; local `requireGuestBookingEntitlement` wrapper
  around shared `resolveEntitlementState`/`entitlementAllows`). Only `resolvePrice`'s guest
  self-service call site gains the chain `window.price` → (branch-local start in any
  `guestPeakWindows` via `branchMinutesOfDay` ∧ `guestPeakRate` set ? peak : standard) →
  `pool.defaultRate`; the member auto-booking call site (`:1181`) is byte-identical (optional 4th
  param). Migration `20260904120000`. +1 slot-engine regression section, +2 tenant-management
  (`guest-pricing.regression.ts` — gate matrix + validation matrix).
- **F-224 frontend** (`4e837cb`) — `PricingRates.tsx`: repeatable peak-window rows (`TimeField`,
  `minuteStep=5`, live overlap/duplicate errors), Standard/Peak rate pair (Peak "— required" once a
  window exists), Banner feedback, owner-gated. Reusable `nonNegativeAmount` / `validateTimeWindows`
  zod helpers.
- **§3.2 polish** (`1afa465`, `7bc2de1`) — "Add peak window" no longer flashes a validation error:
  the new row defaults to a clean non-colliding slot after the latest window (minutes preserved,
  closing the `1afa465` edge case), and a duplicate/overlap error shows only on the later row.
- **F-224 docs** (`f20f37f`, PR #17) — Resolved register row.
- **F-225 backend** (`0e1ab42`) — Authorized Guest Courts real enforcement.
  `Resource.guestBookable Boolean @default(false)` via a **two-step migration** (`20260904150000`):
  `ADD COLUMN … DEFAULT true` backfills every existing row ([[F-205]]'s live JBC real-court
  assignment preserved — a bare `DEFAULT false` would regress it branch-wide), then
  `SET DEFAULT false` (new courts opt-in). `assignPooledCourt` gains `opts: { guestOnly? }` — the
  skip is applied **inside** the `findIndex` over the full list, so the `ordered.length === capacity`
  gate and `courtSlotIndex` "Court N" numbering stay correct. Guest self-service (`POST /bookings`)
  filters; negotiated + member auto-booking do not. New owner-only (`requireOwnerOrInternal`) +
  `GUEST_BOOKING`-gated `PATCH /resource-pools/:id/guest-court-eligibility` in slot-engine (where
  `Resource` writes live). +4 slot-engine regression sections; existing F-205 sections updated to
  authorize their post-migration test-created courts.
- **F-225 frontend** (`2396570`) — `AuthorizedCourts.tsx`: seeds from real `guestBookable`, one
  batched Save (no per-toggle auto-save), Banner feedback, owner-gated, `LoadingState`→`Spinner`.
- **F-225 docs** (`95148bf`, PR #16) — Resolved register row.

**Evidence:** per-slice — typecheck + `vite build` + `eslint` clean (8 pre-existing warnings, none
new); **full 5-service regression green** — slot-engine **74/74**, tenant-management **11/11**,
identity-auth 7/7, payment 12/12, notification 7/7. Both migrations applied to `badminton_db` +
`badminton_db_test`; F-225's backfill verified on real data (all 18 existing `Resource` rows →
`true`, column default `false`). Live-fire on the dev stack against real JBC (`badminton_db`) every
slice — guest-pricing PATCH + DB read-back + the peak / standard / `window.price` override /
`defaultRate` price chain; F-225 court exclusion end-to-end (guest booking skips the excluded court
with `courtSlotIndex` synced to real position, negotiated still reaches it, `resourceId:null`
graceful fallback), UI save persistence across a full page reload, dark mode, 375px
no-horizontal-scroll. TL independent re-verification of every slice against the real branch.
Post-merge CI on `main` (run `33870563828`) — `checks` + `regression` + `integration` all green;
`integration` built the shipped 7-service stack, `verify-deployment` passed all 7 at the built SHA,
and both movable + immutable image tags for `6645949` were pushed to Docker Hub. Production still on
`1da6c7e` — `promote.sh 6645949` is the next deploy step, Bala's call on timing.

**Close-out:** `pnpm register:check` green — **203 rows, Open 109, Resolved 94** (F-224 and F-225
both Resolved this batch; total row count unchanged — F-224's row was moved from Open, not added).
`pnpm diagram:verify` green (no tagged FLOW node touched). **[[F-220]]'s own register row and the
`pending-findings.md` UI-only follow-ups entry are still NOT written** — deferred to the end of §3
(§3.3 + §3.4 remain). This batch row is the record that §3.1–§3.2 + F-224 + F-225 reached `main`.

## Batch 32 — F-220 admin-v2 §3.3 (Setup Rules: Cancellation & Refund Policy)

**Findings:** [[F-220]] — **still Open** (§3.4 Dynamic Guest Scheduler still to come; its own
register row + full close-out stay deferred to the end of §3). One new finding surfaced and logged
**described-not-numbered** in `pending-findings.md` (`booking-rule-route-missing-owner-and-entitlement-gate`)
— awaiting Chief's ID; **no register row this batch**.
**Handed off:** 4 Sep 2026 (Technical Lead thread — `Technical lead plan f220 v2 guest management branch settings.md`)
**Status:** merged to `main`
**Branch/PR:** `f220-guest-management` (kept) → **PR #18**, Squash and merged (`55e7c54`, one commit
above #17's `6fc02ac`). Net diff was exactly the §3.3 change — 6 files, +302/−2. This batch-log
entry lands as a small standalone docs PR off `55e7c54` (docs-only, no code), same shape as Batch
31's PR #17 — per standing rule 6, the batch-log entry is inseparable from the merge to `main`.

Single slice, TL-verified + Bala-signed-off:

- **§3.3** (`b27dab8` on the branch → squashed to `55e7c54`) — Cancellation & Refund Policy, the
  third real Setup Rules section: a tiered guest refund schedule backed by the already-live
  `BookingRule.cancellationPolicyJson` (`{ type:'tiered', tiers:[{min_hours_before_slot,
  refund_percent}] }`, consumed at real cancellation time in slot-engine — tiers sorted descending,
  first match wins, refund = `price * refund_percent / 100`). **No backend change** — the write
  route `PUT /resource-pools/:id/booking-rule`, the consumption, and `bookingRules` on
  `GET /branches/:id/resource-pools` all already existed; the route does no server-side tier-shape
  validation (client owns correctness, same division as [[F-224]]'s `guestPeakWindows`).
  - New `sections/CancellationPolicy.tsx` — mirrors `PricingRates.tsx`. Three **fixed** rows, both
    the notice-hours threshold and the refund % editable per row (Bala's 4 Sep call — nothing
    hardcodes 24/12/0 server-side; not an add/remove tier list). Row labels computed from the live
    values ("Above {h1} hrs" / "{h2}–{h1} hrs" / "Below {h2} hrs"). Owner-gated (non-owner sees
    read-only inputs + info Banner). Seeds from the pool's real rule, else slot-engine's
    `DEFAULT_CANCELLATION_POLICY` (24/100, 6/50, 0/0) — not the mockup's `|| 0`, since the system
    already applies that default at cancellation time before any explicit save.
  - `queries.ts` — `useSaveCancellationPolicy`: `PUT` per pool. "Apply to every branch" =
    tenant-wide (`useBranches` → each branch's resource-pools → PUT all), **deduped by pool id**
    before the fan-out (`includeDraft=true` returns a draft+published row for the same branch —
    caught live as an initial 3-PUT for JBC's 2 pools, fixed before the push). Unchecked = the
    selected branch's pools only, from the already-loaded `usePools`.
  - `schemas.ts` — `refundPercent` (int 0–100), `hourThreshold` (int ≥ 0),
    `cancellationPolicySchema` (3-tuple + `superRefine`: strictly descending notice hours
    `h1 > h2 > h3 >= 0` — the cancellation-time tier match relies on descending order). Refund %s
    independent, no cross-row ordering. Same "catch before save, not after a 400" instinct as
    `validateTimeWindows`.
  - `types.ts` — `CancellationTier` / `CancellationPolicyJson`; `BookingRule.cancellationPolicyJson?`.
  - `SetupRulesPanel.tsx` — mount the card; footer "2 more sections" → "1 more" (only §3.4 left).
- **Finding logged** (in the same commit, `docs/plans/pending-findings.md`) —
  `booking-rule-route-missing-owner-and-entitlement-gate`: `PUT /resource-pools/:id/booking-rule`
  composes only `getInternalOrAdminAuth` + `requirePoolScope` (which permits `branch_manager`) —
  **no owner check, no `GUEST_BOOKING` entitlement check**, unlike its sibling `POST /booking-rules`
  and every other admin write route this Setup Rules screen calls ([[F-224]] `guest-pricing`,
  [[F-225]] `guest-court-eligibility`). Same class of gap as [[F-221]] + [[F-223]] combined on one
  route. §3.3's UI ships owner-gated regardless, so the UI never promises a non-owner an action the
  backend should also reject. Described, not numbered — awaiting Chief's ID; resolve after §3.3
  ships and verifies, same precedent as F-221/F-223.

**Evidence:** typecheck + `vite build` + `eslint` clean (8 pre-existing warnings, none new);
`pnpm register:check` + `pnpm diagram:verify` green. **Full 5-service regression green** — slot-engine
**74/74**, tenant-management **11/11**, identity-auth 7/7 (showed the documented false-alarm on the
first local full run, passed in isolation and on full re-run), payment 12/12, notification 7/7. The
cancellation-time tier consumption this writer feeds is exercised end-to-end by the existing
`multi-slot-booking.regression.ts` section (cancels a booking, asserts `refundAmount` computed from
`cancellationPolicyJson`). Live-fire on the dev stack against real JBC (`badminton_db`, both
branches, one pool each): rows seed from the real rule, computed labels, descending-order guard
disables Save with **no API call**, single-branch save = **one PUT**, global fan-out = **exactly one
PUT per branch pool** (dedupe re-verified live), both DB read-back correct, persists across a full
page reload. Non-owner path verified by code against the identical proven `isOwner`/`disabled`/
`Banner` pattern in `PricingRates.tsx` / `AuthorizedCourts.tsx` (no seeded JBC `branch_manager`;
`badminton_db` writes are environment-blocked). TL independent re-verification against the real
branch — signed off; the double-PUT dedupe was added and re-verified live before the push, then the
WIP commit was reworded and force-pushed to a clean SHA (`b27dab8`).
Post-merge CI on `main` (run `34439588329`) — `checks` + `regression` + `integration` all green;
`integration` built the shipped 7-service stack, `verify-deployment` passed all 7 at the built SHA
(`55e7c54`), and both movable + immutable image tags for `55e7c54` were pushed to Docker Hub.
Production still on `1da6c7e` — `promote.sh 55e7c54` is the next deploy step, Bala's call on timing.

**Close-out:** `pnpm register:check` green — **203 rows, Open 109, Resolved 94** (no register
change this batch — the new finding is `pending-findings.md`-only, awaiting Chief's ID).
`pnpm diagram:verify` green (no tagged FLOW node touched). **[[F-220]]'s own register row and the
`pending-findings.md` UI-only follow-ups entry are still NOT written** — deferred to the end of §3
(only §3.4 Dynamic Guest Scheduler remains). This batch row is the record that §3.3 reached `main`.

## Batch 33 — F-220 v2 whole-pass close-out (register + pending-findings)

**Findings:** [[F-227]] — new **Open** row (the §3.3 `PUT /resource-pools/:id/booking-rule` gap,
Chief-assigned `Confirmed-ID: F-227` on the `booking-rule-route-missing-owner-and-entitlement-gate`
pending-findings entry, 10 Sep 2026). [[F-220]] — new **Resolved** summary row for the whole v2
rebuild (§1a/§1b/§2 shell/§3.1–§3.3), Chief's decision (b) since none of §1a/§1b/§3.3 had a
dedicated finding of their own; a `Confirmed-ID: F-220` Promoted entry was written to
`pending-findings.md` at the same time so the `check-register.mjs` gate (F-220 ≥ F-179) passes —
F-220 was Chief-assigned in the Slice-2 handover 2 Sep 2026 but never got a pending-findings entry,
same situation [[F-206]] was already handled for.
**Decision record:** `claude/chief-validation-f220-3.1-3.4-closeout.md` (Chief) + the 10 Sep 2026
whole-pass close-out hand-off. Three Chief decisions applied here: (a) F-227 gets its ID and Open
row; (b) F-220 gets its own Resolved summary row; (c) **§3.4 Dynamic Guest Scheduler is descoped
from the MVP pass** — Bala's reasoned call, reviewed and agreed by Chief 10 Sep 2026 (`admin-web`'s
live `/resources`/`/scheduling` cover the fallback capability; [[F-224]]/[[F-225]] answer the real
product questions). The §3.4 implementation spec + approved mockup are preserved in
`claude/technical-lead-plan-f220-3.4-dynamic-guest-scheduler.md` for post-MVP pickup.
**Handed off:** 10 Sep 2026 (whole-pass close-out hand-off, docs-only).
**Status:** merged to `main`
**Branch/PR:** `docs/f220-batch33-closeout` → **PR #20** (docs-only, no code — PRs #15–#18 were
already on `main` before this batch; #19 landed Batch 32). Standalone docs PR, same reasoning as
Batches 31/32: zero risk, and un-pushed register drift is a known trap.

**No code / schema / route changes.** F-227's fix (add both `requireOwnerOrInternal` and
`requireModuleEntitlement(GUEST_BOOKING)` to `PUT /resource-pools/:id/booking-rule`) is **deferred**
— tracked by the new Open row, not done here.

**Verification of F-227's claims before the row was written (rule 8, against real `main`):**
`services/slot-engine/src/index.ts:2298` — `PUT /resource-pools/:id/booking-rule` composes
`getInternalOrAdminAuth` → `requirePoolScope` only, no owner or entitlement check (line number
still accurate). Sibling `POST /booking-rules` (`:2238`) has `requireModuleEntitlement(GUEST_BOOKING,
{write:true})`. [[F-225]]'s `PATCH /resource-pools/:id/guest-court-eligibility` (`:1432`) and
[[F-224]]'s `PATCH /branches/:id/guest-pricing` (tenant-management `:489`) are both owner +
`GUEST_BOOKING` gated. All confirmed directly.

**Close-out:** `pnpm register:check` green — **205 rows, Open 110, Resolved 95** (+F-227 Open,
+F-220 Resolved; from 203/109/94). `pnpm diagram:verify` green — all 67 finding tags agree, no
tagged FLOW node touched by a docs-only change. F-220's `Found` date is **2 Sep 2026** (Chief →
Technical Lead Slice-2 handover §1a addendum, "F-220 assigned … Bala's direct request, 2 Sep 2026"),
corrected from the hand-off draft's 3 Sep 2026 estimate per the hand-off's own instruction to
prefer the kickoff doc's date. F-220's PR list in the register row also names #19 (Batch 32
batch-log), which the hand-off draft predated.

## Batch 34 — F-229 Step 0: register relay of Chief's manual-booking assignment (docs-only)

**Findings:** [[F-229]] — new **Open** row, `admin-assisted-manual-booking-cash-payment`. Chief
assigned the ID on 10 Sep 2026 in the Business Discovery Checklist
(`claude/discovery-unified-login-manual-booking.md` §10), with the same "relay, same mechanism as
F-221–F-227" instruction the doc spells out — that relay into git never happened until now, which
is why a prior implementing thread's checkout correctly showed F-229 as unlogged. This batch is
the mechanical transcription, not a new decision: a `Confirmed-ID: F-229` Promoted entry written
to `pending-findings.md` so the `check-register.mjs` gate (F-229 ≥ F-179) passes, the F-229 Open
row added verbatim from the hand-off, and [[F-204]]'s existing Open row marked **Superseded by
[[F-229]]** (kept in place as a historical marker, not deleted — its narrower "no QR, standard
price only, two fields" scope is absorbed into F-229's fuller design).

**Also committed this batch:** the four F-229 hand-off documents into `claude/` at repo root
(`technical-lead-plan-f229-manual-booking.md`, `claude-code-handover-f229-manual-booking.md`,
`claude-code-handover-f229-implementation.md`, `discovery-unified-login-manual-booking.md`),
unchanged — the other half of the same relay gap, so the register/pending-findings citations to
`claude/discovery-unified-login-manual-booking.md` resolve to a real committed file.

**Decision record:** `claude/discovery-unified-login-manual-booking.md` §10 (Chief) +
`claude/claude-code-handover-f229-implementation.md` Step 0 (hand-off). F-228 was assigned in the
same §10 but is a separate finding and is **not** relayed here — out of this hand-off's scope.

**Handed off:** 10 Sep 2026 (F-229 implementation hand-off, Step 0).
**Status:** commit `e856223` on `f229-manual-booking` (off `main` `0fb9337`), pushed; Step 0
signed off by the reviewing thread after an independent content check.
**Branch/PR:** `f229-manual-booking` (`e856223`).

**No code / schema / route changes.** Step 1 (the `User.name` migration) is the first code step
and is not done here.

**Close-out:** `pnpm register:check` green — **206 rows, Open 111, Resolved 95** (+F-229 Open;
from 205/110/95). `pnpm diagram:verify` green — all 67 finding tags agree, no tagged FLOW node
touched by a docs-only change (F-229's own endpoints show only as non-failing advisory lines).

## Batch 35 — F-229 Step 1: `User.name` column

**Findings:** [[F-229]] Step 1 of 6 (schema). Register row stays **Open / In progress** — no
status flip, this is one step inside the finding.

**Change:** one purely-additive nullable column, `User.name String?`
(`packages/database/prisma/schema.prisma`), migration
`20260910120000_user_name_f229` — `ALTER TABLE "User" ADD COLUMN "name" TEXT;`. No backfill;
every existing row gets `NULL`. Set on create by the walk-in identity route in Step 2; nothing
reads it as required. A schema comment marks it distinct from [[F-219]]'s planned
Google-profile-sourced `displayName`/`photoUrl` (not yet built) — this is the admin-entered
guest name, the admin being the trust boundary rather than an OTP exchange.

**Blast radius:** additive optional field — no `prisma.user.create`/`select`/`include` requires
it across all 5 services + both frontends + seed scripts + test harness; no `SELECT *` on
`User`, no User-shape snapshot test. Generated client is gitignored.

**Decision record:** `claude/claude-code-handover-f229-implementation.md` Step 1. Per-step
batch-log cadence (this entry, Batch 34's own entry) confirmed by the reviewing thread over a
hold-until-close-out alternative — keeps the trail granular, same as F-220's per-section batches.

**Handed off:** 10 Sep 2026 (per-step, ahead of Step 2).
**Status:** merged path — commit `0fd8373` on `f229-manual-booking`, pushed, Step 1 signed off
by the reviewing thread after an independent code-level diff read.
**Branch/PR:** `f229-manual-booking` (`0fd8373`).

**Evidence:** migration applied via `prisma migrate deploy` to `badminton_db`,
`badminton_db_test`, `badminton_db_e2e` — column confirmed `text` / `is_nullable = YES` in
`information_schema.columns` on each; `prisma migrate status` clean. Prisma client regenerated
(`User.name: string | null` in `index.d.ts`). `pnpm -r build` / `typecheck` / `lint` all clean
(8 pre-existing lint warnings, none new). Full 5-service regression green against
`badminton_db_test` — identity-auth 7/7, tenant-management 11/11, slot-engine 74/74, payment
12/12, notification 7/7. (First run hit a service-health startup race on 3 suites —
environmental per the CLAUDE.md trap, slot-engine logged the same error yet passed; clean 5/5 on
the immediate re-run.)

**No register/pending-findings/diagram change** — schema-only step, F-229 already has its Open
row and `Confirmed-ID` from Batch 34.

## Batch 36 — F-229 Step 2: `POST /users/walk-in` (identity-auth)

**Findings:** [[F-229]] Step 2 of 6. Register row stays **Open / In progress**.

**Change (identity-auth only):**
- New `requireWalkInAdmin` helper — dual-path (internal key OR owner/`branch_manager:*` JWT),
  modeled on payment's `requirePaymentLinkAdmin` (`services/payment/src/index.ts:704`) but
  **stricter**: the JWT path also enforces `decoded.tenantId === body.tenantId`, matching
  `GET /users/lookup`'s own tenant check (which the payment helper omits). Reviewer explicitly
  called this out as a correct judgment call — closing a gap the precedent route has rather than
  copying it forward.
- New `POST /users/walk-in` `{ phone, name, tenantId }` — auth before parse (F-090/F-045/F-071),
  `normalizePhone` + `/^\+91[6-9]\d{9}$/` reused verbatim from `/users/lookup`, find-or-create on
  the real `phone_tenantId` key. An existing row is returned **unchanged** — the route never
  overwrites a stored `name`. New rows: `userType: GUEST`, `isPhoneVerified: false` (the admin is
  the trust boundary, not an OTP exchange). No session, no `PendingInvite` resolution. P2002
  catch-and-return-existing for the admin double-click, same shape as
  `createPaymentLinkForHeldBooking`. Returns `{ id, phone, name, userType, created }`.
- **F-229 §4 (reviewer-approved):** `GET /users/lookup`'s `select` gains `name` so Step 5's
  guest-lookup "found" state can show the resolved name. `email` stays excluded —
  `admin-phone-lookup.regression.ts` still asserts it never leaks.
- New `walk-in.regression.ts` (5 sections) wired into `run.ts`.

**Blast radius:** new route + new helper, nothing existing changes except the additive `name`
field on `/users/lookup`'s payload — its two consumers (that regression suite, which guards
`email` not payload shape; `apps/admin-web/src/main.tsx:672`'s `UserLookupResult` type, additive)
are both safe.

**Decision record:** `claude/claude-code-plan-f229-step2-users-walk-in.md` (committed `3532e2b`),
signed off by the reviewing thread including §4 = (A), after an independent code-level re-check of
every citation.

**Handed off:** 10 Sep 2026 (per-step, ahead of Step 3).
**Status:** commit `c51eb49` on `f229-manual-booking`, pushed.
**Branch/PR:** `f229-manual-booking` (`c51eb49`).

**Evidence:** live-fire against the running dev stack + real `badminton_db` JBC tenant — all
scenarios pass (internal-key new/existing-not-overwritten with DB read-back, owner +
`branch_manager` JWT create, wrong-tenant 403, non-admin 403, no-auth 401, bad phone / empty name
/ missing field 400 with the right codes, `/users/lookup` returns `name` and still omits `email`).
2 test User rows created then deleted, `SELECT count(*)` = 0 after — no demo-data pollution.
`pnpm -r build` / `typecheck` / `lint` clean (8 pre-existing lint warnings, none new). Full
5-service regression green against `badminton_db_test` — **identity-auth 12/12** (7 baseline + 5
new walk-in sections), tenant-management 11/11, slot-engine 74/74, payment 12/12, notification
7/7; clean on the first run.

**No register/pending-findings/diagram change** — route-only step.

## Batch 37 — F-229 Step 3: `POST /bookings/manual` (payment)

**Findings:** [[F-229]] Step 3 of 6. Register row stays **Open / In progress**.

**Refactor (behaviour-preserving):** the inline slot-engine `/bookings/negotiated` call in
`POST /payment-links/negotiated` is extracted **verbatim** into `createHeldNegotiatedBooking()`
so `/bookings/manual` reuses it. Only existing code path this step touches — guarded by
`negotiated-link.regression.ts` plus a live-fire re-run of `/payment-links/negotiated` itself.

**New route `POST /bookings/manual` (payment):**
- Auth: `requirePaymentLinkAdmin` + the same per-branch role check `/payment-links/negotiated`
  uses (`:989`); `Idempotency-Key` required. Body = the negotiated body + `paymentMethod`
  (`cash` \| `razorpay_link` \| `upi_qr`) + `upiTransactionId?` (required iff `upi_qr`).
- `razorpay_link` — thin pass-through, identical to `/payment-links/negotiated`.
- `cash` / `upi_qr` — `createHeldNegotiatedBooking` (HELD) → `PaymentIntent` written already
  `captured` (`amount = Math.round(Number(negotiatedPrice) * 100)` verbatim from
  `createPaymentLinkForHeldBooking:818`; `gatewayRef` = `cash_<sha256(idempotencyKey).slice(0,16)>`
  or `upi_<upiTransactionId>`) → slot-engine `POST /bookings/:id/confirm`, **the exact call the
  Razorpay webhook makes at `:468`**. No new `booking.update({ status })` anywhere — idempotency,
  the non-HELD reject, and the F-183 child cascade all belong to that route.
- Retry / collision safety (reviewer bug catch, plan rev 2): `expectedGatewayRef` computed
  **before** the existing-intent guard; a same-key retry (ref matches + `captured`) falls
  through to the idempotent confirm and returns the existing intent (also self-heals a
  confirm-failed-after-capture); the P2002 catch verifies `raced.referenceId === booking.id`,
  else **409 `UPI_TRANSACTION_ID_ALREADY_USED`** and **never** confirms — closes a real
  cross-booking "free court" path from a reused admin-typed UPI id.
- Other errors: pending intent on the booking → **400 `BOOKING_HAS_PENDING_INTENT`**; confirm
  fails after capture → **502 `BOOKING_CONFIRM_FAILED`** + loud log (webhook's own posture).
- **No schema change** — `PaymentIntent` untouched; Cash/UPI/Link lives entirely in the
  `gatewayRef` prefix, which Step 4's ledger derives from.

**Blast radius:** new route + the behaviour-preserving `createHeldNegotiatedBooking` extraction.
slot-engine (`/bookings/negotiated`, `/bookings/:id/confirm`) called as-is, not modified. New
`manual-booking.regression.ts` (7 sections) in `run.ts`.

**Decision record:** `claude/claude-code-plan-f229-step3-bookings-manual.md` rev 2 (committed
`5ba7411`) — reviewer caught a real bug in rev 1's guard and signed off rev 2, including the three
§4 decisions, after an independent code-level trace of all four branches (sequential + concurrent).

**Handed off:** 10 Sep 2026 (per-step, ahead of Step 4).
**Status:** commit `3c2b0cf` on `f229-manual-booking`, pushed.
**Branch/PR:** `f229-manual-booking` (`3c2b0cf`).

**Evidence:** live-fire against the running dev stack + **real `badminton_db` JBC pool**
`ba1d1433-…` (POOLED, Coimbatore branch `6c9c1e5e-…`), walk-in guest created via the Step 2
route — 24 checks pass: standalone `/bookings/:id/confirm` shows **HELD → CONFIRMED**; `cash`
and `upi_qr` reach `CONFIRMED` with a `captured` `PaymentIntent` (24000 paise for ₹240, `cash_` /
`upi_<txn>` prefix, `referenceId` match, `purpose: guest_booking`); `cash` retry → same booking +
same intent, one row, still `CONFIRMED`; `upi_qr` resubmit (same booking) → same intent;
**`upi_qr` cross-booking collision → 409, second booking NOT `CONFIRMED`, one intent pointing at
the first booking**; missing `upiTransactionId` → 400 (no booking leaked); `razorpay_link` →
working `plink_mock_…` link, `pending` intent, booking stays `HELD`; `/payment-links/negotiated`
itself post-refactor → unchanged (retry reuse, member JWT 403); auth 401 / 403 / 403 / 400. All
test rows deleted, `SELECT count(*)` = 0/0 — no demo-data pollution. `pnpm -r build` /
`typecheck` / `lint` clean (8 pre-existing lint warnings). Full 5-service regression green
against `badminton_db_test` — identity-auth 12/12, tenant-management 11/11, slot-engine 74/74,
**payment 19/19** (12 baseline + 7 new), notification 7/7; clean first run.

**No register/pending-findings/diagram change** — route + refactor only.

## Batch 38 — F-229 Step 4: `GET /resource-pools/:id/guest-ledger` (slot-engine)

**Findings:** [[F-229]] Step 4 of 6. Register row stays **Open / In progress**.

**New read-only route `GET /resource-pools/:id/guest-ledger` (slot-engine):**
- Auth: `getInternalOrAdminAuth` + `requirePoolScope` — the exact gate the other pool-scoped
  admin reads use (owner **or** `branch_manager:<pool's branch>`, 404 unknown pool, 403
  cross-branch).
- `where: { resourcePoolId, isMemberBooking: false, parentBookingId: null }` — F-183 child rows
  excluded, same as `GET /bookings/admin` and `GET /bookings/my`.
- `Booking` has no `user` relation and `PaymentIntent` has no relation to `Booking`
  (`referenceId` is a bare string), so both are joined in memory with one extra `findMany` each.
- `deriveLedgerMethod(gatewayRef)`: `cash_`→`cash`, `upi_`→`upi`, `plink_`/`pay_`→`link`, else
  `other`; raw `gatewayRef` also returned. **No `method` column** (per the plan).
- Optional `?status` (validated against `BookingStatus`, 400 on a bad value) and `?limit`
  (default 200, capped 1–500).
- **Pool-scoped** (`:id` = resourcePoolId) — matches `requirePoolScope` verbatim; JBC is
  one-pool-per-branch. Branch aggregation deferred.

**Blast radius:** new route + `deriveLedgerMethod` helper. slot-engine now `SELECT`s
`prisma.paymentIntent` and `prisma.user` for the first time — additive, read-only. One shared-file
change: `services/slot-engine/src/regression/_fixtures.ts` `cleanDatabase()` gains
`paymentIntent` + `user` deletes (the new suite is the first to create them; both other services'
`cleanDatabase()` already wipe them; `User` FK cascades cover `authSession`/`webAuthnCredential`).
No schema change, no mutation, no frontend, no other service.

**Decision record:** `claude/claude-code-plan-f229-step4-guest-ledger.md` (committed `e07b0db`),
signed off by the reviewing thread with all four §4 decisions as written.

**Handed off:** 10 Sep 2026 (per-step, ahead of Step 5).
**Status:** commit `4056f6e` on `f229-manual-booking`, pushed.
**Branch/PR:** `f229-manual-booking` (`4056f6e`).

**Evidence:** live-fire against the running dev stack + **real `badminton_db` JBC pool**
`ba1d1433-…` — 13 checks pass. `cash` / `upi_qr` / `razorpay_link` bookings created via
`POST /bookings/manual` (Step 3) for a walk-in guest all appear with the right derived method
(`cash` / `upi` / `link`), `amountPaise` (30000 for ₹300), payment status (`captured` / `captured`
/ `pending`), resolved `guest.name`/`phone`, and `court`; a directly-seeded `isMemberBooking: true`
row is **excluded**; `?status=CONFIRMED` drops the HELD link row; `?status=NONSENSE` → 400;
`?limit=1` caps; no-auth → 401, non-admin JWT → 403, wrong-branch `branch_manager` → 403, unknown
pool → 404; the route's row count never exceeds a direct `SELECT`. All seeded rows deleted,
`SELECT count(*)` = 0. `pnpm -r build` / `typecheck` / `lint` clean (8 pre-existing lint
warnings). Full 5-service regression green against `badminton_db_test` — identity-auth 12/12,
tenant-management 11/11, **slot-engine 75/75** (74 baseline + 1 new), payment 19/19, notification
7/7; clean first run.

**No register/pending-findings/diagram change** — route-only step.

## Batch 39 — F-229 Step 5: Reservations tab UI (admin-v2)

**Findings:** [[F-229]] Step 5 of 6 (first frontend surface). Register row stays **Open / In
progress**.

**Change (admin-v2 only, no backend/service/schema):**
- `GuestManagementScreen.tsx` — the Reservations `EmptyState` → `<ReservationsPanel branchId=…>`.
- New `sections/ReservationsPanel.tsx` — the walk-in booking form, built to the approved
  `Main_v2.dc.html` mockup: phone guest lookup (three states — not-searched / found /
  not-found → inline name → `POST /identity/users/walk-in`), date + Morning/Afternoon/Evening
  band + slot (`useAvailability`, band from the window's branch-local hour), a court picker
  (guest-bookable only + a "Show all courts" toggle that reveals the rest labelled "Reserved" —
  F-225 Option B), price pre-filled via `resolveGuestRate` (mirrors slot-engine's
  `resolveGuestBlanketRate`), Cash / Payment-link cards with the "Send Razorpay link" vs
  "Already paid via your QR" (UPI transaction ID) sub-choice, a dynamic submit label, and a
  persistent `Banner` with the `shortUrl` on the `razorpay_link` path.
- New `reservationHelpers.ts` (band grouping, `resolveGuestRate`, phone validation) + 3 hooks in
  `queries.ts` (`useGuestLookup` / `useCreateWalkIn` / `useCreateManualBooking`).
- `vite.config.ts` — proxy `/api/payment` → `:3004` (first admin-v2 consumer of the payment
  service; Caddy already routes it in prod, so production is unaffected).
- `lib/useAdminApi.ts` — `post()` gains an **optional** `headers` arg (additive, matches
  admin-web's own shape) for the `Idempotency-Key` header.
- `guestManagement/types.ts` — `Branch.timezone` added (already returned by
  `GET /tenants/:id/branches`, just wasn't typed — reviewer's Decision-2 correction) + walk-in
  response types.

**Decisions (signed off):** (1) court picker built per the mockup + a "Court is assigned
automatically for this pool" caption when POOLED (JBC's case) — `resourceId` is sent, honored
for a future FIXED_INSTANCE tenant, ignored for POOLED (`slot-engine:3389`, F-225's existing
design); (2) `Branch.timezone` folded in, no follow-up; (3) persistent `Banner` for the
`razorpay_link` `shortUrl`; (4) silent-single / `Select`-when-many pool selector.

**Blast radius:** one `EmptyState` swap on an existing screen; everything else additive. No
service code, no schema.

**Handed off:** 10 Sep 2026 (per-step, ahead of Step 6 — the `/ledger` rebuild).
**Status:** commit `4332039` on `f229-manual-booking`, pushed.
**Branch/PR:** `f229-manual-booking` (`4332039`).

**Evidence — browser live-fire against the dev stack + real `badminton_db`:**
- **JBC owner:** a **cash** booking end-to-end through the real admin-v2 UI → `CONFIRMED` with a
  `cash_` `captured` `PaymentIntent`, verified by DB read-back **and** the Step 4 guest-ledger
  route; **razorpay_link** → `HELD` + `plink_mock_` `pending` + the link `Banner`;
  **upi_qr** → `CONFIRMED` + `upi_<the typed txn id>` `captured`. not-found phone → name →
  walk-in `User` created. Price pre-fill correct for a standard slot (₹400) and a peak slot
  (₹600, JBC's 19:00–21:00 peak window). "Show all courts" reveals a de-authorised court with
  the **RESERVED** tag in warning colour; dynamic submit labels for all three states.
- **`courtowner1` owner:** the F-206 entitlement gate blocks the screen (no `GUEST_BOOKING`);
  with a temporary grant the multi-pool **Court pool** `Select` (88 pools — F-202 test
  pollution) renders, the tenant theme (red accent) is picked up via `--av2-*` tokens, and the
  empty-slot state is handled. Temp grant and every test row removed afterward — verified
  `count(*)` = 0.
- **375px:** the `Date`/`Time-of-day`, court, and payment grids collapse to one column
  (`repeat(auto-fit, …)`); no horizontal page overflow. **Dark and light** both render.
- Whole-repo typecheck / build / lint clean (8 pre-existing lint warnings, none new). Full
  5-service regression green against `badminton_db_test` — identity-auth 12/12,
  tenant-management 11/11, slot-engine 75/75, payment 19/19, notification 7/7 (first run hit the
  known service-health startup flake on 3 suites, clean on re-run).

**No register/pending-findings/diagram change** — UI-only step.

## Batch 40 — F-229 Step 6: `/ledger` rebuild (admin-v2) — final implementation step

**Findings:** [[F-229]] Step 6 of 6 (last step). Register row **still Open / In progress** — the
flip to Resolved + a F-229 Resolved summary row is a separate whole-finding close-out pass, same
pattern as [[F-220]]'s Batch 33, to run after the reviewing thread's final sign-off and the merge
to `main`.

**Change (admin-v2 only, no backend/service/schema):**
- `App.tsx` — `/ledger` route: the "Subscription Ledger" `StubScreen` → `<LedgerScreen />`.
  `StubScreen` still serves 4 other routes.
- New `screens/LedgerScreen.tsx`, built to the approved `Ledger_v2.dc.html`:
  - the shared `Tabs` component (per the hand-off): **Guest** / **Members** / **Students**.
  - **Guest** tab — real, backed by `GET /slot-engine/resource-pools/:id/guest-ledger` (Step 4),
    rendered with the shared `Table`. Columns: Date, Guest, Court, Amount (right), Method,
    Status. The Method badge **reuses the server-derived `payment.method`** (`cash` / `upi` /
    `link` — not re-derived client-side): Cash green, Link blue, **UPI neutral** (the third,
    distinct style — Bala's "your call, not a blocker"), intent-less rows → "Unpaid". Status
    badge maps booking status (`CONFIRMED`→Confirmed, `HELD`→Pending, `CANCELLED`→Cancelled, …).
    Date `"27 Sep, 6:00 PM"` day-first in the branch timezone.
  - **Members** / **Students** — honest greyed lock-icon placeholders with `Ledger_v2`'s exact
    copy ("Member Ledger — launching with the Membership module" / "Student Ledger — coming with
    the Students module" + their one-line descriptions). Never fake data — Bala's demo-value
    call, 10 Sep 2026.
  - Branch selector + a Court-pool `Select` when the branch has >1 pool (same silent-single /
    Select-when-many pattern as Step 5).
- `nav.ts` — the destination label `"Subscription Ledger"` → `"Ledger"` (`shortLabel` was
  already "Ledger"). The old label was mis-scoped copy (Bala's note); it now matches the mockup
  and the real screen. No F-206 module gate on `/ledger` (unchanged — nav.ts's own comment).
- `queries.ts` `+useGuestLedger(poolId)`, `types.ts` `+GuestLedgerRow` / `LedgerMethod`.

**Blast radius:** one route swap + one nav label + an additive hook/type. No service code, no
schema.

**Handed off:** 10 Sep 2026 (per-step). **All six F-229 steps are now implemented on the
branch** — Step 0 (relay) + Steps 1–6 (`User.name` · `/users/walk-in` · `/bookings/manual` ·
`/resource-pools/:id/guest-ledger` · Reservations tab · `/ledger`).
**Status:** commit `376e597` on `f229-manual-booking`, pushed.
**Branch/PR:** `f229-manual-booking` (`376e597`).

**Evidence — browser live-fire against the dev stack + real `badminton_db`:** 3 fresh guest
bookings seeded through `POST /bookings/manual` (cash / upi_qr / razorpay_link) all appear in the
**Guest** tab with the right method badge (Cash green / UPI neutral / Link blue) and status badge
(Confirmed / Confirmed / Pending); pre-existing real JBC bookings render correctly as Cancelled /
Unpaid. **Members** and **Students** tabs show the greyed lock-icon placeholders with the exact
`Ledger_v2` copy. A first-pass bug — a disabled ledger query briefly rendering the empty state
before the pool resolved — was caught and fixed (loading gate now checks `poolId` presence); a
branch with no pool shows an info `Banner`. 375px: the table scrolls inside its own
`overflow-x: auto` container, the page body does not scroll horizontally; dark + light both
render. All seeded rows removed afterward (verified `count(*)` = 0). Whole-repo typecheck /
build / lint clean (8 pre-existing lint warnings). Full 5-service regression green against
`badminton_db_test`, **unchanged counts** — identity-auth 12/12, tenant-management 11/11,
slot-engine 75/75, payment 19/19, notification 7/7; clean first run.

**No register/pending-findings/diagram change** — UI-only step; whole-finding close-out pending.

## Batch 41 — F-229 whole-pass close-out (register) + PR #21 to `main`

**Findings:** [[F-229]] — its Open row (added Batch 34) converted to a **Resolved** summary row,
`Resolved: 10 Sep 2026`, written fresh per the register's convention (Resolution replaces
Impact/Action). Its `pending-findings.md` `admin-assisted-manual-booking-cash-payment` entry was
already under "Promoted (audit trail)" with `Confirmed-ID: F-229` from Batch 34 — no change
needed there (unlike [[F-220]]'s Batch 33, which had to write its Promoted entry at close-out).
[[F-204]]'s "**Superseded by [[F-229]]**" clause (added Batch 34) is in F-204's own row and
survives untouched.

**Docs-only — no code.** All F-229 code landed in Batches 35–40 (Steps 1–6); Batch 34 was the
Step 0 relay.

**Decision record:** the 10 Sep 2026 F-229 implementation hand-off + the reviewing thread's
per-step sign-offs (Steps 0–6) + Bala's instruction to run the close-out and open the PR now,
not auto-merge, and leave the stack up for their own testing.

**Handed off:** 10 Sep 2026.
**Status:** commit `0c3b832` on `f229-manual-booking`, pushed. **PR #21 →
`main` is open for review — deliberately not merged.** The Resolved row is written on the
assumption PR #21 merges; if it does not, this row and F-204's supersede clause both need
reverting.
**Branch/PR:** `f229-manual-booking` → **PR #21** (the whole finding — Batches 34–41 — as one
PR, not the per-batch docs PRs [[F-220]] used, at Bala's direction).

**Close-out:** `pnpm register:check` green — **206 rows, Open 110, Resolved 96** (F-229 moved
Open → Resolved; total unchanged). `pnpm diagram:verify` green — all 67 finding tags agree, no
tagged FLOW node touched. Whole-repo typecheck / build / lint clean (8 pre-existing lint
warnings). Full 5-service regression green against `badminton_db_test` — identity-auth 12/12,
tenant-management 11/11, slot-engine 75/75, payment 19/19, notification 7/7.

**Still owned by Chief, not done here:** whether F-228 (unified Gmail-first login, assigned in
the same discovery doc §10) still needs relaying into git, and the F-207/F-209 urgency note the
discovery doc §6 raised (this MVP's manual-toggle membership model may reduce their priority).

## Batch 42 — F-229 fix: `crypto.randomUUID` on a plain-IP dev URL (Bala's mobile test)

**Findings:** [[F-229]] — a fix to Step 5 code found during Bala's own mobile testing of PR #21,
not a new finding. F-229 stays **Resolved** (the fix is part of the same PR, before merge).

**Bug:** `POST /bookings/manual` from admin-v2 on a phone (`http://192.168.x.x:5175`) threw
`crypto.randomUUID is not a function`. `crypto.randomUUID()` is defined only in a **secure
context** (HTTPS or localhost) — over a plain-IP LAN URL it is `undefined`. It was used inline in
`useCreateManualBooking` for the `Idempotency-Key` header (the one `crypto.randomUUID` call in
admin-v2; `guest-member-pwa`'s `CourtBooking.tsx` has the same pattern but is out of F-229 scope
and normally served over HTTPS).

**Fix (`e5b311b`):** new `newIdempotencyKey()` helper in `reservationHelpers.ts` —
`crypto.randomUUID()` when available, else a v4 UUID from `crypto.getRandomValues` (which is
**not** secure-context-gated), else a `timestamp+random` string. Verified in-browser with
`crypto.randomUUID` forced `undefined`: a `razorpay_link` booking now succeeds (`HELD` +
`plink_mock_` intent, a valid v4 `idempotencyKey` from the fallback), no error. typecheck /
build / lint clean.

**Status:** commit `e5b311b` + this row, on `f229-manual-booking` → PR #21 (still open, not
merged).

## Batch 43 — F-229 hardening: no raw code errors on screen

**Findings:** [[F-229]] — a sweep prompted by Batch 42 (Bala: "we should not [have] such code
errors [on screen]"), for the same class as the `crypto.randomUUID` bug. F-229 stays
**Resolved** (same PR, before merge). Commit `9c07de8`.

**Three fixes:**
1. **Timezone / date safety — a render-crash risk, not just a bad message.** `branch.timezone`
   comes from the DB; a legacy/misconfigured branch could carry `""`, `"IST"`, or garbage, and
   `new Intl.DateTimeFormat(_, { timeZone })` throws `RangeError` on a non-IANA string. Every
   F-229 formatter (`branchHour`, `formatSlotLabel`, `branchLocalMinutes`, the Ledger's
   `formatDateTime`) runs **during render** — an unguarded throw white-screens the screen, and
   admin-v2 has **no error boundary** (flagged below). New `safeTimeZone()` validates the zone
   once and falls back to UTC; `safeDate()` guards `Invalid Date`; `hhmmToMinutes()` regex-parses
   and returns `NaN` instead of `.split`-throwing on a malformed peak window.
2. **`friendlyError(err, fallback)`** added to `lib/errorMessage.ts` — `ZodError` / `APIError`
   shown verbatim, a fetch/network `TypeError` gets a plain line, **anything else (a bug) is
   `console.error`'d and shown as `fallback`, never leaked raw.** `errorMessage()` passed a bare
   `Error.message` straight through — exactly how "crypto.randomUUID is not a function" reached a
   `Banner`. `ReservationsPanel` + `LedgerScreen` switched to `friendlyError`.
3. **Null-safety:** Ledger row `r.guest?.name`; `METHOD_TONE`/`METHOD_LABEL` fall back for an
   unknown method string.

**Verified:** `safeTimeZone` unit-tested against `""` / `"IST"` / `"Not/AZone"` / `"GMT+5:30"` /
`"garbage"` / trailing-space — all resolve without throwing; `Invalid Date` → epoch. Browser
sweep of `/guests` and `/ledger` (all three Ledger tabs, a full cash booking) — no admin-v2 code
errors in the console. typecheck / build / lint clean (8 pre-existing warnings).

**Flagged, not fixed here (broader than F-229):**
- **admin-v2 has no React error boundary** — any render-time throw in any screen white-screens
  the whole app. Worth a small `<ErrorBoundary>` around `<Outlet />` in `AppShell` (a non-DOM-
  destroying one — see CLAUDE.md's F-215 note about error boundaries that swap the tree).
- The **"Service worker registration failed"** console errors on the vite dev server — `sw.js`
  is stamped at build time and absent in dev ([[F-197]]); console-only, never reaches the UI,
  pre-existing.
- `guest-member-pwa`'s `CourtBooking.tsx` has the same inline `crypto.randomUUID()` — out of
  F-229 scope, and it is served over HTTPS in real use, but a `newIdempotencyKey`-style fix
  there is a cheap future follow-up.

**Status:** commit `9c07de8` + this row on `f229-manual-booking` → PR #21 (open, not merged).

## Batch 44 — F-230: /bookings/manual walk-in guest respects per-court guest authorization

**Finding:** [[F-230]] — reviewer-confirmed 11 Sep 2026 directly in the Technical Lead thread
(handoff), against `f229-manual-booking` post-merge-review. `POST /bookings/manual` ([[F-229]])
reuses `createHeldNegotiatedBooking` → slot-engine's `POST /bookings/negotiated`, which [[F-225]]
built to call `assignPooledCourt(pool, active)` with **no** `{ guestOnly: true }` — correct for its
original caller `/payment-links/negotiated` (an admin negotiating on behalf of a **member**, who
may legitimately use a court reserved away from walk-in guests). `/bookings/manual` is a real
walk-in-**guest** path, not a member-negotiated one, so it silently inherited the same unfiltered
call — a walk-in guest could be assigned a court the branch had explicitly reserved away from
guests via F-225's own toggle.

**Blast-radius check (rule 3a):** `grep -r "bookings/negotiated"` across the repo — only two
non-doc call sites: the route itself (`slot-engine/src/index.ts:3226`) and
`createHeldNegotiatedBooking` (`payment/src/index.ts:854`), itself called from exactly 3 places —
`/payment-links/negotiated` (member-negotiated, must stay unaffected) and `/bookings/manual`'s two
branches (`razorpay_link`, cash/upi_qr — both share one `bookingFields` object). No other route,
service, or regression helper calls `/bookings/negotiated` directly.

**Fix:** `createHeldNegotiatedBooking`'s `fields` gains an opt-in `guestOnly?: boolean`, forwarded
as `guestOnly: fields.guestOnly === true` in the request body to `POST /bookings/negotiated`.
Slot-engine's route destructures `guestOnly` and passes `{ guestOnly: guestOnly === true }` into
`assignPooledCourt` — an absent/falsy value is byte-identical to today's behavior.
`/bookings/manual`'s shared `bookingFields` now sets `guestOnly: true` (covers both its branches
from one line); `/payment-links/negotiated`'s own object is untouched.

**Regression:** new section in `manual-booking.regression.ts`, mirroring slot-engine's own F-225
"no authorized court free → resourceId:null" test (`court-slot-index.regression.ts:567`) through
`/bookings/manual` instead of self-service `POST /bookings`. Captured **failing for real, pre-fix**
— a POOLED pool (capacity 2, only court 1 guest-authorized), court 1 taken, a second walk-in guest
via `/bookings/manual` landed on court 2 (`resourceId: "aba63198-..."`, the reserved one) instead
of the expected `null` fallback. Applied the fix, rebuilt, reran: `resourceId: null`, matching
F-225's guest self-service behavior in the identical scenario.

**Evidence:** slot-engine **75/75** post-fix (F-225's own three sections unaffected — confirms
`/payment-links/negotiated` and guest self-service both stayed byte-identical); payment **20/20**
post-fix (19 pre-existing + this one). typecheck clean on both `slot-engine` and `payment`
(`tsc --noEmit`). `pnpm register:check` + `pnpm diagram:verify` green.

**Status:** commit `42f26e7` + this row, on `f229-manual-booking` → PR #21 (still open, not
merged).

## Batch 45 — F-228 Step 0: register relay of Chief's unified-login assignment (docs-only)

**Findings:** [[F-228]] — new **Open** row, `unified-gmail-login-guest-member-identity`. Chief
assigned the ID on 10 Sep 2026 in the same Business Discovery Checklist §10 that assigned
[[F-229]] (`claude/discovery-unified-login-manual-booking.md`), but the relay was deliberately
held back at F-229's own Batch 34 ("F-228 was assigned in the same §10 but is a separate finding
and is not relayed here") and again named explicitly at Batch 41's close-out ("still owned by
Chief, not done here"). This batch is that relay: a `Confirmed-ID: F-228` Promoted entry written
to `pending-findings.md` (`unified-gmail-login-guest-member-identity`) so the `check-register.mjs`
gate passes, and the F-228 Open row added.

**Decision record:** `claude/discovery-unified-login-manual-booking.md` §10 (Chief) + the standing
Technical Lead review cadence established across F-229's steps, applied here identically: no
TL-authored implementation spec exists for Steps 2–6 (unlike Step 1, which was handed down in
full detail) — each of those steps' own design was investigated and proposed by the implementing
thread first, then reviewed, corrected where wrong, and signed off by the Technical Lead thread
before any code was written, same as every prior finding in this sequence.

**Handed off:** 10 Sep 2026 (Chief assignment) / 11 Sep 2026 (this relay).
**Status:** register relay only, part of this batch's own commit alongside Batches 46–52.
**Branch/PR:** `f228-closeout-register` (this batch's commit).

**No code / schema / route changes.** Step 1 is the first code step and is not done here.

## Batch 46 — F-228 Step 1: real Google verification + find-or-create in `/auth/google/verify`

**Findings:** [[F-228]] Step 1 of 6. Register row stays **Open / In progress**.

**Change (identity-auth):** `POST /auth/google/verify` replaced its `mock-google-token-` branch
and the `PHONE_VERIFICATION_REQUIRED`/`GOOGLE_LOGIN_ONLY_FOR_MEMBERS` gates outright with real
JWKS verification, reusing `adminGoogleAuth.ts`'s existing `verifyGoogleIdToken`/`googleRemoteJwks`
— no mock fallback survives in any environment. New `memberGoogleAuth.ts`: `findOrCreateMemberUser`
find-or-create, a brand-new identity gets a `GUEST` row with `phone:null` instead of being
rejected; P2002 race guarded (catch-and-re-findFirst, same shape as `/users/walk-in`'s). Response
gains `isNewSignup`.

**Blast radius:** `verifyGoogleMock`'s only two callers grepped — `guest-member-pwa/LoginScreen.tsx`
(Step 1 doesn't touch it, Step 3 does) and `admin-web/main.tsx` (untouched this whole sequence —
its Google login now 401s, a known, low-risk, Chief-accepted consequence per the sign-off, not a
regression to prevent).

**Environment gap found and fixed along the way:** `GOOGLE_OAUTH_CLIENT_ID` was missing entirely
from the local docker dev stack's env — every Google verification, including the pre-existing
admin route, silently failed closed with "not configured." Added to `docker-compose.dev.yml`.

**Evidence:** whole-repo typecheck clean. identity-auth vitest 42/42. Full 5-service regression
against `badminton_db_test`, 5/5 suites, run twice. Live-fire through the dev-deployed container
with a real Google-signed ID token (captured via a hooked `fetch` in the browser pane, real
account `balaforyou@gmail.com`): existing STAFF user matched by email → 200, row unchanged;
brand-new identity in a different tenant → 200, `isNewSignup:true`, real `GUEST` row created
(`phone:null`, `isPhoneVerified:false`) — direct proof the removed gate no longer blocks a fresh
signup; old `mock-google-token-` literal → 401 against real verification. Synthetic test row
deleted afterward.

**Handed off:** 11 Sep 2026.
**Status:** commit `0f8612b` on `f228-step1-google-verify` (off `main` `c3367fa`), pushed, signed
off after independent diff pull + re-run.
**Branch/PR:** `f228-step1-google-verify` → **PR #22** (open, not merged).

## Batch 47 — F-228 Step 2: `POST /auth/otp/attach-phone`

**Findings:** [[F-228]] Step 2 of 6. Register row stays **Open / In progress**.

**Change (identity-auth):** new `POST /auth/otp/attach-phone` — the caller's own authenticated
session attaches and verifies a phone via a real OTP check, independent of how the account was
created. `verifyOtpCode(prisma, phone, tenantId, code)` extracted from `/auth/otp/verify`'s inline
block as the second real call site.

**Mid-review correction, recorded accurately rather than smoothed over:** the idempotency logic
was first implemented as a flat "already verified → 409 reject" gate. Independent review against
the original Decision 4 spec caught that this was wrong — Decision 4 is phone-aware, not flat: a
caller re-submitting the *same* already-attached phone is a legitimate idempotent retry (200,
still requires a fresh valid OTP, no write), a *different* phone while already verified is the
real out-of-scope "change my number" case (409 `PHONE_ALREADY_ATTACHED`), and a target phone
already claimed by a different account is a separate concern under its own code
(409 `PHONE_ALREADY_LINKED`, both the pre-check and the P2002 race backstop). Corrected before
merge, not discovered after.

**Evidence:** whole-repo typecheck clean. identity-auth vitest 42/42 (unaffected). Full regression
5/5, run twice — new section covers no-auth 401, wrong-code 400, first-attach 200 + DB read-back,
idempotent retry 200, change-number 409, phone-collision 409 with DB read-back confirming no
write, cross-tenant OTP isolation. Live-fire: real Google sign-in → phoneless `GUEST` → wrong OTP
rejected → correct OTP (dev-fixed `123456`) attaches, DB read-back confirms `phone`/
`isPhoneVerified` → idempotent retry → change-number reject → phone-collision reject against a
second real seeded account, DB read-back confirms no write. Synthetic rows deleted afterward.

**Handed off:** 11 Sep 2026.
**Status:** commit `1f8d42a` on `f228-step2-attach-phone` (off Step 1), pushed, signed off after
independent diff pull + re-run.
**Branch/PR:** `f228-step2-attach-phone` → **PR #23** (open, not merged).

## Batch 48 — F-228 Step 3: guest-member-pwa real GIS login + guest/member landing split

**Findings:** [[F-228]] Step 3 of 6. Register row stays **Open / In progress**.

**Change:** `packages/ui-shared/src/lib/googleIdentity.ts` (moved from `apps/admin-v2/src/lib`,
now shared — admin-v2's own login migrated to the shared import, behavior-identical). `AuthContext.tsx`
gains `verifyGoogle`/`attachPhone` **additively** — `verifyGoogleMock` untouched, so admin-web's
already-401ing mock path (accepted since Step 1) sees zero further change. `guest-member-pwa`'s
`LoginScreen.tsx`: the dev-mock email-input flow removed, replaced with a real GIS button (same
detached-mount-node pattern as admin-v2's own, so GIS's DOM churn never collides with React's).
New `CompleteSignupScreen.tsx` (phone + OTP entry, driving `requestOtp` + `attachPhone`).
`main.tsx`'s `ProtectedRoute` now redirects any authenticated-but-phoneless account to
`/complete-signup` on every protected route — durable across reloads, not just the immediate
post-login moment, since `/auth/refresh` reissues the same `phone:null` claim until that account
finishes signup.

**Environment gaps found and fixed along the way:** `docker-compose.dev.yml`'s `guest-member-pwa`
service had no `VITE_GOOGLE_CLIENT_ID` (same gap shape as Step 1's backend fix) — added. Google's
OAuth client had only `localhost:5175` (admin-v2) as an authorized JavaScript origin, not
`localhost:8080` (guest-member-pwa via Caddy) — a real one-time Google Cloud Console config step,
outside the repo, done by Bala.

**A live-fire attribution error was caught and corrected during Step 6's sign-off review, not
left standing:** a service-worker registration failure was first reported as
"guest-member-pwa-specific, already seen since Step 1" — that specific claim was wrong, sourced
from a stale memory rather than a check of that session. Independently re-verified per-origin on
request during Step 6's review; the correction surfaced that **both** admin-v2 and guest-member-pwa
fail independently, at their own dev ports, not one app's regression — parked as its own finding
candidate (below), not folded into F-228.

**Evidence:** whole-repo typecheck clean. Full regression 5/5 (unaffected, as expected for a
UI-only step). Live-fire against a freshly rebuilt stack with the service worker/caches cleared
first: fresh Google sign-in → `/complete-signup`; completing it (real phone + dev OTP) →
`/`, DB read-back confirms `phone`/`isPhoneVerified`; signing out and back in with the
now-complete account → straight to `/`, never touching `/complete-signup`; admin-v2's own real
GIS login still works unchanged after the shared-helper migration (confirmed after fixing an
unrelated stale local Vite dependency-cache issue on that app's dev server).

**Handed off:** 11 Sep 2026.
**Status:** commit `835947e` on `f228-step3-guest-gis` (off Step 2), pushed, signed off after
independent diff pull, raw regression/DOM-state evidence review, and the service-worker
attribution correction above.
**Branch/PR:** `f228-step3-guest-gis` (`835947e`) — pushed, PR not yet opened.

## Batch 49 — F-228 Step 4: booking-flow phone-gate — verified closed by Step 3, no code change

**Findings:** [[F-228]] Step 4 of 6. Register row stays **Open / In progress**.

**Investigated, not built:** the original plan named this step "booking-flow phone-gate for
phone-unverified guests," with an explicit instruction to check the real shape before assuming a
green-field build was still needed. It wasn't: every route in guest-member-pwa except `/login`
and `/complete-signup` already sits behind Step 3's `ProtectedRoute`, including
`CourtBooking.tsx`/`BookingPay.tsx`; `CourtBooking.tsx:380` is the app's only real
booking-creation call site; and the JWT's `phone` claim (what `ProtectedRoute` gates on) is
always live-OTP-proven at issuance in every reachable path (`/auth/otp/verify` runs a real OTP
check unconditionally before either of its branches; `/auth/refresh`/`/auth/google/verify` both
read `phone` fresh from the live DB row). Reported as "closed by Step 3, no functional gap"
rather than building redundant gate logic — a legitimate outcome, not a failure to find work.

**Only change:** a stale comment in `BookingPay.tsx` (F-190 Slice 3) that cited the removed
Step-1 signup-time Google gate as the reason `user.phone` is trustworthy there — corrected to
cite the real, current mechanism (Step 3's route-level redirect). Comment-only, zero behavior
change.

**Surfaced, not fixed, a genuinely separate bug:** `/auth/otp/verify`'s existing-user branch never
updates `isPhoneVerified` on the DB row, even after a real OTP check — parked as its own finding
candidate (below), not folded into F-228 (rule 9).

**Evidence:** whole-repo typecheck clean (comment-only change). No regression re-run needed — no
runtime behavior touched.

**Handed off:** 11 Sep 2026.
**Status:** commit `cea6251` on `f228-step4-booking-gate-verification` (off Step 3), pushed,
signed off after independent verification of every claim against real code.
**Branch/PR:** `f228-step4-booking-gate-verification` (`cea6251`) — pushed, PR not yet opened.

## Batch 50 — F-228 Step 5: `PATCH /users/:id/type` dual-path admin JWT

**Findings:** [[F-228]] Step 5 of 6. Register row stays **Open / In progress**.

**Change (identity-auth):** `PATCH /users/:id/type` (previously internal-key-only, zero
production callers anywhere in the repo — confirmed by grep, only the regression fixture calls
it) gains a second auth path: an owner/branch_manager admin JWT, alongside the unchanged
internal-key path. New `requireUserTypeAdmin` helper — deliberately **not** a reuse of
`requireWalkInAdmin`'s shape: that helper's tenant check compares against a client-supplied body
`tenantId`, correct for a CREATE (F-229's walk-in route) but wrong for a PATCH on an arbitrary
existing `:id` (a caller could claim any tenant while targeting a user in a different one). The
new helper instead looks up the **target row's real tenantId** server-side, after the caller has
already proven internal-key-or-admin-role (auth-before-body-trust, matching this file's own
F-090/F-045/F-071 discipline), and compares against that — no client-supplied tenant value
involved at all. Role gate matches `requireWalkInAdmin`'s (owner + branch_manager), consistent
with every other admin-JWT route in this file. Backend-only, ahead of Step 6's UI.

**Evidence:** whole-repo typecheck clean. Full regression, run three times (one transient
"slot-engine did not become healthy" startup-timing failure on the first attempt — confirmed
ports clear, re-ran per this project's own environmental-failure discipline, clean 5/5 twice
after). New section: no-auth 401, non-admin-role 403, correct-tenant 200 + DB read-back,
cross-tenant 403 with no write, nonexistent-id 404, internal-key path re-asserted unchanged.

**Handed off:** 11 Sep 2026.
**Status:** commit `3b19a52` on `f228-step5-usertype-admin-jwt` (off Step 4), pushed, signed off
after independent diff pull + re-run.
**Branch/PR:** `f228-step5-usertype-admin-jwt` (`3b19a52`) — pushed, PR not yet opened.

## Batch 51 — F-228 Step 6: admin-v2 member-provisioning UI — final implementation step

**Findings:** [[F-228]] Step 6 of 6, final implementation step. Register row stays
**Open / In progress** — converted to Resolved in Batch 52.

**Change:** `GET /users/lookup` gains optional `?email=` — exactly one of phone/email required
(400 on neither or both, never silently picking one); email path validates format, lowercases
(matching how Google stores emails on write), queries the confirmed-real `email_tenantId`
compound-unique key; `select` stays identical regardless of which identifier resolved the match
— `email` itself still never returned (same convention the phone path already enforced), `phone`
can now genuinely be `null` (a Step-1 Google-first guest). `GuestLookupResult.phone` widened to
`string \| null`. `useGuestLookup` (admin-v2) generalized to `{phone}\|{email}` rather than a
near-duplicate sibling hook — one real external caller, `ReservationsPanel.tsx`, updated at its
one call site. New `usePromoteToMember()` against Step 5's route. New
`MemberProvisioningPanel.tsx` — reuses `ReservationsPanel`'s idle/found/not-found lookup shape,
adapted: looks up by email (target accounts are often phoneless Google-first guests) and its
terminal action is promotion, not booking, so there is no create-on-not-found sub-flow. Wired
into `GuestManagementScreen` as a third "Members" tab, tenant-level (no `branchId`), unlike the
other two tabs.

**A real leaked-row bug was caught during this step's own sign-off review and fixed as its own
follow-up commit, not folded silently into the step that introduced the exposure:** Step 5's
`PATCH /users/:id/type` always returned the full `prisma.user.update` row with no `select` —
harmless while its only callers were internal-key service-to-service and the regression fixture,
but this step's `usePromoteToMember()` made it reachable from a browser for the first time, so
`email`/`googleId`/`isPhoneVerified`/`isEmailVerified`/timestamps genuinely reached a response
body. Fixed with the same minimal-fields `select` `GET /users/lookup` already used. Re-verified
with a targeted rebuild + regression rerun of both the Step 5 and Step 6 sections, confirming an
identical status-code sequence before and after — nothing broke, only the leaked fields left the
response.

**Live-fire caught a real copy bug, not just a data bug:** the found-state summary line read
"already a Member" for a `STAFF` account too. Fixed to show the account's actual `userType`
before this batch's commit.

**Evidence:** whole-repo typecheck clean. Full regression 5/5, run twice (main change), plus a
targeted rebuild + rerun of identity-auth's own suite alone (15/15 sections) after the leaked-row
fix. Live-fire, real browser, dev sign-in as JBC owner: searched the real JBC STAFF account by
email → correctly "currently Staff," promote button correctly hidden; seeded a fresh `GUEST` by
email, searched, promoted → DB read-back confirms `userType:MEMBER`; searched a nonexistent email
→ correct not-found state. Synthetic rows deleted afterward.

**Handed off:** 11 Sep 2026.
**Status:** commits `c72dd7e` (main step) + `8d94a1f` (leaked-row fix, its own follow-up commit)
on `f228-step6-member-provisioning` (off Step 5), pushed, both independently re-verified — the
main diff pulled and checked file-by-file against origin, the fix's diff and raw regression output
pasted and confirmed byte-identical to what was requested.
**Branch/PR:** `f228-step6-member-provisioning` (`c72dd7e`, `8d94a1f`) — pushed, PR not yet opened.

## Batch 52 — F-228 whole-pass close-out (register + pending-findings)

**Findings:** [[F-228]] — its Open row (added Batch 45) converted to a **Resolved** summary row,
`Resolved: 11 Sep 2026`, written fresh per the register's convention (Resolution replaces
Impact/Action), covering all six steps as actually shipped — including the Step 2 idempotency
correction against the original Decision 4 spec, the Step 3/6 service-worker misattribution
catch-and-correct, and Step 6's own leaked-row catch, recorded accurately rather than smoothed
over. Its `pending-findings.md` `unified-gmail-login-guest-member-identity` entry already had
`Confirmed-ID: F-228` from Batch 45 — no change needed there.

Two new finding candidates opened in `pending-findings.md`'s "Awaiting confirmation" section,
**described, not numbered** — neither ID assigned by this thread:
- `otp-verify-existing-user-isphoneverified-not-refreshed` (surfaced Step 4) — `/auth/otp/verify`'s
  existing-user branch never refreshes `isPhoneVerified` on the DB row after a real OTP check.
  Pre-existing, does not affect F-228's own booking gate (which reads the JWT's `phone` claim, not
  the DB column).
- `shared-service-worker-registration-failure-both-apps` (surfaced Step 3, attribution corrected
  Step 6) — both admin-v2 and guest-member-pwa fail their own service-worker registration
  independently, same error shape, neither app's code touched by any of the six steps, root cause
  unconfirmed.

**Docs-only — no code.** All F-228 code landed in Batches 46–51 (Steps 1–6); Batch 45 was the
Step 0 relay.

**Decision record:** the 10 Sep 2026 Chief assignment (`claude/discovery-unified-login-manual-booking.md`
§10) + the Technical Lead thread's per-step sign-offs (Steps 0–6, this close-out) + the explicit
instruction to record the mid-sequence corrections accurately rather than omit them.

**Handed off:** 11 Sep 2026.
**Status:** this batch's commit on `f228-closeout-register`, pushed. **Not merged to `main` —
deliberately, pending independent re-verification of this exact register/pending-findings diff.**
The Resolved row is written on the assumption the full six-step stack (Steps 1–6 plus this
close-out) merges as a whole; if any step does not merge, this row and the corresponding
branches/commits list both need reverting or correcting.
**Branch/PR:** `f228-closeout-register` (off `f228-step6-member-provisioning`) — the whole
finding, Batches 45–52, as one stack, mirroring how F-229's Batches 34–41 became one PR.

**Close-out:** `pnpm register:check` green — **208 rows, Open 110, Resolved 98** (F-228 added
directly as Resolved — this close-out combines the relay and the resolution into one pass rather
than staging a separate historical Open-row commit, since all six steps' code already exists and
is already signed off by the time this batch is written; from 207/110/97). `pnpm diagram:verify`
green — all 67 finding tags agree, no tagged FLOW node touched by a docs-only change.

**Still open, not done here:** whether `otp-verify-existing-user-isphoneverified-not-refreshed`
and `shared-service-worker-registration-failure-both-apps` get a Chief-assigned ID and become
their own findings — both owned by Chief now, same as F-228 itself was between F-229's Batch 34
and this close-out.

## Batch 53 — F-233: Razorpay key drift (CI-baked vs. VM production) — found, fixed, and closed same session during the F-228 production deploy

**Surfaced during the F-228 production deploy itself**, not a separate investigation: the deploy's
own required live-fire OTP-booking check (`BK-8CC5D6FD`) hit a real "Payment Failed" on a genuine
Razorpay Test Mode checkout, traced live to a `401` from Razorpay's own `standard_checkout/preferences`
endpoint (browser console + network log), then to the root cause via VM SSH: `deploy/gcp-vm/.env.ci`'s
`RAZORPAY_KEY_ID` (`rzp_test_TJllXnaezST7MV`, baked into guest-member-pwa's shipped bundle) did not
match the production VM's real `.env` (`rzp_test_TLWpMFXUprxFba`, confirmed unchanged since at least
19 Aug 2026 via two on-VM `.env` backups). The 30 Aug 2026 "Bug 2" fix that started baking a "real,
public" key into `.env.ci` picked a value that never actually matched the VM's live secret — a
~12-day-old silent production outage on real Razorpay checkout, caught only because this deploy's
live-fire requirement happened to exercise one for the first time since.

**Fix:** `deploy/gcp-vm/.env.ci`'s `RAZORPAY_KEY_ID` aligned to the VM's real value. Commit `8672d03`
on branch `fix-razorpay-key-drift`, PR #26 → `main`. CI green (checks + regression on the PR;
`integration` image build/push green on the `main` merge run, headSha `3b98e86b6f97e8e2d2c72dafb52e5ae3a1902358`).
Redeployed to production via `promote.sh 3b98e86b6f97e8e2d2c72dafb52e5ae3a1902358` — pre-flight disk
check (12GB free, sufficient), all 7 images pulled, F-077 SHA guard passed, no pending migrations,
6 services recreated, `verify-deployment.mjs`'s internal check passed all 8 components, Caddy
HTTP-fallback check = 0 (genuinely HTTPS). Post-deploy confirmed both the shipped guest-member-pwa
bundle and the running payment container's env now agree on `rzp_test_TLWpMFXUprxFba`.

**Re-verification, live:** `BK-8CC5D6FD` retried end-to-end through a real Razorpay Test Mode
checkout (user-entered test card, per the standing rule that card entry is never done by the
assisting thread) — `HELD` → `CONFIRMED`, confirmed via DB read-back (`status = CONFIRMED`).

**Two related-but-different observations surfaced while chasing this, deliberately not folded in,
per Chief's explicit disposition, same discipline as the F-171/F-172/F-173 blast-radius lesson above:**
- A Razorpay-SDK-bootstrap-failure raw-error leak on the frontend (`BookingPay.tsx`'s `payment.failed`
  handler only covers a declined attempt *after* checkout opens; this key-mismatch failure happened
  during SDK bootstrap, before that handler is even reachable, so Razorpay's own uncontrolled error
  UI + a native `alert()` leaked straight through). Same class of gap as F-229's Batch 43 "no raw code
  errors on screen" hardening, outside what that batch reached. Deferred — no ID assigned, not an
  active bug, proposed fix direction (a deploy-time key-match assertion + a best-effort watchdog
  banner) recorded for whenever it's picked up.
- `/payment-links/negotiated` and `/bookings/manual`'s `razorpay_link` option are fully mocked in
  every environment including production (`services/payment/src/index.ts:990-993`, `:816-817`) —
  pre-existing, already confirmed by Bala as known/expected scope (payment-gateway integration for
  that path not yet built). No finding needed, no action taken.

**Decision record:** Chief-assigned ID (`chief-signoff-f228-production-deploy-2.md`, 12 Sep 2026) —
next available after F-232. Confirmed, resolved, and disposition of the two adjacent observations
all specified in that same sign-off, not inferred.

**Handed off:** 12 Sep 2026.
**Status:** merged to `main` (`3b98e86b6f97e8e2d2c72dafb52e5ae3a1902358`), deployed to production,
independently re-verified by Chief against a fresh clone (`HEAD` = `3b98e86`, `git show 8672d03`
read in full, matches this description).
**Branch/PR:** `fix-razorpay-key-drift` (commit `8672d03`), PR #26 → `main`.

**Close-out:** `pnpm register:check` green — **209 rows, Open 110, Resolved 99** (F-233 added
directly as Resolved, same same-session pattern as F-228 and F-230 — from 208/110/98).
`pnpm diagram:verify` green — all 67 finding tags agree, same advisory list as before, no tagged
FLOW node touched (this finding names no new endpoint).

## Batch 54 — F-234: branch-local time rendering in guest-member-pwa (viewer-browser-timezone bug)

**Surfaced 12 Sep 2026**, Chief kickoff, following a real 5.5-hour timestamp discrepancy Bala
observed on a live JBC slot. Traced to a display bug, not a storage bug: `Branch.timezone`
confirmed still `'UTC'` for both real JBC branches, so `AvailabilityWindow.startTime` is stored
correctly — guest-member-pwa was rendering it via unguarded `toLocaleTimeString()`/
`toLocaleDateString()`/`.getHours()` calls, i.e. the viewer's own browser timezone, not the
branch's. Every real India-based guest saw times shifted by their browser's UTC offset on every
guest-member-pwa screen. `CourtBooking.tsx`'s Morning/Afternoon/Evening band filter used the same
local-hour value for bucketing, not just display — confirmed as a real correctness bug (worked the
arithmetic: a 07:00Z/branch-morning slot buckets as Afternoon for an IST viewer), not merely
cosmetic.

**Investigation + plan:** confirmed the one place this was already done right — admin-v2's
`reservationHelpers.ts` (F-229 Step 5, `safeTimeZone`/`branchHour`/`formatSlotLabel`) — as the
pattern to reuse (rule 3), not invent new logic. Confirmed `timezone` was in none of the three
payloads guest-member-pwa consumes; `GET /branches/:id/about` picked as the place to add it
(already called by three of the five affected files). Enumerated 8 real render sites across 5
files (more than a single grep pass per file would have found — several files have 2+ independent
sites). Resolved two genuinely open data-wiring questions: `BookingPay.tsx` gets its own new
branch-fetch (mirroring the other files' pattern, frontend-only, since it had zero branch-fetch
infrastructure), `main.tsx`'s member-session card and upcoming-slots card get two independent
fetches (single-fetch vs. dedup-map, since a member has one active assignment but upcoming
bookings can span multiple branches). Explicitly left the day-picker's viewer-local "which day is
today" logic alone (`CourtBooking.tsx:33-40`, `264`/`298-312`) — a different concern (UX
default-day question, not branch-local time-of-day rendering), flagged, not folded in (rule 9).

**Fix:** new `packages/ui-shared/src/lib/branchTime.ts` (`safeTimeZone`/`branchHour`/
`formatBranchTime`), exported from `ui-shared`'s index; `services/tenant-management`'s
`/branches/:id/about` gains a `timezone` field (additive, 4-line diff); `CourtBooking.tsx`,
`BookingConfirmation.tsx`, `BookingHistory.tsx`, `BookingPay.tsx`, `main.tsx` converted to
branch-aware rendering. A genuine catch beyond the plan's own scope, found while implementing:
`CourtBooking.tsx`'s "upcoming booking" card pulls from all of a user's bookings filtered only by
pool, no branch filter — it needed its own independent branch-timezone fetch
(`upcomingBranchAbout`), distinct from the screen's own `branchAbout`. Commit
`9f49694f574524b8355bbf9d70502e1eccb16e41` on branch `f234-branch-local-time-rendering` (branched
cleanly from `main`@`8912110`). 8 files changed, 201 insertions / 33 deletions.

**Re-verification, live:** real Playwright session with `browser.newContext({ timezoneId:
'Asia/Kolkata' })` (confirmed actually taking effect via `Intl.DateTimeFormat().resolvedOptions()
.timeZone` reading back `"Asia/Calcutta"` and a known instant rendering with the correct +5:30
shift), covering all 8 render sites across the 5 files, plus the specific screen from Bala's
original screenshot (guest PWA's slot list, "New Japan Badminton Court" branch) re-checked showing
the correct branch-local hour. `CourtBooking.tsx`'s band-filter bucketing bug got its own dedicated
before/after check, not folded into the general display-fix verification. One site (`main.tsx`'s
member-session card) verified against mocked network responses (`page.route()`) rather than a live
MEMBER fixture with an active subscription, because a DB-mutation guardrail in the sandbox blocked
the raw SQL needed to create that fixture — disclosed as lighter evidence than the other 7 sites,
not silently equated. Full regression suite green after a fresh rebuild (rule 7 — no stale-build
testing).

**One related-but-different observation, deliberately not folded in, per the kickoff's own
explicit scope call:** `admin-web` carries the same viewer-local-timezone anti-pattern (at least in
`main.tsx`) but is being actively replaced by admin-v2 — out of scope by the kickoff's own terms;
becomes its own follow-up finding only if admin-web stays in real use longer than expected, not
bundled into F-234.

**Decision record:** Chief-assigned ID, specified directly in the original kickoff handover
(12 Sep 2026) — not a fresh assignment during this batch.

**Handed off:** 12 Sep 2026.
**Status:** implemented and pushed, **not yet merged to `main`** — the merge decision is a
separate call. Independently re-verified against the real pushed branch: fresh clone, `git show
9f49694` read in full and matches this description, `git merge-base --is-ancestor main
origin/f234-branch-local-time-rendering` confirms clean ancestry (no rebase needed, `main` hasn't
moved since the branch point).
**Branch/PR:** `f234-branch-local-time-rendering` (commit `9f49694f574524b8355bbf9d70502e1eccb16e41`),
no PR opened yet.

**Close-out:** `pnpm register:check` — before this batch, 209 rows (Open 110, Resolved 99); once
this batch's register row + pending-findings entry land, expect **210 rows, Open 110, Resolved
100**. `pnpm diagram:verify` expected green, unchanged advisory list (this finding touches no new
endpoint tag — `/branches/:id/about`'s new field is additive to an already-tagged route). Run both
for real after committing and report the real output — don't assume these numbers, confirm them.

## Batch 55 — F-219: capture and persist real admin name/photo from Google login

**Confirmed 2 Sep 2026**, while building an admin-v2 topbar account-menu addendum for sub-slice
0.3 — a systemic identity-auth gap, not an admin-v2 UI issue. `verifyGoogleIdToken`
(`services/identity-auth/src/adminGoogleAuth.ts`) verified the Google ID token but only ever
extracted `email`/`sub`; `name`/`picture` are present on every real token and simply discarded, so
`AdminUser` (`apps/admin-v2/src/lib/claims.ts`) carried no `name`/`picture` for either the
Google-login or dev-login path, and admin-v2's topbar showed only an email/initials `Avatar`.
**Not a same-session find-and-fix** — full remediation design was worked out in full at
confirmation time, but implementation was deliberately held and picked up fresh in a later
session, against a handover that re-verified every one of its own claims against
`main`@`7e3aa71` before any code was written.

**Design, confirmed unchanged at pickup:** two options were weighed at confirmation time. (a)
forward into the JWT only, no persistence — rejected: the value would visibly flicker, appearing
after a fresh Google login then silently reverting to initials on the next `/auth/refresh` (never
re-touches Google) or passkey login (never contacts Google at all). (b) persist on the `User`
row — the approved design, durable across both paths since both read the same row.

**Fix:** `VerifiedGoogleIdentity` extended with optional `name`/`picture`, extracted from the
verified payload in `verifyGoogleIdToken`. New nullable `User.displayName`/`User.photoUrl`
columns (migration `20260912120000_admin_display_name_photo_f219`, purely additive, same pattern
as F-229's `User.name`). Persisted in `POST /auth/admin/google/verify` between the `user` fetch and
`issueAdminSession`, real-Google-branch only — `??`-merged so a response missing the claim never
overwrites a previously-good value, and the `dev-admin-token-` path explicitly skipped so dev/CI
logins never write fabricated data. `issueAdminSession`'s parameter type and signed JWT payload
extended with `displayName`/`photoUrl`; both its real call sites (Google login, WebAuthn/passkey
login) carry the fields for free since both already pass a full `user` row. `apps/admin-v2/src/lib
/claims.ts`'s `AdminUser` and `parseAdminClaims` decode the new claims the same individual-field
way as `phone`. `AppShell.tsx`'s topbar `Avatar` and account-menu identity line prefer
`displayName ?? email ?? userId`, `src` prefers `photoUrl` — `Avatar`'s existing `src`-missing
fallback to initials needed no new handling. Also bumped the topbar avatar from `sm` (24px) to
`md` (32px), a follow-up request during review.

**A genuine blast-radius miss, caught only during live-fire testing, not by the original design's
own call-site scan:** `/auth/refresh` — a separate, generic refresh route shared by every session
type — signs its own JWT independently of `issueAdminSession`, not through it. The original plan
traced `issueAdminSession`'s two real call sites correctly but missed that a second, distinct
JWT-signing site existed at all. Live-fire testing `/auth/refresh` (decoding the returned JWT)
surfaced the gap directly: the topbar reverted to initials on every page reload until this second
site was found and fixed — exactly the flicker failure mode design (b) was chosen to avoid. Fixed
by extending `/auth/refresh`'s own `server.jwt.sign(...)` payload with `displayName`/`photoUrl`,
same pattern. The other three `server.jwt.sign` call sites in `identity-auth/src/index.ts` were
checked and confirmed out of scope (member/guest OTP login, member's Google mock, a short-lived
WebAuthn challenge cookie — none carry admin identity claims).

**Live-fire verification, real evidence throughout, not reasoning from code:**
- Real Google OAuth login (Bala's own account) through the dev-deployed stack — DB row read back
  via `psql` confirmed `displayName`/`photoUrl` populated with the real name and a real
  `googleusercontent.com` photo URL.
- `/auth/refresh`'s returned JWT decoded (Node, not assumed) post-fix, confirming both claims
  survive a page reload — this is what caught the missed second signing site.
- Dev-login (`dev-admin-token-`) re-tested after the real Google login had already populated the
  row: confirmed both fields stay untouched/`null` for a never-Google-logged-in dev user, and the
  `Avatar` renders initials, not fabricated data.
- Passkey enrollment (`WebAuthnCredential` row confirmed created via direct DB read) and a real
  passkey login on the same previously-Google-authenticated account, both completed by Bala (a
  native OS/cross-device biometric ceremony, not something drivable from an automated browser) —
  confirmed rendering the real name/photo with zero Google round-trip, proving persistence rather
  than a JWT-only illusion.
- Whole-repo typecheck clean across all 14 workspace projects; `identity-auth` and `admin-v2`
  builds clean.
- Full 5-service regression suite green post-rebuild (rule 7), against `badminton_db_test`. An
  initial full-suite run showed 3 suites failing together (identity-auth, tenant-management,
  payment) — each re-run clean in complete isolation, then the full 5-suite set re-run clean
  immediately after, confirming this project's own documented cross-suite port-collision pattern
  (manually-started dev services on 3001–3005 colliding with the harness's own spawned instances)
  rather than a real regression from this change.
- Migration applied cleanly against both `badminton_db` (dev) and `badminton_db_test`, confirmed
  via direct `psql \d "User"` reads on each.

**Not tested:** a real Google account with no profile photo set (none available this session) —
the null-fallback path is the same `Avatar` `src`-missing branch already exercised by the
dev-login case above, so it's covered by equivalent evidence, not zero evidence.

## Batch 56 — F-197: admin-v2 notification opt-in + real FCM push dispatch (F-025 push half)

**Findings:** F-197 (Resolved), F-025 (stays Open — push half done, SMS/MSG91 half untouched)
**Status:** Done
**Commits:** `27ead52` (implementation), `ec66feb` (CI lint fix — a stray
`react-hooks/exhaustive-deps` disable comment errored under this repo's actual eslint config,
which has no react-hooks plugin registered at all), PR #30 → `main` merge commit `6055b97`.
Independently confirmed on the real remote via `git fetch origin main` — not a relayed claim.

Handover named a second finding, "F-226," for the backend real-dispatch half and stated both IDs
already existed. **Independently re-verified before building anything: F-226 does not exist in
`docs/findings_register.md`** (the register jumps F-225 → F-227 with no gap). Per this project's
own rule, an unverified referenced ID gets neither invented content nor a silent skip — surfaced
to the user directly, who confirmed: build the backend half under **F-025**, the real,
already-registered finding covering this exact gap ("Real push (FCM) and real SMS notification
delivery never verified"). F-025 stays **Open** rather than moving to Resolved — it explicitly
covers both push and SMS, and only the push half was built here; SMS/MSG91 remains fully parked
(Bala's cost-driven call) and fully mocked, untouched. Resolving it fully would have silently
declared the SMS half done when it isn't.

**Blast-radius check done up front (rule 3a), one genuinely critical finding from it:**
`services/notification/src/queue.ts`'s `processQueue()`/`mockDispatch` is called directly by three
regression suites that hard-assert mock behavior using fabricated tokens
(`dispatch-and-routing.regression.ts`'s `providerRef` startsWith `mock-push` assertion on
`fcm-test-token-abc123`). Real dispatch is gated on `FIREBASE_SERVICE_ACCOUNT_JSON` actually being
configured — absent in `.env.ci`/regression env by design, so the mock path is preserved there with
zero test changes. Also found: `apps/admin-v2/vite.config.ts` had no `/api/notification` dev-proxy
entry (first admin-v2 consumer of that service) — added, mirroring the existing `/api/payment`
entry; and `NotificationTemplate`/`templateBody` is stored but never rendered for any channel
today, confirmed via grep — real push intentionally does not wire that in either, flagged rather
than silently expanded into or silently left unmentioned (rule 9).

**Fix — backend (F-025 push half):** new `services/notification/src/firebase.ts` lazily
initializes the Firebase Admin SDK only when `FIREBASE_SERVICE_ACCOUNT_JSON` is set;
`sendPush(token, eventType, variables)` calls `admin.messaging().send(...)`, catching
`messaging/registration-token-not-registered` as a `StaleTokenError`. `queue.ts`'s single dispatch
call site branches: `push` + configured → `sendPush`, everything else → the existing `mockDispatch`
unchanged. A `StaleTokenError` deletes the stale `DeviceToken` row before falling through to the
existing retry/dead-letter bookkeeping (built per the handover's flag, not required to ship but
cheap) — **observed live**, not just coded: a real invalidated token correctly triggered the
delete during verification below.

**Fix — frontend (F-197):** new `apps/admin-v2/src/lib/firebase.ts`
(`requestAndRegisterPushToken`): `Notification.requestPermission()` → `getToken()` against the
already-registered `/sw.js` (no separate `firebase-messaging-sw.js`) → `POST /devices/register`
(existing endpoint, unchanged). One `DropdownMenu.Item` added to `AppShell.tsx`'s account menu
(the single shared layout route every admin-v2 screen mounts under) — "Enable notifications" /
"Notifications enabled" / "Notifications blocked (browser settings)" by current
`Notification.permission`. Silent re-registration on load when already granted, since the modular
Firebase SDK dropped `onTokenRefresh` — `POST /devices/register`'s upsert-on-unique-token makes
this idempotent regardless of rotation, confirmed live (multiple re-registrations, zero
duplicate-key errors).

**Env/secrets wiring:** the seven public Firebase web-config + VAPID vars added to `.env.example`,
`deploy/gcp-vm/.env.ci`, and as build-args in `deploy/gcp-vm/docker-compose.yml` /
`Dockerfile.caddy-static`, mirroring the existing `VITE_GOOGLE_CLIENT_ID` precedent exactly.
`FIREBASE_SERVICE_ACCOUNT_JSON` (the real secret) was **not** added to any committed file —
confirmed absent from `.env.ci` and the diff; it lives only in the gitignored local `.env` for this
session's testing and, for production, only in the VM's own gitignored `.env` — same split that
F-233 (Batch 53) was burned by getting wrong once already. `docker-compose.dev.yml`'s `notification`
service gains a `${FIREBASE_SERVICE_ACCOUNT_JSON:-}` passthrough (substituted at `docker compose`
invocation time, never hardcoded).

**Live-fire verification, real evidence throughout:**
- Full 5-service regression suite green against `badminton_db_test` post-rebuild (rule 7), **twice**
  (once before the dev-stack live-fire pass, once as final confirmation) — `notification`'s
  mock-push assertions passed unmodified both times, confirming the Firebase-configured gate stays
  off in CI/regression as designed.
- Whole-repo typecheck + build clean (`@badminton/notification`, `@badminton/admin-v2`).
- A real environment hiccup during setup, disclosed rather than smoothed over: a Windows-path-length
  pnpm symlink issue after adding the `firebase`/`firebase-admin` deps broke `vite`'s own bin
  resolution — fixed with a clean `node_modules` reinstall, not worked around.
- Real permission grant (Bala, real Chrome, real Windows machine) → real FCM token → real
  `DeviceToken` row, confirmed via direct `psql` read-back, across several natural re-registrations
  during testing (upsert behavior held, no crashes).
- Denied-permission state confirmed independently in the sandboxed preview browser (which denies
  `Notification.requestPermission()` by policy) — the account menu correctly showed "Notifications
  blocked (browser settings)" with no crash.
- Real end-to-end push: `POST /notifications/send` (real, unmodified endpoint) with a real
  `low_occupancy_alert` event → real `admin.messaging().send()` → genuine FCM message ids
  (`projects/slot-flow-admin/messages/...`) recorded as `providerRef`. First two attempts produced a
  real message id but no visible toast; root-caused live (not assumed) to Windows notifications for
  Chrome being off at the OS level — Bala corrected this mid-session, and the next two sends both
  produced a real, on-screen "Low Occupancy Alert" toast, confirmed by Bala directly in the
  conversation.
- Stale-token cleanup observed live: an invalidated token correctly returned
  `messaging/registration-token-not-registered`, was recorded in `errorMessage`, and its
  `DeviceToken` row was confirmed deleted on the next read.
- `pnpm register:check` green (211 rows, Open 109 / Resolved 102, no drift).

**Not yet done, explicitly flagged:** `pnpm diagram:verify` and the branch push +
independent-remote-verification step (rule 7) — next in this same close-out pass. No commit without
explicit sign-off (rule 5) — a review branch is being pushed for independent diff review per
standing practice, not merged to `main` without a further go-ahead.

**Sign-off:** Bala, reviewed against the pushed branch diff (not the evidence report alone) — "F-219
implementation approved. Nothing to send back for changes."

**Branch/PR:** `f219-admin-google-name-photo` (commit `dd7e278`), not yet merged to `main` — merge
timing is a separate decision, same as F-234's flow.

**Close-out:** register row added directly as Resolved (Found 2 Sep 2026 — the real confirmation
date, not today, since this wasn't a same-session find-and-fix; Resolved 12 Sep 2026), same
same-session-row-add pattern as F-228/F-230/F-233/F-234 even though the underlying finding itself
spans two sessions. pending-findings.md's existing `admin-v2-identity-pipeline-discards-
google-name-photo` entry (already carrying `Confirmed-ID: F-219` / `Confirmed: 2 Sep 2026`) gets a
`Resolved:` line added, not a duplicate entry. Run `pnpm register:check` and `pnpm diagram:verify`
for real after committing and report the real output — don't assume, confirm.

## Batch 57 — Production deploy #3 (F-234, F-219, F-197/F-025 push half) + F-236 assigned

**Findings:** F-234, F-219, F-197 (all live in production, already Resolved as of Batches 54-56),
F-025 push half (already documented Open with the push-half note, Batch 56); new finding **F-236**
assigned (Open, unimplemented)
**Status:** Deploy Done; F-236 unimplemented, low urgency
**Commits:** deploy target `6055b9739fcdf60e18c5b672359875cb1dfcaf21` (`6055b97`) — no new app code,
this batch is the production promotion of already-merged work plus this close-out's own docs commit

Chief-authorized direct execution (Bala, direct — "shall we complete the push to GCP the changes
until now"), same pattern as the F-228/F-233 production deploys. Named commit range
`3b98e86..6055b97` (docs-only F-233 close-out, F-234 fix + close-out, F-219 fix + close-out,
F-197/F-025 fix + lint cleanup, PR #30 merge).

**Prerequisite handled before deploying:** `FIREBASE_SERVICE_ACCOUNT_JSON` was not yet on the
production VM. Confirmed with Bala directly (reusing the same credential supplied earlier for
dev, not a separate prod-specific one) before writing anything to the VM's `.env`. First transfer
attempt (piping the ~2.3KB secret through `gcloud compute ssh`'s stdin) was silently truncated by
`plink` down to a single garbage character — caught immediately by a length check, not assumed
good; the VM's `.env` was cleaned up (one stray line removed, confirmed via `sed -i '$d'` +
line-count check) and the secret re-sent via `scp` instead, with the transferred file's exact
byte length (2365 = 30-char var name + the known 2335-char JSON) verified before appending and
deleting the temp file. Zero secret content was ever echoed back into the conversation transcript.

**Deploy mechanics:** `promote.sh <full-SHA>` — the doc's example used a short SHA, which does not
match Docker Hub's `:<svc>-<full-sha>` immutable tag scheme; first attempt failed cleanly (`no
matching manifest`, nothing mutated) before the full 40-char SHA was substituted and the real
promotion ran clean: all 7 images pulled, F-077 migrate guard passed (`ok — image matches the
deploy target`), F-219's migration applied for real on production, 6 services recreated
(`migrate`/`postgres` correctly excluded), Caddy HTTPS confirmed genuinely live (HTTP-fallback
grep = 0), `verify-deployment.mjs` — all 8 components PASS.

**Live-fire checks, all real:**
- F-234: confirmed from a browser reporting `Asia/Calcutta` (IST) as its own timezone — JBC's
  Main Courts pool correctly showed `06:00–23:00` operating hours and an `11:00 AM` slot, both
  unshifted (the pre-fix bug would have shown a ~5.5h shift for this exact viewer).
- F-219: production `User` row for the real admin read back directly — `displayName`/`photoUrl`
  populated with the real name and a genuine `googleusercontent.com` photo URL.
- F-197/F-025 push half: a real production `DeviceToken` registered (Bala, his own device);
  two real `low_occupancy_alert` sends both returned genuine FCM message ids
  (`projects/slot-flow-admin/messages/8e13d432-...`, `...cd62986f-...`) — triggered via a
  throwaway `curlimages/curl` container on the compose network reading `INTERNAL_SERVICE_KEY`
  from `.env` (never as a CLI arg); Bala confirmed both arrived on-screen.
- Baseline regression: a real OTP-verified guest booking held end-to-end (`BK-D0759B62`, correct
  branch-local slot time, correct price); real Razorpay Test Mode checkout initialized correctly
  under the right key (Test Mode ribbon, correct `JBC Courts` branding/amount, no 401) — the exact
  failure class F-233 exposed, confirmed absent. Full card-entry completion wasn't finished (a
  browser-automation focus quirk on Razorpay's cross-origin iframe, disclosed as a tooling
  limitation, not an app-side symptom) — checkout initializing correctly under the right key is
  itself the regression check that matters here.

**New finding surfaced, not self-fixed:** real content-display bug found during the push check —
delivery works, but the notification shows generic fallback text instead of the real event
title/body. Root cause identified live (not guessed) and reported to Chief rather than patched
unilaterally mid-deploy, since this deploy's authorization covered only the already-reviewed
F-234/F-219/F-197/F-025 change set. Chief independently re-verified the root cause directly in
code (both `firebase.ts` and `sw.js`) and assigned **F-236** (Open, unimplemented, low urgency —
doesn't block anything). Logged in `docs/plans/pending-findings.md` and `docs/findings_register.md`
per Chief's relay instruction, in this same close-out pass. A related but separate observation
(push only showing after the app is opened) was deliberately **not** folded into F-236 — not yet
independently confirmed as a code defect by anyone, needs real reproduction with the app genuinely
backgrounded before it gets its own ID.

**Independent verification (Chief):** fresh clone of `main`, `HEAD` confirmed at `3777494` (one
docs-only commit ahead of the `6055b97` deploy target — confirmed as an unrelated batch-log
addendum, not an unauthorized fix, via `git merge-base --is-ancestor 6055b97 HEAD`); F-236's root
cause read directly in both `firebase.ts` and `sw.js`, confirmed exactly as reported; the SSH
truncation-and-retry handled with sound operational discipline, nothing to flag. Production-only
claims (real DB reads, the two real FCM message ids, real on-screen confirmation) accepted on the
same evidentiary bar as F-228/F-233 — outside what an isolated verification thread can independently
re-run, no network path to the production VM.

`pnpm register:check` (212 rows, Open 110 / Resolved 102) and `pnpm diagram:verify` (67 tags, all
agree) both green after this close-out's edits.

## Queued, not yet batched

- **F-088 parts (1), (3), (4)** — deliberately held for its own dedicated session, not queued alongside
  smaller batches, given the coupling and the production-flip stakes.
- **`docs/plans/guest-flow-fix-groups.md` — Groups A through H all still open; Group G partially
  advanced by Batch 4.** Confirmed against the register: **0 of 36 grouped findings are Resolved.**
  Batch 1 predates that document and covered findings it lists under "Cleared before grouping", so no
  group was consumed by it.
