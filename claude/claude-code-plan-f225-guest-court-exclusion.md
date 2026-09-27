# F-225 — Authorized Guest Courts: real court-exclusion enforcement

**Backfill, not a correction — written 2026-09-25.** This finding shipped in PR #16 to
`main` (title: "F-220 v2 — Guest Management §3.1–§3.2 + F-224 (guest pricing) + F-225 (guest
court enforcement)", merged 2026-09-04, commits `0e1ab42` backend / `2396570` frontend), and
has been live in production since. No `claude/claude-code-plan-f225-*.md` file existed at the
time — root `CLAUDE.md`'s requirement that a real design decision get a plan doc alongside its
fix was not followed for this finding. This document reconstructs that record after the fact
from three sources: the real saved plan-mode file (`hashed-drifting-pancake.md`, heading
"F-225 — Authorized Guest Courts: real court-exclusion enforcement"), the F-225 row in
`docs/findings_register.md` (Resolved section), and PR #16's own body, cross-checked against
each other. No code, register, or batch-log change accompanies this doc.

**Status: already implemented, merged, and deployed. This is a documentation-only backfill.**

## Context / what was found

F-220 §3.1 had already shipped the "Authorized Guest Courts" screen
(`apps/admin-v2/src/screens/guestManagement/sections/AuthorizedCourts.tsx`) as a per-court
tile grid of toggles — but it was UI-only: `useState<Record<string, boolean>>({})`, no
mutation, an inert save bar, every court defaulting to visually "off." Nothing on the backend
gave the toggle meaning. `Resource` (the Prisma model for an individual court) had no
eligibility column at all, and `assignPooledCourt` — the single function in
`services/slot-engine/src/index.ts` that decides which real `Resource` a `POOLED` booking
lands on — had no concept of a court being reserved away from guests.

Bala confirmed (4 Sep 2026) this was a real business need, not just cosmetic: some courts are
reserved for members or coaching and must never be offered to a walk-in guest booking. Chief
assigned F-225 to build the real enforcement path underneath the existing §3.1 UI.

## The real alternative(s) considered and rejected

### Schema default: opt-in (`false`) for new courts, not opt-out

The plan is explicit that Bala directed opt-in for **anything new** — a newly onboarded court
must be explicitly authorized before guests can book it, not authorized by default. The naive
single-step version of this — `ADD COLUMN "guestBookable" BOOLEAN NOT NULL DEFAULT false` —
was rejected outright: applied against existing data, it would flip every one of JBC's live
courts to `guestBookable = false` in one step, walking F-205's already-working real-court
guest assignment back to "no court is guest-bookable" branch-wide until an owner manually
re-checked every single court. That is a real regression of a live feature, not a cosmetic
gap, and the plan calls this out as a TL catch on 4 Sep.

**Rejected alternative:** a single `DEFAULT false` migration, applied uniformly.
**Chosen instead:** a two-step migration —
```sql
ALTER TABLE "Resource" ADD COLUMN "guestBookable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Resource" ALTER COLUMN "guestBookable" SET DEFAULT false;
```
Step 1 backfills every existing row to `true` (preserving current live behavior exactly).
Step 2 only changes the column's default for rows inserted afterward, so a court created going
forward is opt-in as directed, without touching a single existing row. The register's
Resolution line confirms this was verified for real against `badminton_db`: "all 18 existing
`Resource` rows → `true`, column default `false`."

### Enforcement point: inside `assignPooledCourt`'s existing predicate, not by pre-filtering the resource list

The plan's own "Verified against real code" table flags a specific trap: `assignPooledCourt`
gates real-court assignment on `ordered.length === pool.capacity` (`services/slot-engine/src/index.ts:122`
at the time), and derives `courtSlotIndex` from a court's **position** in the full,
`createdAt`-ordered resource list (`courtSlotIndex = free + 1`, forced to agree with the
court's real "Court N" label).

**Rejected alternative:** filter the resource array down to guest-eligible courts before
calling `assignPooledCourt` (i.e., enforce exclusion by narrowing what the function sees,
read-time filtering upstream of the assignment logic). This was rejected because it breaks two
things at once: the `length === capacity` gate would see a shorter, filtered list and never
equal the pool's real capacity, killing real-court assignment for the *whole pool* (not just
the excluded court) and falling every guest booking back to the pre-F-205 cosmetic-index path;
and even if that gate were separately patched, a guest could be told "Court 2" while actually
holding the resource that is really "Court 3," because position in a filtered list no longer
matches real position.

**Chosen instead:** leave the full ordered list and the capacity gate untouched; add the
guest-eligibility check **inside** the existing `findIndex` predicate that already decides
which specific resource is free:
```ts
const free = ordered.findIndex(
  (r) => !taken.has(r.id) && (opts?.guestOnly ? r.guestBookable : true),
);
```
This is a write-time/assignment-time filter at the one place a real resource is actually
picked, not a read-time filter of what the function is allowed to see — so `ordered.length`
still equals `pool.capacity`, and `free + 1` still reflects the court's true position. An
optional `opts?: { guestOnly?: boolean }` third argument keeps the negotiated
(admin-acting-for-a-member) call site byte-identical by simply not passing it — mirrored
explicitly on the same pattern F-224's `resolvePrice` had already used to keep its own member
call site untouched.

### Route scope and gating: per-pool, owner-only, entitlement-gated

The plan considered branch-level vs. pool-level granularity for the write route and chose
per-pool (`PATCH /resource-pools/:id/guest-court-eligibility`) to match `requirePoolScope`'s
existing granularity and the fact that `Resource` writes already live in slot-engine
(`POST /resource-pools/:id/resources`). It also chose to gate the route **owner-only** (a new
`requireOwnerOrInternal` helper) rather than reusing the existing route's looser
`getInternalOrAdminAuth` + `requireModuleEntitlement` + `requirePoolScope` chain (which allows
any admin, not just an owner) — because this is a "deliberate, money-adjacent config write,"
per Chief's sign-off condition, and F-223 was flagged in the same plan as exactly the class of
gap (a slot-engine route missing an owner check) this was written to avoid repeating.

## Blast-radius check (rule 3a)

Per the plan file's own accounting, verified before implementation:

- **`assignPooledCourt`** — exactly two call sites in `services/slot-engine/src/index.ts`:
  guest self-service `POST /bookings` (gets the new `{ guestOnly: true }`) and admin
  `POST /bookings/negotiated` (stays unfiltered, deliberately — an admin negotiating on behalf
  of a member must still be able to reach a reserved court). Member auto-booking
  (`ensureTodayMemberBooking`) hardcodes `resourceId: null` and never calls the function at
  all — unaffected.
- **`Resource` schema** — one additive column. Every consumer that reads `resources` without
  an explicit `select` (`requirePoolScope`, `GET /branches/:id/resource-pools`, the
  booking-transaction fetch) just gains the field; the `POST /resources` create path is
  unaffected because the new column has a schema default. No existing query filters or orders
  on it.
- **New route and new `requireOwnerOrInternal` helper** — additive; at the time of the F-225
  plan, reused nowhere else. (Later findings F-230, F-237, and the still-open F-227 register
  row all reference this exact helper/route as the established owner-gating precedent for
  sibling guest-management routes — outside this backfill's scope, noted only for context.)
- **Frontend** — only `AuthorizedCourts.tsx`'s save/seed logic and one new hook/type field;
  the tile grid and its CSS, and every other Setup Rules section (`PricingRates`, etc.), are
  untouched.
- **Existing F-205 guest-path regression sections** were flagged up front as the one place
  genuinely affected beyond the new feature itself — their pools/courts are created *during*
  the regression run, after the migration takes effect, so they land on the new `DEFAULT false`
  and needed to explicitly authorize their own test courts. This is a real, anticipated
  consequence of the opt-in default, not test flakiness.

## What was actually built (per register Resolution + PR #16 body)

- `Resource.guestBookable Boolean @default(false)` via migration `20260904150000` (two-step,
  as above).
- `assignPooledCourt(pool, activeBookings, opts?: { guestOnly?: boolean })` — guest-only skip
  applied inside the existing `findIndex`, capacity gate and `courtSlotIndex` numbering
  unchanged.
- Guest self-service `POST /bookings` passes `{ guestOnly: true }`; negotiated path and member
  auto-booking unchanged.
- New `PATCH /resource-pools/:id/guest-court-eligibility` in slot-engine: owner-only via new
  `requireOwnerOrInternal`, `GUEST_BOOKING`-entitlement-gated, whole-pool replace from
  `{ authorizedResourceIds }`, 400 `INVALID_RESOURCE` for an id outside the pool.
- `AuthorizedCourts.tsx`: seeds `selected` from real `guestBookable`, single batched Save (no
  per-toggle auto-save, no confirm dialog), `Banner` success/error feedback, owner-gated
  (non-owner sees read-only tiles + an info banner), `LoadingState` swapped for a `Spinner`.

## Honesty check — plan vs. what shipped

The plan and the register/PR agree closely; no material contradiction found. Two small notes
worth flagging rather than smoothing over:

- The plan's own regression section proposed a specific numeric scenario (3-court pool,
  courts 1 and 3 authorized, court 2 excluded). The register's live-fire evidence describes a
  different but consistent scenario actually run against real JBC data (4-court pool, Court 3
  excluded, four guest bookings landing on Courts 1, 2, 4 with `courtSlotIndex` 4 — not
  compacted to 3 — then a `resourceId:null` fallback). Both demonstrate the same real
  guarantee (skip the excluded court, keep true position numbering); the specific pool size
  and court numbers differ between planned-test and actually-run-live-fire, which is expected
  and not a discrepancy in the underlying design.
- The plan describes the write route and owner-gating helper prospectively; this backfill
  cannot independently confirm every later reference (F-230, F-237, F-227) beyond what those
  register rows themselves say, since verifying those is outside this backfill's scope — noted
  above only as context found while cross-checking, not verified in depth here.
- PR #16's body is a combined PR covering F-220 §3.1–§3.2, F-224, and F-225 together; F-225's
  own contribution is clearly separable within it (its own table row and its own commit,
  `0e1ab42`/`2396570`), so this backfill did not need to guess at undifferentiated content.

## Verification (as actually run, per register + PR #16)

- slot-engine regression 74/74 (+4 new F-225 sections: guest skip of an unauthorized court
  with `courtSlotIndex` staying synced to true position; negotiated still reaching the reserved
  court; no-authorized-court-free falling back to `resourceId:null` with no rejection; route
  gate matrix — owner 200, `branch_manager` 403, lapsed entitlement 403, foreign resource id
  400). Existing F-205 sections updated to authorize their post-migration test-created courts.
- tenant-management 11/11, identity-auth 7/7, payment 12/12, notification 7/7 (unaffected,
  included as part of the full 5-service run).
- Whole-repo typecheck + admin-v2 build + lint clean (8 pre-existing warnings, none new).
- Two-step migration verified for real on `badminton_db`: all 18 existing `Resource` rows
  backfilled to `true`, column default confirmed `false` going forward.
- Live-fire against real JBC data (Coimbatore Main Courts, owner role): `PATCH` excluding
  Court 3 confirmed via DB read-back (`guestBookable=false` for Court 3 only); four real guest
  bookings on one window landed on Courts 1, 2, 4 (`courtSlotIndex` 4, not compacted); a
  further booking fell back to `resourceId:null`; UI save persisted across a full page reload;
  dark-mode tokens resolved; no horizontal scroll at 375px.
- `pnpm register:check` green at the time (203 rows: F-224 Open, F-225 Resolved).

## Sign-off

Already merged (PR #16, `main`) and deployed. This backfill is documentation-only — it adds
no code, register, or batch-log change — so it needs only doc-level sign-off, not the full
implementation-plan approval flow.
