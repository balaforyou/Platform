# F-047 (fix) and Group G / F-088 (investigation only)

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> F-047 is a plan to implement. Group G is investigation findings only, per the kickoff.

## Context

Guest-flow findings were grouped so each group is one test pass. F-047 was pulled ahead of everything
because it is what makes the e2e runner trustworthy for every group after it. Group G was to be
investigated, not built.

Both investigations changed the picture materially, so the corrections come before the plan.

---

# Part 1 — F-047: `test:e2e` does not load `.env`

## Confirmed against real code

- `apps/guest-member-pwa/package.json:11` is `"test:e2e": "playwright test"` — no `.env` loading.
  The register text is accurate.
- The project convention is `dotenv -e ../../.env -- <cmd>`, used by all five services'
  `test:regression` scripts.

## Two things the register does not say, both of which change the fix

**1. `dotenv-cli` is not available to this package.** It resolves in the services because each has it
as a devDependency; `apps/guest-member-pwa/node_modules/.bin` has no `dotenv`. Applying the convention
literally produces `'dotenv' is not recognized` — the same class of failure as running `npx tsx` from
the repo root.

**2. The bigger one: `.env`'s `DATABASE_URL` points at `badminton_db` — the demo database holding JBC.**
Five Playwright specs open a `PrismaClient` (`f023-full-system`, `f041-verification`, `f043-phase-c`,
`member-self-confirm`, `seed-test-data`), and **none of them call `assertDisposableDatabase`** — the
F-101 guard is imported only by the five services' `_fixtures.ts`. So the literal fix converts
`pnpm test:e2e` from *"fails loudly on a missing DATABASE_URL"* into *"runs silently against the live
demo database, unguarded"*. That is worse than the bug.

Mitigating, and worth stating precisely: no Playwright spec issues an unscoped `deleteMany()` — every
delete is scoped, and `f023` carries a comment explaining that it deliberately avoids the F-101 hazard.
So the blast radius is seeded rows and scoped deletes, not a full wipe. That is still real: writing
test rows into demo data already happened once, via a port collision, earlier in this project.

## The fix

Three parts, because part 1 alone is unsafe:

1. **Load `.env`, per convention** — `"test:e2e": "dotenv -e ../../.env -- playwright test"`, and add
   `dotenv-cli` to `apps/guest-member-pwa`'s devDependencies so the binary actually resolves.
2. **Default the runner to a disposable database.** The e2e specs seed and delete; they must not
   default to `badminton_db` just because `.env` does. Override `DATABASE_URL` to the
   `badminton_db_test` form after loading `.env`, matching the documented regression command in
   `CLAUDE.md` — so `.env` supplies credentials and host while the target stays disposable.
3. **Wire the F-101 guard into the specs**, reusing `assertDisposableDatabase` from
   `@badminton/test-harness` exactly as the services do. This is the part that makes 1 and 2 safe by
   construction rather than by everyone remembering.

## Verification

- **Red/green, on by default.** With `DATABASE_URL` pointed at `badminton_db`, the guard must refuse
  and the run must abort — captured as real output. Restore, and the suite runs.
- `pnpm test:e2e` from a clean shell with no exported `DATABASE_URL`: currently fails; after the fix it
  runs and targets `badminton_db_test`, confirmed by reading the resolved value, not by assuming it.
- Re-run `f023-full-system.spec.ts` through the fixed script and confirm it still passes (it passed
  today under a manually-exported environment: `1 passed (12.8s)`).
- Database read-back: zero new rows in `badminton_db` after a full e2e run.
- Full regression, `register:check`, `diagram:verify`.

---

# Part 2 — Group G: investigation findings, no implementation

## The group was wrong in two ways, and both matter

**F-088 is missing, and it is the actual work.** F-088 is *"F-066 Stage 2 — the half that actually
solves the platform's timezone problem"*, still Open and marked **not started**, with five required
parts. F-100's own entry names F-087 **and F-088** as prerequisites. So the real shape is:

| ID | Role |
|---|---|
| **F-088** | The umbrella. Five parts: make `Branch.timezone` settable; a per-branch dry-run migration report; the flip itself; `availabilityGeneration.ts`; and F-087 |
| F-087 | Part (5). Must land before any flip |
| F-100 | The application of part (3) to JBC's two branches |

**F-162 is not a timezone finding.** It is F-155's started-slot filter reaching admins through an
unauthenticated endpoint — a sibling of F-164. Moved to Group E. Confirmed: `apps/admin-web`'s
availability query calls the same `/slot-engine/resource-pools/:id/availability?date=` route the guest
uses, so admins inherit the guest filter. Its own entry says the smaller fix is an opt-in query
parameter rather than authenticating the endpoint.

## Confirmed current state

| Finding | Verified |
|---|---|
| F-100 | Live. All five branches carry `timezone = UTC`, including both JBC branches |
| F-087 | Live. `slot-engine/src/index.ts:1113` resolves `poolTimeZone = await getBranchTimeZone(...)` and then parses `new Date(startTime)` on the *server* clock — two clocks, exactly as described |
| F-088 part (1) | Live. `timezone` appears **nowhere** in `apps/admin-web/src` — the column is unreachable from the product |
| F-162 | Live, and the admin caller is confirmed |

## Is F-087 a symptom of F-100, or independent?

**Neither — the dependency runs the other way.** F-100 is a *deliberate workaround for* F-087: both JBC
branches were set to `UTC` specifically to keep server, branch and input clocks agreeing by coincidence,
because F-087 would otherwise corrupt real customer data. F-087 is an independent bug that persists
regardless of F-100, and it is the blocker that has to clear before F-100 can be undone.

## What actually changes on a flip to `Asia/Kolkata`

**Not displayed clock times.** The guest PWA never reads `Branch.timezone` — it formats with
`toLocaleTimeString()` in the *viewer's* browser timezone. An existing window renders identically to an
Indian guest before and after. My original grouping claimed the opposite; that was wrong.

**What does change is interpretation, server-side:**

- **Which calendar day a slot belongs to.** `branchDayBounds(date, timeZone)` maps a date to an instant
  range, so a window at 19:00 UTC is "20 Aug" under UTC but 00:30 on 21 Aug under IST — it moves
  between availability responses.
- **Recurring assignments.** A `MemberGroupAssignment` local-time string stops meaning 10:00 UTC and
  starts meaning 04:30 UTC, so existing generated windows stop matching. This is F-088's part (2)
  dry-run report, and its precondition is a **production data audit that has never been run**.
- **Generated windows.** `availabilityGeneration.ts` treats branch-local pattern times as UTC, so any
  change moves generated timestamps. F-088's part (4).

**Migration vs forward-provisioning:** stored timestamps are absolute instants and are not rewritten, so
this is not a data migration in the "rewrite the rows" sense. It is a **reinterpretation** — the rows
stay, their meaning moves. The local database has **0 assignments, 97 generated windows, 2 bookings**;
the deployed database has not been audited, and F-088 names that audit as a precondition rather than
something to infer.

## Recommendation

**Do not open Group G as a build task yet.** The next step is F-088's part (2) — the production data
audit and dry-run report — which is an investigation with real output, not an implementation. F-087 can
be scoped independently and should land first, since it is a self-contained input-validation decision
(reject naive input, or interpret it on the branch clock) and is the named blocker for everything else.

---

## Verification for the register/plan commit accompanying this

`pnpm register:check` and `pnpm diagram:verify` both green after the drift cleanup — already run.

**No commit without your sign-off.**
