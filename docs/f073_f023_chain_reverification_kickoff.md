# F-073 — re-verify the full `f023` cross-system chain

> **Status: PROPOSED — awaiting approval. Nothing changed, nothing run.**
> Two of the four "required fixes" from the original kickoff turn out to be **already done**. That is
> the point of the confirm-don't-assume instruction, and it changes the scope.

## Context

F-073's own next step tracks a verification debt: `apps/guest-member-pwa/tests/f023-full-system.spec.ts`
was pinned for the timezone defect in `967716a` but is **typecheck-verified only**, because running it
needs the full browser stack behind Caddy. The entry says plainly: *"Do not read the fix as discharging
that debt."* This pass discharges it — or reports honestly why it cannot.

---

## Current real state — every item checked against code, not the kickoff text

| # | Item | Verified state |
|---|---|---|
| 1 | **F-065 resolved** | **Yes.** `index.ts:2990` is commented *"2. MEMBER RELEASE — gracePeriodMinutes"*, and `:3002-3003` compute the release from `rule?.gracePeriodMinutes`. Release is driven by the field the member is shown. |
| 2 | **F-066 Stage 1 done, Stage 2 (F-088) not** | **Yes**, re-confirmed this morning: `Branch.timezone` has zero occurrences in admin-web, no dry-run tooling exists, every branch in both databases reports `UTC`, and `availabilityGeneration.ts` has no timezone references. |
| 3 | **Does the e2e spec need the `withinTodayUtc` fix?** | **No — it already has it.** The spec carries its **own** `withinTodayUtc` (`f023-full-system.spec.ts:53`), documented as mirroring slot-engine's, used at `:180` with a `F-073: pinned inside today's UTC date` comment. **No fix needed.** |
| 4 | **F-064's Vite binding** | **In place** — `apps/guest-member-pwa/package.json:7` is `vite --host 127.0.0.1`. Independently exercised tonight: SCREEN-002's and F-037's walkthroughs both ran through Caddy against it. |

### The two fixes that ARE still needed

**A. The stale assertion — confirmed still present, and it would fail.**
`f023-full-system.spec.ts:301` asserts, after member A confirms attendance:

```
await expect(adminPage.locator('.metric-card')).toContainText('1 of 4 confirmed');
```

That card is on `/admin/occupancy`, and `OccupancyPage` feeds it from
`/resource-pools/:id/occupancy` → `computePoolGuestOccupancy`, which filters **`isMemberBooking: false`**
(verified in source). So it counts **guest** seats only, by design (F-035/F-041). A confirmed *member*
contributes **0** to it. The assertion expects 1.

Also confirmed: `/admin/occupancy` renders **exactly one** `.metric-card` and **no member-attendance
panel at all** — that panel lives on the Overview page. So there is no ambiguity in the locator, and no
member data on that route to assert against.

**B. The fixture cleanup gap — confirmed still present, exactly as F-046 describes.**
`test.afterAll` (`:210-212`) does **only** `prisma.$disconnect()`. The extensive `deleteMany` block
(`:95-116`) lives **inside `seedF023()`**, so it clears prior residue *before* seeding and leaves every
fixture behind afterwards.

---

## The changes

### 1. Fix the stale assertion — and make it prove more than it did

Rather than simply swapping to member data, assert **both** halves, because the current line is not just
wrong, it is hiding a real invariant:

- On `/admin/occupancy`, assert the guest card reads **`0 of 4 confirmed`** — which is *correct* for that
  metric and positively proves F-035/F-041's exclusion is working, instead of asserting the opposite.
- Assert the member confirmation through the **member-attendance path**, which is what the kickoff asks
  for: `computeBranchMemberAttendance` (`slot-engine/src/index.ts:528`), exposed as
  `GET /branches/:id/member-attendance` (`:1510`), and rendered on the Overview page's Member Attendance
  panel. **Prefer the real UI** on Overview, per the edge-case rule that browser steps stay browser steps.

The spec already asserts `memberAttendanceConfirmedAt` on the real booking row (`:292`), so DB-level proof
exists; what is missing is a *UI* assertion that is actually true.

### 2. Give `afterAll` real cleanup

Extract `seedF023`'s existing delete block into a `cleanupF023()` and call it from **both**
`beforeAll` (keeping today's pre-seed behaviour) and `afterAll` (closing the leak). Reuses the exact
delete list already written and proven — nothing new invented.

**Coordinated with F-046, not overlapping it:** F-046's scope is cross-spec contamination *and* the
sweep reaching beyond its own fixtures. This fixes only the leave-behind half for this one spec, which
F-046 explicitly names. F-046 stays Open for the sweep-reach half, which this does not touch.

---

## The run

Full chain, real evidence at each step, **not stopping at the first passing assertion**:

admin assigns member → member confirms (scenario A) / does not (scenario B) → sweep runs on F-065's
corrected `gracePeriodMinutes` trigger → guest sees released capacity → guest books and pays →
cancellation → admin refund override.

Real browser where the spec specifies it; real database reads at each transition (the spec already logs
`F023_DB` / `F023_REQUEST_RESPONSE` markers, which are the evidence trail).

**Stack**: all five services + guest PWA + admin-web + Caddy on `:8080`, against **`badminton_db_test`**
— never the demo database. Docker needed a manual restart earlier today, so confirm the engine is up
immediately before the run, not just before planning.

## Verification

- Each of the four state items above re-stated with its evidence — already done, recorded here.
- The chain run end to end, with **failures reported plainly if they occur**. The value is proving the
  chain, not producing a green report: if it breaks, that is the finding.
- Full regression, whole-repo typecheck and build, rebuilt before testing (F-085).
- Register: F-073 to Resolved only if the chain genuinely passes; otherwise it stays Open with the real
  failure recorded.

## Out of scope

F-088 / F-066 Stage 2. F-046's sweep-reach half. Any product-code change — if the chain fails on product
behaviour rather than fixtures, that is a new finding to report, not to patch around.
