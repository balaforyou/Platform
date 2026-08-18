# F-076 — tenant-filter `GET /users/:id/roles`

> **Status: PROPOSED — awaiting approval. Nothing has been implemented.**
> Circulated for group review. Written 18 Aug 2026 under the standing rules used for
> F-090 / F-091 / F-097 / F-119: plan first, real evidence per rule 8, no commit without sign-off.
>
> Investigation findings below are verified against the code as it stands — file:line references
> are current. The two rejected alternatives (§ *The change*) and the out-of-scope no-auth finding
> are the parts most worth a second opinion.

## Context

`GET /users/:id/roles` (`services/tenant-management/src/index.ts:459-478`) queries
`roleAssignment.findMany({ where: { userId: id } })` with **no tenant filter**, then flattens `OWNER`
to the bare string `'owner'`. Every issued JWT's `roles` claim comes from this endpoint, so a token's
role list is not tenant-filtered at source.

The correct pattern already exists **twenty lines below in the same file**:
`GET /users/:userId/branches/:branchId/check` (`:482-510`) resolves the tenant *from the resource*
(the branch) and filters `where: { userId, tenantId: branch.tenantId }`. This endpoint is simply
inconsistent with its own neighbour.

---

## Investigation findings

### 1. Caller inventory — three callers, all internal, none affected

| Caller | Route | Tenant available there? |
|---|---|---|
| `identity-auth:363` | `POST /auth/otp/verify` | yes — `user.tenantId` |
| `identity-auth:466` | `POST /auth/google/verify` | yes — `user.tenantId` |
| `identity-auth:535` | `POST /auth/refresh` | yes — `session.user.tenantId` (loaded via `include: { user: true }`) |

No frontend caller, no other service, no regression caller of this endpoint (the regression suite hits
`POST /tenants/:id/roles`, a different route). Confirmed twice by independent searches.

**Critically for backward compatibility: all three read only `body?.data?.roles`.** None reads
`roleAssignments`, which the endpoint already returns and which already contains `tenantId`.

### 2. The risk is real and reachable, not theoretical

`POST /tenants/:id/roles` validates that `userId` is *present*, the role enum, the OWNER/`branchId`
rule and that the branch belongs to the tenant — but **never validates that the user exists or belongs
to that tenant** (`:368-419`). Combined with `RoleAssignment.userId` being a scalar with no foreign
key, a tenant-A owner can assign a role against a `userId` that belongs to tenant B.

At tenant-B login the unfiltered query returns **both** assignments, and because `OWNER` flattens to a
bare `'owner'`, tenant-A's grant is **indistinguishable** from a legitimate tenant-B one. Every
consumer then does `roles.includes('owner')` — `slot-engine:179`/`:2775`, `payment:992`,
`identity-auth:76`, `admin-web:220`/`:513`, `tenant-management:50` — and grants owner powers.

The regression suite already proves arbitrary userIds are accepted: it assigns roles to `'owner-1'`
and `'manager-1'`, which are not real user rows at all.

### 3. Unrelated to F-133 — confirmed, briefly

F-133 concerns a new generic `Group` entity for notification targeting. This concerns `RoleAssignment`,
admin authorization. No shared model, no dependency in either direction. The only common theme is that
both are tenant-scoped relations; that is not a coupling.

---

## The change

### Resolve the tenant from the user, exactly as the sibling resolves it from the branch

```
const user = await prisma.user.findUnique({ where: { id } });
// no user row -> no roles can be legitimately scoped
const assignments = user
  ? await prisma.roleAssignment.findMany({ where: { userId: id, tenantId: user.tenantId } })
  : [];
```

**Why resolve from the resource rather than accept a caller-supplied `tenantId`.** A query parameter
was the obvious alternative and is rejected deliberately: this endpoint has **no authentication at all**
(see below), so a caller-supplied tenant would be trivially spoofable — and it would mean changing three
call sites for no gain. Resolving from the user row is what the sibling already does, needs **zero
caller changes**, and cannot be influenced by the caller.

**User not found → return empty roles, not 404.** A login should not hard-fail because a role record is
missing, and all three callers already treat any failure as "no roles" (`roles = []` in their catch
blocks), so empty is both truthful and behaviour-preserving.

### Preserve the granting tenant — without breaking the `roles` string format

Add the resolved tenant explicitly to the response (a top-level `tenantId`; `roleAssignments` already
carries per-row `tenantId`). **Do not change `'owner'` to `'owner:<tenantId>'`.**

That alternative is rejected on evidence: F-117 confirmed every consumer tests membership via
`roles.includes('owner')` across six call sites in four services plus admin-web. Changing the token
format breaks all of them at once, for no security gain — because once the query is tenant-filtered,
every returned assignment is *by construction* from the resolved tenant, so the tenant is no longer
ambiguous. The finding's concern ("the flattening makes the tenant unrecoverable downstream") is
resolved by filtering plus explicit exposure, not by re-encoding the string.

### Ordering

Resolve the user, then filter, then map — no data returned before the tenant is known.

---

## Out of scope, but must be recorded — this endpoint has no authentication

`GET /users/:id/roles` has **no `jwtVerify`, no internal-key check, and no `reply` parameter**, and
tenant-management has **no global `addHook`/`preHandler`**. Anyone who can reach the service can read
any user's full role set by id. Its sibling at `:482` is equally unguarded.

This is the same class as F-119 and is **not** fixed by the tenant filter — filtering scopes *what* is
returned, not *who* may ask. All three callers are service-to-service, so F-119's internal-key pattern
would fit directly.

I am deliberately **not** bundling it: it is a distinct trust-boundary defect that deserves its own ID
and its own RED/GREEN proof, and silently folding it in would hide a second real finding inside this
one. **Recommend logging it as a new finding for the reviewer to assign.**

---

## Verification

- **Live-fire RED, before the change**, against `badminton_db_test` only (F-101 discipline). Construct
  the real cross-tenant scenario: create user U in tenant A; assign U an `OWNER` role in tenant A **and**
  a second `OWNER` role in tenant B via `POST /tenants/B/roles` (which today accepts it). Then call
  `GET /users/U/roles` and show it returns **two** assignments and a `roles` array containing `'owner'`
  with no way to tell which tenant granted it.
- **GREEN, after**: the identical request returns only tenant A's assignment, with the resolved
  `tenantId` present in the response; the tenant-B grant is excluded. Contrast against the sibling
  `/users/:userId/branches/:branchId/check`, which already filters correctly, in the same run.
- **Nothing breaks**: the JWT `roles` claim keeps its exact existing format. Prove it with the existing
  E2E JWT-embedding section (`role-scoping.regression.ts:86-117`), which logs in a real user, assigns a
  role, re-logs in and asserts `branch_manager:<branchId>` is present.
- **Rebuild before testing** — regression runs from `dist`; a stale build is the F-085 trap.
- Full regression across all five services; whole-repo `pnpm -r run typecheck` and `pnpm -r run build`.
- Register: F-076 to Resolved with evidence, plus the new no-auth finding logged for ID assignment.

## Out of scope

The missing authentication (above — separate finding). The missing user-belongs-to-tenant validation on
`POST /tenants/:id/roles`, which is the *mechanism* enabling the cross-tenant grant — worth its own
consideration, but closing the read side is what F-076 asks for and is independently correct.
