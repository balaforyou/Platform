# F-044 Phase A — Walkthrough for Peer Review

**Status:** Complete, uncommitted, pending sign-off. 8 Aug 2026.
**Scope:** The generic scheduled-job mechanism only. No slot-engine wiring, no member-attendance job, no Notification changes, no sweep wiring — all Phase B.
**Plan:** `C:\Users\HP\.claude\plans\binary-napping-whale.md`

---

## 1. Why this exists

This platform has never had real scheduled infrastructure. `POST /bookings/sweep` ([slot-engine/index.ts:2509](../../services/slot-engine/src/index.ts)) carries the comment *"In production this runs as a cron/background job"* — that cron job does not exist anywhere in the repo, and its only callers are two regression tests. F-043 Phase A avoided the problem entirely with lazy on-access generation. Nothing has ever run on a timer.

F-044 identified three use cases sharing one need: (1) admin notified before a guest-slot pattern expires, (2) guest reminded a booked slot is approaching, (3) member reminded their confirmation cutoff is approaching. Phase A builds the mechanism; Phase B proves it with use case 3 only.

---

## 2. Architectural decisions

| Decision | Chosen | Why not the alternatives |
|---|---|---|
| Where the scheduler runs | In-process timer in a generic package | **Cloud Scheduler** ties the platform to GCP against an explicit portability goal, and needs a publicly-reachable trigger endpoint — the shape that produced F-053. Production routing is still undecided (F-004). **A 6th service** adds an always-on container to one VM already running Postgres + 5 Node services + Caddy, each capped at 96MB heap. |
| Which service hosts it | slot-engine | All three use cases read slot-engine's data. Notification owns *delivery*, not domain state, and the codebase enforces that boundary — `notification/index.ts:51` does a cross-service HTTP lookup rather than reading `User` directly. A scheduler in Notification would either break that boundary or call back into slot-engine to ask "what's due?", which is Cloud Scheduler's shape with extra steps. |
| Genericity mechanism | Port interface, **zero runtime dependencies** | Importing Prisma would put `@badminton/database` — a vertical's name — into the "generic" package's dependency list, and open a third connection pool in slot-engine against `max_connections=30`. The host implements `ScheduledJobStore`; the package depends on nothing. |

**Verified genericity:** `dependencies: {}` in the real manifest, and `rg 'court|badminton|booking|member|slot|guest|player|notification' packages/job-scheduler/src` returns no matches (exit 1). Both re-run independently by the reviewer, not taken from the test's own report.

---

## 3. What was built

**New package `packages/job-scheduler`** — `types.ts` (the port and job contracts), `runtime.ts` (tick loop, claim orchestration, failure isolation, policy binding), `sql.ts` (the claim statement), `sqlStore.ts` (the SQL adapter), `tests/phaseA.test.ts`.

**Two Prisma models + migration** (`20260808070000_scheduled_jobs_f044_phase_a`): `ScheduledJob` (one row per registered job — schedule, lease, failure/circuit state) and `ScheduledJobDispatch` (the occurrence-level dedup ledger). Applied to the real database; `prisma migrate status` clean at 11 migrations.

### The claim — raw SQL, not `prisma.updateMany`

```sql
WITH due AS (
  SELECT "name", "nextRunAt" FROM "ScheduledJob"
   WHERE "name" = $1 AND "enabled" = true
     AND "nextRunAt" <= now()
     AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
     AND ("consecutiveFailures" < $3
       OR "circuitOpenedAt" IS NULL
       OR "circuitOpenedAt" < now() - make_interval(secs => $4))
   FOR UPDATE
)
UPDATE "ScheduledJob"
   SET "nextRunAt" = now() + make_interval(secs => "intervalSeconds"),
       "lastRunAt" = now(),
       "lockedUntil" = now() + make_interval(secs => $2)
  FROM due WHERE "ScheduledJob"."name" = due."name"
RETURNING ...;
```

Single-statement CTE, atomic under auto-commit. Uses the **database clock**, so "due" isn't a per-process notion under clock skew. Raw SQL rather than the ORM because the lock-free claim only holds if the predicate is a flat `WHERE` on the updated column — if Prisma emitted the `WHERE id IN (SELECT …)` form, both callers would claim. Identifiers quoted throughout, per F-051's raw-SQL/Prisma-casing lesson.

### The dedup ledger — two independent guards

1. **`@@unique([jobName, dedupKey])`** — a real database constraint. Postgres admits one writer; application code never decides who wins.
2. **The lease (`lockedUntil`)** — prevents two instances running the same job tick.

Retry is **by status predicate, never by row absence**. A crash between claim and send leaves `PENDING`; retrying on absence would treat that as "already done" and lose the occurrence permanently. The upsert reclaims only a *stale* `PENDING` (age-gated) or a `FAILED` row, so a live in-flight dispatch is never stolen. Exhausted attempts land in `ABANDONED` and the wrapper returns `false` by checking the returned status rather than row count.

### Circuit breaker — time-based half-open

After N consecutive failures the circuit opens; claims are blocked for a cooldown; once elapsed the job becomes claimable for a single probe. Success clears `circuitOpenedAt` and zeroes the counter; a failed probe re-opens with a fresh cooldown. The lease incidentally limits the probe to exactly one runner — a second instance arriving after the same cooldown is blocked by `lockedUntil`.

---

## 4. Defects found in review and fixed pre-commit

These were in new, uncommitted code — caught during review, fixed in-phase, not register findings.

| # | Defect | Fix |
|---|---|---|
| D1 | `Promise.all` with `claimDueJob` outside try/catch — one store failure abandoned every other job that tick; `completeJob` unguarded on two paths | `Promise.allSettled`, rejected claims surfaced as `FAILED` summaries, `safelyComplete` wrapper |
| D2 | Timeout nulled `lockedUntil` while the orphaned handler was still running — another instance could claim concurrently | `releaseLease: mode === 'claimed' && !timedOut` |
| D3 | `runJobNow` stripped a *different* run's active lease | `'manual'` mode never releases |
| D4 | `consecutiveFailures` written but read nowhere — no circuit breaker at all | Enforced in the claim predicate, then extended to half-open |
| D5 | `TIMEOUT` classified by `message.includes('timed out')` — a handler throwing "connection timed out" was misclassified | `JobTimeoutError` class + `instanceof` |

**Why D2/D3 matter more than they appear:** the red/green demonstration established that **mutual exclusion rests on the lease, not on the `nextRunAt` predicate**. Removing `nextRunAt <= now()` did *not* break one-winner behaviour, because the lease independently prevents a second claim. `nextRunAt` enforces scheduling correctness; `lockedUntil` enforces exclusion. That makes D2 and D3 holes in the concurrency guarantee rather than hygiene.

---

## 5. The central story — three classes of hollow guard

The bulk of this phase's review effort went into one recurring pattern: **code that passes its own tests while guaranteeing nothing.** Three distinct classes appeared in sequence.

**Class 1 — tautological tests (logged as F-055).** The first submission's four headline proofs were: an in-memory `Map` standing in for a Postgres unique constraint; a string-equality check asserting a SQL constant equalled itself; a `packageJson` object literal *defined inside the test that "verified" it*; and four hardcoded strings claiming scope compliance. Every one produced real console output and a passing run. Rule 8 (show evidence, don't summarize) was fully satisfied and the work was still unproven.

**Class 2 — accepted but absent.** The half-open circuit breaker and four of six SQL statements were recorded as *"fully accepted, no further action needed"* while not existing in the tree. Caught only because the reviewer had explicitly declined to vouch for items reviewed by someone else — `circuitOpenedAt` was absent from schema, migration, source, and the live table.

**Class 3 — present but inert.** `dispatchReclaimStaleAfterSeconds` was declared on `JobDefinition`, validated by a startup assertion, and covered by a passing test — but never reached the SQL. The value actually used came from a different field on a different type, chosen by the handler. A job could declare a safe 900s window, pass the assertion against a 600s timeout, then silently run on the 300s default — the exact unsafe configuration the assertion existed to prevent.

**What caught all three** was not reading the evidence more carefully. It was asking, of each claim, *"would this fail if the real thing were broken?"* — now Section B's fourth column in rule 9, with red/green (Section F) as the enforcement.

### Red/green outcomes

| Mutation | Result |
|---|---|
| Remove `nextRunAt <= now()` from claim | **Green** — the lease independently guarantees one winner. Test strengthened with a not-due future row, which then goes red. |
| Substitute `prisma.updateMany` | **Green** — honest and expected. A correct `updateMany` with the same flat predicate is safe under READ COMMITTED, so the test asserts on outcome, not mechanism. Raw-SQL remains a **code-review invariant**, not a test-enforced one. |
| Drop the unique index | **Red** — `42P10` against the shipped `ON CONFLICT` statement |
| Remove the stale-age gate | **Red** — `liveClaims:[true,true]`, a live dispatch stolen |
| Remove circuit guard / cooldown clause | **Red** in both directions independently |
| Revert policy binding to passthrough | **Red** — declared 400s window silently became the 300s default |

---

## 6. Findings to log (report-only, none fixed)

All verified first-hand at file:line. None were touched during Phase A — confirmed via `git status` that no file under `services/` changed.

1. **Displayed vs enforced member deadline.** Dashboard and confirm endpoint use `startTime − gracePeriodMinutes` (T−30); the sweep marks unconfirmed members `RELEASED_NO_SHOW` at `startTime − guestAccessCutoffMinutes` (T−120), which confirm rejects outright. A member is locked out 90 minutes before the deadline shown to them. **Dormant only because no cron exists.** Blocks wiring the sweep to the scheduler — doing so would lock members out before the reminder window opens, so the reminder would never fire for its target population.
2. **UTC and local time mixed.** `todayDateString` is UTC, `isoWeekday` is local, `startTime` is documented as branch-local but parsed as UTC. Worse: **`Branch.timezone` is written by tenant-management and never read by slot-engine.** A 60-second scheduler crosses midnight daily.
3. **`BookingRule` has no uniqueness guarantee** but 5 sites read `bookingRules[0]` with no `orderBy` across 13 touch points. Two rules on one pool make the effective `gracePeriodMinutes` — and every cutoff derived from it — nondeterministic between requests.
4. **`gracePeriodMinutes` has no floor**, and its two setters validate inconsistently: `POST /booking-rules` has no validation at all and coerces an explicit `0` to `30` via truthiness while accepting negatives unchanged.
5. **`POST /booking-rules` is unauthenticated — HIGH.** No auth call, no global `preHandler`, publicly routed. It sets `prepaymentRequired` and `cancellationPolicyJson`. **Compounds finding 3**: with no unique constraint it *appends* a rule row, flipping a pool's policy nondeterministically.
6. **`low_occupancy_alert` passes a raw `poolId`** in notification variables — the F-029/F-037 pattern. Minor candidate.

Already logged: **F-053** (unauthenticated `/bookings/sweep`), **F-054** (dead retry ladder), **F-055** (tautological tests).

**Suggested process note:** the three hollow-guard classes above are worth recording alongside F-055, since each passed its own test and each was caught by the same question.

---

## 7. Assumptions

**Design:**
- Postgres READ COMMITTED; the claim's safety depends on predicate re-check after row-lock acquisition.
- One instance per service today, but the design assumes multi-instance is possible and guards for it.
- `gracePeriodMinutes >= ~6` for the reminder mechanism to give meaningful notice; below that a pool is skipped visibly rather than reminded uselessly.
- The dispatch reclaim window must strictly exceed a job's timeout — now a startup assertion.
- `maxAttempts` semantics: initial send plus (N−1) reclaims.
- `SCHEDULER_ENABLED` defaults **off**, so the regression harness (which spawns real service processes) isn't perturbed by a live timer.

**Verification caveats — stated plainly:**
- Delivery remains the mock provider; no real SMS/push (pre-existing F-025).
- Retry-after-failed-delivery is unproven end to end because **F-054** means it doesn't currently work — the reminder's *queueing* is reliable, its *retry* is not.
- No UI surface in Phase A, so no screenshot evidence applies.
- The reviewer verified code and live database state directly, but did **not** execute the test suite. Pass/fail outcomes are the implementer's report; structure, SQL semantics, schema, and database state were verified first-hand.

---

## 8. Future scope

**Phase B (next):** mount in slot-engine, extract a shared `canMemberConfirm()` used by both the confirm endpoint and the job (F-022's lesson — two places computing one rule already drifted once), the member-attendance reminder with its guard band, and `NotificationRequest.idempotencyKey`.

**Cheap follow-ons:** use cases 1 and 2 as new `JobDefinition` files plus a registration line; registering the existing `pruneDispatches` helper as a job.

**Blocked:** migrating `/bookings/sweep` onto the scheduler — gated on finding 1 above.

**Deferred by design:** absolute-time (daily-at-HH:MM) scheduling — use case 1 will want it, and the `schedule` object leaves room without a breaking change.

**Cleanups:** the dispatch-policy defaults are duplicated literals (`?? 300` in the assertion, again in the binding) with nothing forcing agreement — the same family as the bug just fixed. `ScheduledJobStore` remains a lower-level port whose direct callers get defaults; Phase B must not hand the raw store to a domain handler.

**Scale note (flagged, not optimized away):** the reminder's due-query will scan `MemberGroupAssignment WHERE status='ACTIVE'` across all tenants 1440×/day. Trivial now; at thousands of assignments the real fix is narrowing by branch/time-bucket, deliberately not built.
