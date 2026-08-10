# F-071 — Implementation Plan

**Status:** Awaiting approval. Nothing implemented. 9 Aug 2026.
**Kickoff:** `Implementation_Plan/Tier1/f071_kickoff.md` · **Finding:** `docs/findings_register.md` F-071

---

## Context

Three routes share an identical hand-rolled IDOR guard that fails in two opposite directions. The guard is byte-identical at `services/slot-engine/src/index.ts:2210`, `:2845` and `:2923`:

```ts
const isOwner = booking.userId === userId;
const isAdmin = roles.includes('owner') || roles.includes('branch_manager');
if (!isOwner && !isAdmin) { reply.status(403); throw new Error('Forbidden'); }
```

**Fail-open:** `roles.includes('owner')` matches, and no `tenantId` or `branchId` comparison exists anywhere in the three handlers — so any `owner`-role holder can read, refund-preview and cancel **any booking in any tenant**.

**Fail-closed:** `roles.includes('branch_manager')` tests a bare string against the real claim format `branch_manager:<branchId>`, so it never matches and a genuine branch manager who isn't the booking's owner is wrongly denied.

---

## The scoping question — settled by investigation, not decided here

The kickoff required establishing whether an `owner` tenant-scoping convention already exists. **It does, explicitly.** This is not a nil result, so the pre-committed nil-result handling does not apply.

**The canonical implementation** is `GET /users/:userId/branches/:branchId/check` in tenant-management (`services/tenant-management/src/index.ts:431-460`), whose own comments state the rule: *"Performs tenant-level owner scoping"* and *"Owner role automatically grants access to all branches under the tenant."* Its mechanism:

1. Resolve the branch and read its `tenantId` **from the database**
2. Query `roleAssignment` filtered by **both** `userId` **and** `tenantId: branch.tenantId`
3. Within that tenant, `OWNER` grants access to every branch; otherwise the branch must match

Supporting evidence that the convention is real and load-bearing:

- **`RoleAssignment.tenantId` is a required column** (`schema.prisma:93`) — roles are tenant-scoped in the data model, not globally.
- **The JWT carries `tenantId` as a first-class claim** (`identity-auth/src/index.ts:348-353`), alongside `roles`.
- **Login is per-tenant** — `tenantId` is required on OTP request and verify, and `User` is `@@unique([phone, tenantId])`.
- **`requireUserJwt` already treats a missing `tenantId` as unauthorized** (`slot-engine/index.ts:2208-2214`).

**Conclusion:** `isAuthorizedForBranch`'s treatment of `owner` as "any branch" is *correct given a tenant-scoped token* — owner means every branch **within my tenant**. The defect is that these three routes never establish the tenant at all. The fix therefore **implements the existing convention** rather than inventing one.

---

## Technical approach

Extract one shared guard and use it in all three routes. Three identical copies is how the F-022 drift happened; a single function is the actual fix for the recurrence risk.

```ts
// WHY (F-071): the previous inline guard checked `roles.includes('branch_manager')`
// against a claim format that is actually `branch_manager:<branchId>` — so it never
// matched, denying real branch managers — while `roles.includes('owner')` matched with
// no tenant comparison at all, letting any owner reach any booking in any tenant.
//
// Implements the convention already established by tenant-management's
// /users/:userId/branches/:branchId/check: owner grants every branch WITHIN its tenant.
// Both the tenant and the branch are read from the booking row, never from the client.
function requireBookingAccess(booking: any, decodedUser: any, reply: any) {
  const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
  const roles: string[] = decodedUser.roles ?? [];

  // Tenant is the outer boundary and applies to everyone on the JWT path. A token with
  // no tenantId claim fails closed here rather than falling through.
  if (decodedUser.tenantId !== booking.tenantId) {
    reply.status(403);
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const isBookingOwner = booking.userId === userId;
  const isScopedAdmin = isAuthorizedForBranch(
    { isInternal: false, userId, roles },
    booking.branchId,
  );

  if (!isBookingOwner && !isScopedAdmin) {
    reply.status(403);
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }
}
```

Each of the three sites collapses to `if (!isInternal && decodedUser) requireBookingAccess(booking, decodedUser, reply);`.

**Why reuse `isAuthorizedForBranch`** (`index.ts:167-171`) rather than write a new role parser: it already handles `owner` and the `branch_manager:<branchId>` format correctly, and is the same helper the 14 correctly-guarded routes rely on. The bug was never in that helper — it was that these three never called it.

**The dual-path structure is preserved unchanged.** `isInternal` short-circuits before the guard, so Payment's service-to-service calls are untouched. Verified: Payment calls `GET /bookings/:id` with `Bearer ${internalKey}` at `payment/src/index.ts:145, 609, 729, 885, 1086`.

**Both halves are repaired by construction** — the tenant check closes the fail-open half; routing through `isAuthorizedForBranch` closes the fail-closed half.

---

## Edge cases — against the standing categories

| Category | Assessment |
|---|---|
| **Trust boundary** | The finding itself. `booking.tenantId` and `booking.branchId` are read from the database row, never from the request — a client cannot assert either. |
| **Backward compatibility** | Three real consumers. **Admin Web's Refunds screen** calls `cancel-preview` with an admin JWT (`admin-web/src/main.tsx:1424`) — the load-bearing positive case. **Guest PWA** calls `cancel-preview` and `cancel` with a user token (`CancelBookingModal.tsx:25,45`) and `GET /bookings/:id` (`BookingConfirmation.tsx:24`, `BookingPay.tsx:25`). **Payment** uses the internal key throughout. |
| **Fail-closed regression** | A real branch manager must end up *allowed* for their own branch. Proven, not implied. |
| **Positive owner path** | An owner cancelling their own tenant's booking must keep working end to end. First-class verification item. |
| **Concurrency** | Not applicable — no new shared state or write ordering. |
| **Real browser vs script** | Admin Web's Refunds screen and the guest cancel modal both traverse changed code. Real rendered evidence required. |
| **Production build vs dev runtime** | Full `pnpm -r run build` + whole-repo `typecheck`. |

**One risk worth naming:** if any legitimate token in practice lacks a `tenantId` claim, the new outer check turns a working flow into a 403. The claim is set on every issuance path (`identity-auth:352, 454, 523`), but the regression suite's `signJwt` helpers build tokens by hand — `ownerToken(userId, tenantId?)` takes tenantId as *optional*. Any existing section relying on a tenant-less admin token will start failing, and that failure is correct behaviour rather than a regression to be worked around. I'll identify those cases and fix the tokens, not the guard.

---

## Files

**Modified:** `services/slot-engine/src/index.ts` — one new helper, three call sites collapsed onto it.

**Possibly modified:** regression sections whose hand-built admin tokens omit `tenantId` (identified during implementation, not guessed at now).

**New:** a regression section covering cross-tenant rejection, branch-manager allow/deny, and the positive owner path.

---

## Verification

**Negative cases** — all three routes:
- An `owner` token from tenant A against a booking in tenant B → **403**
- A `branch_manager:<other-branch>` token, same tenant → **403**
- A token with no `tenantId` claim → **403** (fails closed)

**Positive cases** — first-class, not implied by the negatives:
- **An owner cancelling a real booking in their own tenant, end to end** — `cancel-preview` returns a real tiered refund, `cancel` transitions the booking to `CANCELLED`, and the resulting state is read back from the database. Not just a 200.
- A `branch_manager:<own-branch>` token **allowed** on all three — this is the fail-closed half, currently broken.
- The booking's own guest still able to preview and cancel their booking.
- Payment's internal-key path still working on `GET /bookings/:id`.

**Red/green (rule 9 Section F):** remove the tenant comparison from the shared guard, show the cross-tenant `owner` attempt **succeed**, restore it, show it rejected. The service must be restarted between states — `tsx` is not watching, and a stale process produced a false negative during Track A.

**Real browser:** Admin Web Refunds screen — look up a booking, load the refund preview, screenshot the rendered result. This also discharges the Tier 1 screenshot debt recorded on F-061 if the pane composites; if it does not, that debt stays open and is reported as still open.

**Plus:** full `pnpm test:regression`, whole-repo `typecheck`, `pnpm -r run build`.

---

## Process constraints carried in

- **F-069** — `git status --short -uall` for scope verification; plain `git status` under-reports untracked files here.
- **F-075** — script files over inline `node -e` for anything touching shared or destructive state; verify state directly after unexpected silence.

---

## Out of scope

- **F-072** (`requireInternalOrAdmin` dead code) — adjacent, still deferred.
- The three routes' *other* behaviours (refund tiering, idempotency) — untouched.
- **A new finding to report, not fix here:** `GET /users/:id/roles` (`tenant-management/src/index.ts:409-413`) queries `roleAssignment` by `userId` with **no tenant filter**, and flattens `OWNER` to the bare string `'owner'`, discarding which tenant granted it. Today this is contained because `User` is `@@unique([phone, tenantId])` so a userId belongs to one tenant's user row — but nothing constrains `RoleAssignment.userId` to that, and the endpoint's correctness currently rests on that unenforced assumption. The token's own `tenantId` claim is what this plan's fix relies on, so the exposure is mitigated rather than resolved.
