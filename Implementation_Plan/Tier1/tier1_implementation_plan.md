# Tier 1 — Four HIGH-severity findings, two tracks

**Status:** Approved 9 Aug 2026, not yet implemented. Committed for review before any code is written — no source, schema, or migration changes have been made.

*(The preceding F-044 Phase A plan is at `Implementation_Plan/binary-napping-whale.md`, committed as `7daf72d`.)*

---

## Context

Four HIGH-severity findings, all confirmed with live evidence, all still open. Two are unauthenticated write endpoints on a publicly-routed service (`/api/slot-engine/*` via Caddy). Same class as F-045/F-048/F-049, which is why the evidence bar is a genuine red/green demonstration rather than a described one.

**Track A — F-053**, architecturally independent: `POST /bookings/sweep` has zero auth.

**Track B — F-061 + F-067 + F-068**, one connected fix: F-061 is the open door, F-067 is what turns one request through that door into permanently ambiguous data, F-068 is what lets that request carry a value that inverts safety logic once it lands.

**Register correction required.** F-053's entry says *"7 other routes in the same file correctly use `requireInternalKey`."* The real figure is **6 call sites** — `index.ts:1893, 2068, 2120, 2680, 2738, 2827`. My original `grep -c` counted the definition line at `:100`. My error, propagated into the register; correct it as part of this work.

---

## Pre-work already completed during planning

**F-067's duplicate audit (its required step 1) is done for the local database:**

```
BookingRule rows total: 6
pools with a rule:      6
pools with DUPLICATES:  0
```

The row injected during F-061's original auth test was cleaned up at the time; nothing else drifted. **No reconciliation is needed locally, so step 2 does not trigger.** Production remains unaudited and is handled by the self-defending migration below.

---

## Track A — F-053: `POST /bookings/sweep`

### Change

`services/slot-engine/src/index.ts:2509`. The handler currently takes **no parameters at all** (`async () =>`), so the signature changes, not just the body:

```ts
server.post('/bookings/sweep', async (request, reply) => {
  requireInternalKey(request, reply);
```

`requireInternalKey` (`index.ts:100`) is **synchronous** — no `await`, matching all 6 existing call sites.

**Tradeoff, stated:** `requireInternalKey` accepts only the internal service key and rejects admin JWTs outright. No admin-web UI triggers a sweep today (verified — zero references), so there is no UI blast radius. If an ops-facing "run sweep now" button is ever wanted, it will need `getInternalOrAdminAuth` instead. Choosing the tighter guard now is deliberate.

### Callers that break — all five currently send no `Authorization` header

| File | Line | Fix |
|---|---|---|
| `services/slot-engine/src/regression/low-occupancy-release.regression.ts` | 30, 110 | add `headers: { Authorization: \`Bearer ${internalKey}\` }` |
| `services/slot-engine/src/regression/guest-booking.regression.ts` | 271 | same |
| `apps/guest-member-pwa/tests/f023-full-system.spec.ts` | 251, 282 | add `extraHTTPHeaders` to the request context at line 190 |

`internalKey` is already exported from `services/slot-engine/src/regression/_fixtures.ts:6`. For the Playwright spec the header goes on the **Node-side** `playwrightRequest.newContext(...)` — it must not go anywhere near the PWA's browser-side `apiRequest` helper, which would put a service key in browser code.

Note the f023 spec is **already failing** at its occupancy assertion (F-063). Fixing its sweep calls does not make it pass; it prevents a second, unrelated failure from masking F-063 when that is addressed.

---

## Track B — `POST /booking-rules` chain

### F-061 — the missing auth

`index.ts:1394`. Add the `reply` param and the established three-line pattern from the sibling endpoint four lines away (`index.ts:1434-1436`):

```ts
server.post('/booking-rules', async (request, reply) => {
  const { resourcePoolId, ... } = request.body as any;
  const auth = await getInternalOrAdminAuth(request, reply);
  await requirePoolScope(auth, resourcePoolId, reply);
```

**Confirmed this is the right pattern to reuse, not an invented check.** The sibling `PUT /resource-pools/:id/booking-rule` uses exactly this and is the endpoint that already correctly returns 401. `getInternalOrAdminAuth` accepts either the internal key or an `owner`/`branch_manager:*` JWT; `requirePoolScope` re-reads `pool.branchId` **from the database**, never trusting the client — which matters here because `resourcePoolId` arrives in the **body**, not the URL.

Side benefit: `requirePoolScope` 404s on a non-existent pool, replacing today's raw Prisma FK error surfacing as a 500.

**Callers that break:** `services/slot-engine/src/regression/_fixtures.ts:101` and `services/payment/src/regression/_fixtures.ts:115`. Both already export `internalKey`; one-line header addition each. **Zero UI blast radius** — admin-web only ever calls the PUT (`apps/admin-web/src/main.tsx:762-769`), verified.

### F-067 — real uniqueness

**Schema** (`packages/database/prisma/schema.prisma`, `BookingRule`): add `@@unique([resourcePoolId])`.

**Migration — self-defending, per your decision.** No precedent exists in this repo for a guard migration, so this introduces the pattern deliberately (raw SQL in migrations *is* established — see the partial unique index at `20260730071606_phase9_backend_batch/migration.sql:63`):

```sql
DO $$
DECLARE dupes text;
BEGIN
  SELECT string_agg(DISTINCT "resourcePoolId", ', ')
    INTO dupes
    FROM "BookingRule"
   GROUP BY "resourcePoolId" HAVING count(*) > 1;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add unique constraint: duplicate BookingRule rows exist for resourcePoolId(s): %. Reconcile before migrating (see F-067).', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "BookingRule_resourcePoolId_key" ON "BookingRule"("resourcePoolId");
```

The `RAISE EXCEPTION` aborts the transaction before the index is attempted, so the migration either applies cleanly or does not apply at all — never half. The error names the offending pools, so the data decision comes back to you with the specific rows in hand.

**Fixes the PUT's TOCTOU as a consequence.** `index.ts:1499-1500` currently upserts on `where: { id: existing?.id ?? '__missing__' }` after a separate `findFirst` — two concurrent PUTs on a rule-less pool both take the create branch. With `resourcePoolId` unique, the upsert keys on it directly and the sentinel disappears:

```ts
return await prisma.bookingRule.upsert({
  where: { resourcePoolId: id },
  update: data,
  create: { ... },
});
```

**Ordering — defense in depth, as instructed.** The five `bookingRules[0]` reads (`552, 675, 1552, 2535, 2594`) are fed by relation `include`s, so the `orderBy` belongs on the include:

```ts
include: { bookingRules: { orderBy: { createdAt: 'asc' } } }
```

applied at `469, 647, 1545, 2529, 2555`. Prisma 5.14 supports nested `orderBy` in `include`. The four direct `findFirst({ where: { resourcePoolId } })` sites — `1439, 1763, 2165, 2875` — take `orderBy: { createdAt: 'asc' }` directly. **Nine sites total**, which is what covering "all five read sites" actually requires.

### F-068 — the coercion bug, and the floor

**Two separate things, kept separate.**

**(a) The real bug.** `index.ts:1411-1415` uses truthiness — `gracePeriodMinutes ? Number(x) : 30` — so an explicit `0` is falsy and silently becomes `30`. Fix precisely by distinguishing *not provided* from *explicitly zero*: `x !== undefined && x !== null`. This applies to all five numeric fields, not just `gracePeriodMinutes`.

**(b) The floor — your decision: allow `0`, reject negatives.** `0` is coherent policy ("confirm right up to slot start") and PUT already accepts it, so both setters land on current PUT behaviour rather than one regressing. Negatives are the real hazard: they place the cutoff *after* the window starts and invert every `now >= cutoffTime` comparison. F-044's reminder job already self-protects against narrow windows via `SKIPPED_WINDOW_TOO_NARROW`, so no global floor is needed to protect the scheduler.

**(c) Aligned validation.** Extract one shared validator used by both setters. Identical **accepted value sets and error codes** per field; *absence* handling legitimately still differs (POST creates → default; PUT partial-updates → leave unchanged).

| Field | Rule (both setters) | Absent on create |
|---|---|---|
| `memberWindowDays`, `guestOpenWindowDays`, `gracePeriodMinutes`, `guestAccessCutoffMinutes` | integer `>= 0`; reject negatives, floats, `NaN` → 400 `INVALID_RULE_VALUE` | schema defaults (30 / 7 / 30 / 120) |
| `lowOccupancyThresholdPct` | integer `0-100` → 400 `INVALID_THRESHOLD` | **50** |
| `prepaymentRequired` | must be a real boolean if present → 400 `INVALID_RULE_VALUE` | `true` |
| `cancellationPolicyJson` | pass through if present | shared default constant |

**One deliberate behaviour change, flagged.** PUT currently rejects a create with 400 `THRESHOLD_REQUIRED` when `lowOccupancyThresholdPct` is absent (`index.ts:1491`); POST defaults it to 50. Aligning *upward* (requiring it on both) **would break both regression suites** — verified: neither `slot-engine/_fixtures.ts:101` nor `payment/_fixtures.ts:115` sends that field. So alignment goes the other way: both default to 50, and `THRESHOLD_REQUIRED` is removed from PUT. Admin-web always sends the field (its UI has the input), so relaxing PUT breaks no real flow.

Also fold in: the duplicated tiered-policy literal at `1417-1424` and `1482-1489` becomes one shared constant.

---

## Edge cases — against the standing categories

| Category | Assessment |
|---|---|
| **Trust boundary** | The point of the whole change. Needs real rejected-request evidence on both endpoints, not "the check exists." `requirePoolScope` reads `branchId` from the DB, so a client cannot spoof branch authority via the body-supplied `resourcePoolId`. |
| **Data integrity** | F-067's audit is done locally (0 duplicates) and the migration guards production rather than assuming. |
| **Backward compatibility** | Seven call sites break and are fixed. Admin-web is unaffected (uses PUT only) — but must still be confirmed in a real browser, not by reading. The `THRESHOLD_REQUIRED` removal is the one intentional behaviour change. |
| **Concurrency** | The unique constraint converts the PUT's TOCTOU double-create into a constraint violation; the upsert-on-`resourcePoolId` is what makes that path correct rather than a 500. |
| **Real browser vs script** | Admin-web's Resources screen calls the PUT whose validation changes — needs a real rendered check, per rule 8. |
| **Production build vs dev runtime** | Full `pnpm -r run build` + `pnpm run typecheck`. |

---

## Files

**Modified:** `services/slot-engine/src/index.ts` (auth on both endpoints, shared validator, 9 ordering sites, upsert key) · `packages/database/prisma/schema.prisma` · new migration under `packages/database/prisma/migrations/` · `services/slot-engine/src/regression/{_fixtures,low-occupancy-release,guest-booking}.regression.ts` · `services/payment/src/regression/_fixtures.ts` · `apps/guest-member-pwa/tests/f023-full-system.spec.ts` · `docs/findings_register.md` (the 7→6 correction)

**New:** a regression section covering the auth rejections and validation alignment.

---

## Verification — A–G format, red/green mandatory

Per rule 9 Section F, every claim that a mechanism *prevents* something gets a genuine break-it demonstration.

**1. Auth rejection, both endpoints.** Real unauthenticated requests shown rejected, and the authenticated equivalents shown working — the F-045 standard:
- `POST /bookings/sweep` with no header → **401**; with `Bearer ${internalKey}` → **200**
- `POST /booking-rules` with no header → **401**; with a valid admin JWT → **200/201**
- A `branch_manager` JWT scoped to a *different* branch → **403**, proving `requirePoolScope` actually scopes rather than merely authenticating

**2. Uniqueness constraint — red/green.** Attempt to create a second `BookingRule` for a pool that already has one, directly against the real constraint; show a genuine Postgres **`23505`**. Then drop the index, show the same attempt succeed (proving the constraint is what prevents it, not application logic), restore it, show it fail again. Confirm restoration via `pg_indexes` before declaring green — this is a shared dev database.

**3. Migration guard — red/green.** Deliberately insert a duplicate row, run the migration, show it **abort with the named `resourcePoolId`** and leave the index absent; remove the duplicate, re-run, show it apply cleanly. This is the only proof the guard is load-bearing rather than decorative.

**4. The `0` coercion fix.** Send `gracePeriodMinutes: 0` to **both** setters; read back from the database and show `0` stored, not `30`. Send `-15` to both; show **400** from both with the same error code. This is also the alignment proof.

**5. Regression + build.** Full `pnpm test:regression` passing with the seven updated call sites, `pnpm -r run build`, `pnpm run typecheck`.

**6. Real browser.** Admin-web Resources screen: load a pool's booking rule, edit and save through the rendered UI, screenshot the result, confirm the PUT still works with the new shared validator and the removed `THRESHOLD_REQUIRED`.

**Explicitly not verified:** production duplicate state (unaudited by design — the migration guard is the control). The f023 spec still fails at its occupancy assertion (F-063), unchanged by this work.

---

## Out of scope

- **F-063** — the f023 assertion drift. Its sweep calls get auth headers; the assertion itself is untouched.
- **The three dual-path routes** (`index.ts:2120, 2738, 2827`) whose fallback role check tests `roles.includes('branch_manager')` against a claim format that is actually `branch_manager:<branchId>` — so those checks never match a real branch manager and do no branch scoping. **Found during this investigation; report as a new finding for ID assignment, do not fix here.**
- `requireInternalOrAdmin` (`index.ts:163`) is dead code with zero call sites. Same — report, don't fix.
