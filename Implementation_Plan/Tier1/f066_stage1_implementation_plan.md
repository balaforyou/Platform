# F-066 Stage 1 — Make `Branch.timezone` authoritative in Slot Engine's date logic

**Status: awaiting implementation sign-off.** Plan committed for review; no implementation has begun.

---

## Context

`Branch.timezone` is declared (`packages/database/prisma/schema.prisma:73`), collected by Tenant Management (`services/tenant-management/src/index.ts:220`, `:268`) — and **never read anywhere in Slot Engine**. Meanwhile three different clock conventions coexist in one date-resolution path, so "today" and "this weekday" can disagree.

This blocks two queued items directly: **F-073** (the `f023` full-chain re-verification cannot be trusted while date resolution is unreliable) and **F-044 Phase B** (a 60-second scheduler crosses real midnight daily).

### What the investigation changed about the finding

Three things were checked rather than assumed, and each moved the picture.

**1. `Branch.timezone` is not nullable, and the real problem is worse than a null.** From `information_schema`, not from the schema file:

```
column_name | data_type | is_nullable | column_default
timezone    | text      | NO          | 'UTC'::text
```

So no null-handling strategy is needed. But **100% of branches sit at the default** (`UTC | 2 | Branch A, Branch B`), and they cannot do otherwise: `timezone` appears nowhere in `apps/admin-web` at all — `branchScheduleSchema` (`main.tsx:180-183`) carries only `workingHoursStart`/`workingHoursEnd`, so the field is never sent, and `timezone: timezone || 'UTC'` always takes the fallback. **This is wrong data, not missing data.** Reading `Branch.timezone` today would change nothing, because it says `UTC` everywhere.

**2. Production runs UTC, so F-066's stated symptom does not currently fire there.** `TZ` is set nowhere in any Dockerfile, compose file or env file, and the runtime image resolves to `UTC` with `getDay() === getUTCDay()`. The 00:00–05:30 skew is a **developer-machine** phenomenon — this machine is `Asia/Calcutta` (offset −330) — which is precisely why F-073's failures appear in tests and never in production.

That makes the live production bug a *different* one: every layer agrees on UTC, so a branch's `"10:00"` session means 10:00 UTC = **15:30 IST**. Uniformly wrong, and invisible because everything agrees. And the latent risk is sharper than F-066 records: **setting `TZ=Asia/Kolkata` on the containers — a plausible, well-intentioned ops change — would instantly create the described date skew in production.** Booking correctness currently depends on an unset environment variable.

**3. There are more mixing sites than the two named**, and one non-obvious clean result:

| Site | Convention | Stage |
|---|---|---|
| `isoWeekday` `index.ts:666` | **server-local** `getDay()` | 1 |
| `todayDateString` `index.ts:662` | UTC | 1 |
| window lookup `index.ts:703` | branch-local string parsed as UTC | 1 |
| sweep weekday / date `index.ts:2676` / `:2683` | **server-local** / UTC | 1 |
| alignment helpers `index.ts:49-90`, used at `:971`, `:982` | server-local `getHours()` | 1 |
| booking horizon `index.ts:1881` | server-local `getDate()`/`setDate()` | 1 |
| `availabilityGeneration.ts:40,45,49,67` | consistently UTC — self-consistent, but treats branch-local pattern times as UTC. Its helper is literally named `atLocalUtcDate`. | **2** |
| `regression/_fixtures.ts:48`, `f023-full-system.spec.ts:23-41` | local `getDay()` mixed with UTC `toISOString()` | 1 |

The alignment helpers are not merely cosmetic: under IST the 60/90/120-minute boundary check shifts by 30 minutes (`330 % 60 = 30`), so the *same request would validate differently*. 15- and 30-minute durations are unaffected.

**Clean results, checked so they need not be revisited:** the job scheduler is purely interval-based (`nextRunAt = now() + make_interval(...)`, `packages/job-scheduler/src/sql.ts:17`) with no calendar or weekday logic, so the scheduler itself is timezone-safe — F-044 Phase B's risk lives entirely in the *handler* it will invoke, not in the scheduler. The notification service has no date logic at all.

---

## The Stage 1 / Stage 2 split

Flipping a branch from `UTC` to `Asia/Kolkata` is the actual breaking moment, not the code fix: an assignment's `"10:00"` stops meaning 10:00 UTC and starts meaning 04:30 UTC, so existing windows stop matching. Stage 1 therefore lands the code while every branch is still `UTC`.

**Stage 1 (this plan)** — the two named sites, alignment validation, booking horizon, test fixtures.
**Stage 2 (tracked, required, not optional)** — make `timezone` settable in admin, a per-branch dry-run migration report, the actual flip, and `availabilityGeneration.ts`, which is excluded here precisely because it is data-affecting and would contaminate Stage 1's safety property.

**F-066 is not marked Resolved on Stage 1.** Stage 2 gets its own register ID as an explicitly tracked next step.

### The safety property, stated honestly

The guarantee is **not** a blanket "zero behaviour change". It is:

- **With process `TZ=UTC` and branch timezone `UTC` — production today — behaviour is byte-identical.** Every Stage 1 helper reduces to exactly the expression it replaces.
- **With process `TZ=Asia/Calcutta` — this dev machine — behaviour deliberately changes**, from server-local weekday to branch-derived weekday. That change *is* the fix, and it is what makes F-073's spurious `WINDOW_NOT_FOUND` failures stop.

Claiming zero change everywhere would be false, and the regression suite runs on the dev machine where it is false.

---

## Technical Design

### Conversion mechanism — built-in `Intl`, zero dependencies

No date library is a dependency anywhere in the repo, and none is needed. Verified **inside the real runtime image**, not assumed:

```
Asia/Kolkata -> 2026-08-13, 12:19   (expected 2026-08-13, 12:19)
ICU          : FULL (ok)
DST probe NY : 07:00 (EST, Jan)  /  08:00 (EDT, Jul)
```

Full ICU is present, so IANA zones resolve correctly. **DST is handled correctly** — the America/New_York probe returns EST in January and EDT in July — so DST-observing timezones are supported, not deferred. This matters for the platform's region-agnostic intent; India not observing DST makes it low-risk today, but the mechanism is correct regardless.

### New module: `services/slot-engine/src/branchTime.ts`

Four pure functions, each taking an explicit `timeZone`:

- `branchDateString(instant, tz)` → `YYYY-MM-DD` in the branch's zone
- `branchIsoWeekday(instant, tz)` → `"1"`–`"7"`, ISO, matching the `daysOfWeek` convention
- `branchLocalToUtc(dateString, "HH:mm", tz)` → the `Date` for that local wall-clock time
- `branchHHMM(instant, tz)` → `HH:mm` in the branch's zone, for alignment and error messages

`branchLocalToUtc` is the one with a real edge case: converting *from* local wall time *to* an instant is ambiguous across a DST fall-back and non-existent across a spring-forward. It resolves via offset probing and documents the chosen convention explicitly (earlier offset on ambiguity, forward shift on non-existence). Unreachable for India; correct for zones where it is reachable.

### Timezone lookup — a constraint worth stating

`ResourcePool.branchId` is a **scalar UUID with no Prisma relation** (`schema.prisma:107`, commented "Scalar UUID, no DB relation yet"), so `include: { branch: true }` is impossible. The timezone needs its own query.

- `resolveTodayMemberAssignment` (`index.ts:683`): one `branch.findUnique({ select: { timezone: true } })` — a primary-key lookup, on a path that already issues three queries.
- The sweep (`index.ts:2665+`): collect `branchId`s from the loaded assignments and fetch all timezones in a **single `findMany`** before the loop, to avoid an N+1 across every active assignment.

No caching in Stage 1. A module-level cache would go stale on a branch update, and correctness outranks a primary-key lookup.

### Call-site changes

**`resolveTodayMemberAssignment`** — the assignment is found first (it is not date-dependent), then its pool's branch timezone resolves `weekday` and the window date. Ordering matters: the weekday cannot be computed before the branch is known, so the `NO_ACTIVE_ASSIGNMENT` early return moves ahead of the weekday computation and reports the process-UTC weekday for that case only.

**The sweep** — `todayIsoWeekday` and `todayDateStr` move inside the per-assignment loop, derived from that assignment's branch timezone. They are currently hoisted, which is itself part of the bug: one weekday cannot be correct for branches in different zones.

**Alignment validation** (`:971`, `:982`) and **`formatHHMM`** — take the pool's branch timezone so both the check and the message it produces speak the branch's clock.

**Booking horizon** (`:1881`) — the N-day cutoff computed in branch-local terms.

**`memberBookingIdempotencyKey`** (`:669`) embeds `todayDateString`, and `Booking.idempotencyKey` is persisted and unique. Under `UTC` the key is unchanged; under a real timezone it would differ for the same logical session. This is safe because `ensureTodayMemberBooking` checks for an existing booking by `(userId, windowId, status ≠ CANCELLED)` **inside the transaction before the key is used** (`index.ts:759-765`) — the key is a second line of defence, not the only one. Called out because it is exactly the kind of thing that looks fine until Stage 2 flips a timezone.

### Test fixtures — F-073

`regression/_fixtures.ts:48` and `f023-full-system.spec.ts:23-41` derive the window from a relative offset while deriving the weekday from local `getDay()`. Both are changed to derive **both values from one instant through one convention**, so a run crossing local midnight cannot land them on different calendar days.

---

## Files

**New:** `services/slot-engine/src/branchTime.ts`

**Modified:** `services/slot-engine/src/index.ts` (helpers at `:49-90`, `:662-670`; `resolveTodayMemberAssignment` `:683`; alignment validation `:971`, `:982`; horizon `:1881`; sweep `:2665+`) · `services/slot-engine/src/regression/_fixtures.ts` · `apps/guest-member-pwa/tests/f023-full-system.spec.ts` · a new regression section for the injected-clock cases

**Explicitly untouched:** `services/slot-engine/src/availabilityGeneration.ts` (Stage 2) · `packages/database/prisma/schema.prisma` (no migration in Stage 1)

---

## Verification

Per rule 8 — observed evidence, not argument.

**1. The problematic window, with a real clock inside it.** `resolveTodayMemberAssignment` already takes `now: Date` as a parameter, so a regression section calls **the real production function against the real database with a real seeded assignment**, passing instants inside 00:00–05:30 IST. Deterministic, and genuinely the shipping code path rather than a reimplementation. Cases: an instant where the IST date and the UTC date differ, and one where the IST weekday and UTC weekday differ. **Red first** — these must fail against current `main` before the fix, and the failure output is recorded.

**2. Both clocks, whole suite.** Full `pnpm test:regression` under `TZ=UTC` and again under `TZ=Asia/Kolkata`. Post-fix both must pass. Pre-fix, the `TZ=Asia/Kolkata` run is expected to reproduce F-073's `WINDOW_NOT_FOUND`, which is the point.

**3. The production no-op, demonstrated not asserted.** With `TZ=UTC` and branch timezone `UTC`, capture the `/member/today-assignment` response and the sweep's counts before and after the change and show them identical. This is the load-bearing claim of Stage 1 and it gets direct evidence.

**4. Alignment skew, before and after.** The 60-minute boundary check under `TZ=Asia/Kolkata` accepts a different set of times than under UTC today; after the fix it is branch-derived and stable across both. Shown with real requests returning real status codes.

**5. Data audit — production, not local.** The local database is empty of assignments, windows and patterns, so it cannot answer the backward-compatibility question. The exact query to run against production is included in the plan document; **its real output is required before Stage 2**, and Stage 1 does not depend on it.

**6. Whole-repo `typecheck` and `pnpm -r run build` clean.**

**Not verified, stated plainly:** Stage 1 changes no production behaviour, so there is nothing for a production deploy to prove beyond absence of regression. The real proof of the timezone mechanism arrives in Stage 2, when a branch is actually flipped.

---

## Out of scope

- **Stage 2** — admin timezone input, dry-run migration report, the branch flip, `availabilityGeneration.ts`. Gets its own register ID; F-066 stays open until it lands.
- **F-065** — the 90-minute displayed-vs-enforced deadline gap. Independent, and still a separate blocker on F-044 Phase B.
- **F-073's `f023` chain re-verification** — unblocked by this, but its own task.
