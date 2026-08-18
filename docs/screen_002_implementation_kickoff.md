# SCREEN-002 — Branch Court Onboarding Wizard

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Implements the frozen spec `docs/screen_002_branch_court_onboarding_wizard.md` (v4, frozen before
> build). The design is **not** re-derived here; this plan says how to build what that document
> already froze, and flags the one place reality differs from its assumptions.

## Context

An admin cannot stand up a bookable branch through any UI today (**F-098**). Onboarding runs through
`scripts/provision-tenant.mjs` with the internal service key. SCREEN-002 closes that: pool →
resources → booking rule → availability pattern, in one sitting, matching JBC's real shape.

The spec is frozen at v4. Deviations below are forced by the code, not by preference, and each is
named.

---

## Deviation from the spec's assumptions — F-065's gate is open, and its register entry is stale

The spec gates Step 4's copy: *"must not ship its confirmation-window copy until F-065 is resolved."*

**The gate is open. Verified against the code, which is the authority — not against either document,
because the two disagree.**

- `967716a` ("Fix F-065: one deadline for the member, its own trigger for the admin") **is an
  ancestor of HEAD**, confirmed with `git merge-base --is-ancestor`.
- The sweep now releases on `gracePeriodMinutes`: `index.ts:2971` is commented *"2. MEMBER RELEASE —
  gracePeriodMinutes"*, and `:2983` reads `rule?.gracePeriodMinutes ?? 30`.
- `guestAccessCutoffMinutes` is explicitly reduced to staff-alert timing: `:3013-3014` — *"3.
  LOW-OCCUPANCY ALERT — guestAccessCutoffMinutes, unchanged. F-065: this is why
  guestAccessCutoffMinutes is NOT vestigial."*
- A now-unreachable release branch was removed (`:2895`).

That is exactly the post-F-065 behaviour the frozen copy was written for. **Step 4 ships its real
copy — no further gating.**

**But F-065 is still in the register's Open section**, with a next-step still describing itself as a
hard blocker on F-044 Phase B. The fix landed 14 Aug; the entry was never moved. That stale entry is
what the handover read when it asked me to confirm.

**Reporting, not assigning:** this is register drift of the class the register opens with — a
Resolved-in-reality finding left Open. It also means **F-044 Phase B's recorded blocker is stale**,
which matters well beyond this screen. Worth an ID and a sweep for others like it.

---

## The work, in five parts

### Part A — server-side pool validation (the larger half, per the spec)

`POST /resource-pools` (`slot-engine/src/index.ts:921`) validates **only** `branchId`, `tenantId`,
authorization and branch-belongs-to-tenant, then goes straight to `create` with `Number()` coercion.
`PATCH` (`:1000+`) enforces the real rules. So the wizard could create a pool the edit screen refuses
to save.

Extract a shared validator and use it from **both**, mirroring **F-068's exact precedent** —
`validateBookingRuleFields(body, reply)` at `:1684`, which already did this for booking rules.

Rules to enforce, taken verbatim from `PATCH` so the two cannot diverge:

| Field | Rule |
|---|---|
| `name` | non-empty after trim |
| `capacity`, `minOccupancy` | positive integers, `capacity >= minOccupancy` |
| `minBookingDurationMinutes` | positive integer **and `1440 % duration === 0`** |
| `pricingMode` | valid `PricingMode` enum |
| `defaultRate` | numeric, `>= 0` |

`PATCH` must keep its partial-update semantics (only validate supplied fields, defaulting from the
existing row); `POST` validates the full set with the spec's defaults.

### Part B — court-name uniqueness migration

`Resource` has no unique constraint (`schema.prisma:151-161`), confirmed. Add
`@@unique([resourcePoolId, name])` via a migration following **F-067's self-defending `DO $$`
pattern** — aggregate offending rows, `RAISE EXCEPTION` naming them, then create the index. The same
shape used for F-115.

**Data is clean right now** — zero duplicate `(resourcePoolId, name)` pairs in *both*
`badminton_db` and `badminton_db_test`, checked live. The guard is what makes it safe whenever it
actually ships, not a formality.

Note this index needs **no** `NULLS NOT DISTINCT`: both columns are `NOT NULL`, unlike F-115's
nullable `branchId`.

### Part C — the wizard

New component in `apps/admin-web/src/main.tsx`, new route, launched from `ResourcesPage`. Five steps
per the frozen copy: Court Type → Pool Details → Courts → Booking Rules → Scheduling.

Reuse only what exists — `MutationFeedback`, `primary-btn`/`secondary-btn` with spinning `RefreshCw`,
`form-grid compact`, `<label>`-wrapped inputs, `useAdminApi()`. **No new visual language.**

Client schema gaps to close, both real:
- `poolSchema` (`:166`) has `minBookingDurationMinutes: positive()` but **no 1440-divisibility check**
  — add it, matching the server.
- `patternSchema` (`:185`) has the same gap on `slotDurationMinutes`; the spec calls this out
  explicitly as a client-side gap to close.
- `ruleSchema` (`:175`) covers only two fields; Step 4 needs the full booking-rule set, so it is
  extended rather than replaced.

Step 2 hides `capacity` under `FIXED_INSTANCE` (generation forces one window per resource). Step 1's
allocation-mode choice is a one-way door and its copy must say so.

### Part D — Step 4 idempotency

`POST /booking-rules` returns **409** on a second call (F-067's unique index). Before submitting,
read the pool's existing rule; if present, transparently `PUT /resource-pools/:id/booking-rule`
(**confirmed to exist**, `:1796`) instead. Without this, any failure at step 5 permanently bricks
re-entry at step 4.

### Part E — `ResourcesPage` empty state

When the pool `<select>` has zero pools, it becomes "Create your first court pool" launching the
wizard — closing **F-031's Resources half** as a byproduct, per the spec.

---

## Verification

Rule 8 throughout. Docker confirmed stable before starting (currently up 18 min; it needed a manual
restart earlier tonight and its WSL backend did not come up on the first attempt, so **re-confirm
immediately before live-fire**, not just before implementation).

- **Every field validation rule proven individually** against `badminton_db_test`: for each rule in
  Part A's table, a real `POST` that violates it returning 400, and the valid case succeeding —
  contrasted against the same payload through `PATCH` to prove the two now agree.
- **The migration guard proven against real dirty data**: inject a duplicate `(resourcePoolId, name)`,
  run the migration, confirm it **aborts naming the offending row** and leaves the index uncreated;
  then reconcile, re-apply, and confirm `indisunique`. Same as F-067/F-115.
- **Idempotency retry proven live**: submit Step 4 twice against one pool; the second must succeed via
  `PUT` rather than surfacing a 409, with a database read-back showing **exactly one** rule row.
- **Full real-browser walkthrough of all five steps** against a real pool, creation through to
  `SchedulingPage`'s live availability preview showing **real generated slots**.
- Full regression across all five suites; whole-repo typecheck and build; **rebuild before testing**
  (F-085). Note F-142's date-expired `Browse-ahead limit` failure is pre-existing and will still be
  red — it must not be misread as caused by this work.

## Out of scope

Per-field error display (spec: a deliberate consistency choice, not an oversight).
`cancellationPolicyJson` editing (server validates nothing; free-text editing would corrupt refunds).
F-031's Low Occupancy and Negotiated halves. F-142's test fix. Moving F-065's register entry — that is
the reviewer's call, reported above.
