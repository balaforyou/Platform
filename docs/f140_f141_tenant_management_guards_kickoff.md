# F-140 + F-141 — close the two remaining `tenant-management` trust-boundary gaps

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Two findings, two fixes, **two separate commits**, same as F-119's two-piece close.

## Context

F-076 closed the *read* side of a cross-tenant role leak by tenant-filtering `GET /users/:id/roles`.
Its investigation surfaced two things it deliberately did not fix, because each is a distinct defect:

- **F-140** — that route, *and its sibling* `/users/:userId/branches/:branchId/check`, have **no
  authentication at all**. Filtering scopes *what* is returned; it says nothing about *who may ask*.
- **F-141** — `POST /tenants/:id/roles` never checks that the target user belongs to the tenant. That
  is the *write* side: the mechanism that made the cross-tenant grant possible in the first place.

---

## Investigation findings

### F-140 — caller inventory, and one surprise

| Route | Production callers | Test callers |
|---|---|---|
| `GET /users/:id/roles` | **3**, all `identity-auth`: `:363` otp-verify, `:466` google-verify, `:535` refresh | — |
| `GET /users/:userId/branches/:branchId/check` | **ZERO** | `role-scoping.regression.ts:30`, `:36`, `:50` |

**The sibling has no production caller at all** — checked rather than assumed, as instructed. The only
non-test reference is a **comment** in slot-engine (`index.ts:215`) citing it as the convention
`requireBookingAccess` follows; slot-engine holds no tenant-management client whatsoever. So the
route is reachable, unauthenticated, and exercised only by tests.

**Worth stating, not acting on:** a route with zero production callers may simply be dead. Guarding it
is still correct and cheap, but whether it should exist is a separate question — flagging rather than
deleting, since deletion is not what was asked.

**`requireInternalKey` fits both — but it lives in the wrong service.** F-119 extracted it in
**identity-auth**, not here. `tenant-management` has its own internal-key logic in two places already:
inside `verifyTenantOwnerOrInternal` (`:24`/`:35`, as the internal-*or*-owner path) and inlined in
`POST /tenants` (`:79-81`, internal-key-only). Adding two more inline copies would make four. So the
fix is to **extract a local `requireInternalKey` in this service, mirroring F-119's extraction exactly**
— same reasoning, same shape, one service over.

### F-141 — the correct rule, established from real data

**Question asked: is there a legitimate use case for granting a role to a user outside the tenant?**
Checked against both databases rather than reasoned about:

| | `badminton_db` | `badminton_db_test` |
|---|---|---|
| Total role assignments | 5 | 5 |
| **Cross-tenant** (user belongs to another tenant) | **0** | **0** |
| **Dangling** (no `User` row at all) | 2 | 4 |

**Cross-tenant grants have never happened.** Nothing depends on them, so rejecting them outright is
safe and is the right rule.

**Dangling grants do exist — but they are test residue, not a workflow.** The two in the *demo*
database are `owner-1` and `manager-1` under `club1`, created by `role-scoping.regression.ts:27`/`:46`
against synthetic userIds. Their presence in the demo database is itself a fingerprint of the F-101
incident, not evidence of a legitimate pattern.

**The real flow is user-first.** JBC's owner was provisioned tonight by OTP-creating the user, then
promoting, then granting — the user existed before the grant. `POST /tenants/:id/roles` has **no
production caller at all**; provisioning does not grant roles.

**Therefore the correct rule is the strict one:** the target user must exist **and** belong to the
tenant in the route. There is no invite/bootstrap path to preserve — the platform has no mechanism for
pre-assigning a role to a not-yet-registered person (`PendingInvite` covers co-players, not roles).

**This will break `role-scoping.regression.ts`**, which grants to synthetic ids. That is the same
situation F-091 hit when its branch-belongs-to-tenant check exposed fixtures pointing at
non-existent tenants, and it takes the same remedy: **seed real `User` rows** rather than weaken the
check. `_fixtures.ts:55` already clears users, so seeding fits the existing lifecycle.

---

## The changes — two commits

### Commit 1 — F-140: authenticate both routes

Extract `requireInternalKey(request, reply)` in `tenant-management/src/index.ts`, mirroring
`identity-auth`'s F-119 helper, and apply it to **both** routes **before** any parameter read or
database access (F-090/F-045/F-071 ordering).

Use it for `POST /tenants`'s existing inline check too, so this service stops carrying two spellings
of the same rule — behaviour-neutral, and covered by existing regression.

Update the three `identity-auth` call sites (`:363`, `:466`, `:535`) to send the internal key, and the
three regression calls to `/check`.

### Commit 2 — F-141: validate tenant membership on grant

In `POST /tenants/:id/roles`, after authorization and before the upsert:

```
const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
if (!user)                       -> 404 USER_NOT_FOUND
if (user.tenantId !== id)        -> 403 FORBIDDEN   (never 404 — do not leak that the user exists)
```

Applied to the **internal-key path as well**, deliberately: bootstrap creates the user first, so the
key buys no exemption here, and exempting it would leave the exact hole F-076 had to defend against.

Then seed real users in `role-scoping.regression.ts` in place of `owner-1`/`manager-1`.

---

## Verification

- **Live-fire RED/GREEN for both**, against `badminton_db_test` only (F-101), RED measured from a
  stashed working tree so it runs genuinely unmodified code (the method F-076 used).
- **F-140 RED**: both routes answered with **no credentials at all**, returning real role data —
  contrasted in the same run against the now-multiple guarded siblings in this same file
  (`POST /tenants`, `PATCH /tenants/:id`, `POST /tenants/:id/roles`). **GREEN**: both 401, wrong key
  401, internal key succeeds.
- **F-141 RED**: construct the real scenario — user U in tenant A, then `POST /tenants/B/roles`
  granting U an OWNER role in B, and show it **succeeds** with a database read-back proving the row
  exists. **GREEN**: identical request rejected, **read-back confirming no row was written**, while a
  same-tenant grant still succeeds.
- **The legitimate callers still work**: identity-auth's three call sites prove out through the E2E
  JWT role-embedding section (real login → assign → re-login → `branch_manager:<branchId>` asserted).
- Full regression across all five suites; whole-repo typecheck and build; **rebuild before testing**
  (F-085).
- Two register resolutions, one per commit.

## Out of scope

Whether `/check` should exist at all (zero production callers — flagged above). Deleting the dangling
`club1` rows from the demo database. Any foreign key on `RoleAssignment.userId` — a real option for
enforcing this at the database rather than in one route, but a schema change and its own decision.
