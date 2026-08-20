# F-046 — e2e specs collide over shared fixture identities

> **Status: IMPLEMENTED 20 Aug 2026.** Scope was corrected twice during investigation; this document
> describes what shipped, not the first two drafts.

## Context

F-046 has three recorded occurrences (6, 8, 15 Aug) and pins the mechanism as: the seed's `upsert` is
keyed on `id` while `User` is unique on `(phone, tenantId)`. A fourth was hit during F-047's baseline.

## Two corrections the investigation forced

**Draft 1 said: re-key the upsert to `(phone, tenantId)`.** That converts a `P2002` **crash** into a
**silent wrong-row bug** — the second spec's `update` runs against the first spec's row and does not
change its `id`, so the second spec then references an id that does not exist. A crash that stops the
suite beats a pass asserting against the wrong user. Rejected.

**Draft 2 said: renumber five files, but leave f041/f061 on the shared number.** Both parts were
wrong, and only a live run showed it:

- **The f023 ↔ member-self-confirm collisions were already handled.** `cleanupF023()` deletes users by
  `(tenantId, phone)` — the natural key — and runs from **both** `beforeAll` and `afterAll`
  (`f023-full-system.spec.ts:100`, `:128`, `:224`, `:228`). Proven: `f023 → member-self-confirm` on a
  fresh database gives `2 passed (14.5s)`. Four of the five predicted conflicts were not real. The
  register's text predates that cleanup being added.
- **The two files marked "owner stays Tier 1" were the actual cause.** `f041` and `f061` sign in as
  `+919999999999` and seed nothing, so identity-auth's dev-mode self-registration claims that phone
  with a generated UUID; `seed-test-data.ts` then cannot create its own row for it. Renumbering
  everything else would have changed nothing.

**Proven live** — fresh `badminton_db_e2e`, chain `f023 → f041 → guest-booking`:

```
Unique constraint failed on the fields: (`phone`,`tenantId`)   at seed-test-data.ts:93
users left behind:  24d849ba-7e45-4144-af95-080eccae4c0d | +919999999999
```

That id is a UUID — nothing in the specs or the regression fixtures uses it.

## What shipped

**Three files, no new dependencies, no production code.**

1. **`f041-verification.spec.ts`** and **`f061-browser-verification.spec.ts`** now run
   `seed-test-data.ts` in `beforeAll`, exactly as `guest-booking` and `findings-verification` already
   did. Seeding rather than renumbering, deliberately: both need the seeded **OWNER**, and a private
   phone would self-register a GUEST with no admin rights and break their admin login.
2. **`member-self-confirm.spec.ts`** takes a private phone range, `+919902000001`–`05`. It collided
   with `f043-phase-c`, which creates `+919855555555` via `user.create` and — unlike f023 — **does not
   clean up afterwards**, leaving the row for the next spec to trip over.

**`f043-phase-c.spec.ts` needed no change.** It deletes by `(tenantId, phone)` before creating
(`:127`, `:141-143`), so it is safe on the way in. Its lack of cleanup on the way *out* is what
member-self-confirm's private range now routes around.

**Upserts stay keyed on `id`, deliberately** — once identities are unique per file, `id` and
`(phone, tenantId)` cannot disagree, and the `id` key keeps a future accidental clash loud.

## Result — as a number, not a claim

| | Before | After |
|---|---|---|
| Suite | **2 passed, 6 failed, 1 skipped** | **4 passed, 4 failed, 1 skipped** |
| Runtime | 7.1 min | 4.2 min (fewer timeouts burning) |
| `(phone, tenantId)` P2002 across a full run | present | **0** |
| Phones held by more than one id | yes | **0** |

**Two of the six were identity collisions and are fixed:** `guest-booking` and `member-self-confirm`.

**Four were not, and remain open elsewhere:** `f041-verification` (depends on `f041-member-pending`, a
user nothing creates), `f043-phase-c`, and `f061-browser-verification` ×2 (expect fixtures like
`admin-seed-booking-refundable-cancelled` that nothing in the suite creates).

## Explicitly still open on F-046 — not closed by this work

- **`POST /bookings/sweep` reaching beyond its own fixtures.** Global by construction; no fixture
  namespacing touches it. F-046's identity-collision half is discharged; the finding is not.
- **`f023`'s `afterAll` cleanup** — since corrected in the code but never reflected in the entry.
- **`f041-verification`'s dependency on a user nothing creates.**

## Verification performed

RED captured on a genuinely fresh database (the first attempt was not fresh — `DROP DATABASE` failed
silently against open service connections, caught when an "empty" database reported 5 users, redone
with `WITH (FORCE)`); GREEN on the same chain; full suite on a fresh database; previously-passing
specs re-run individually; database read-back confirming no phone held by two ids; 5/5 regression
suites; `register:check` and `diagram:verify`.
