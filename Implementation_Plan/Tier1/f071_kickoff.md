# Kickoff — F-071: the IDOR guard that fails open for `owner`

**Status:** Issued 9 Aug 2026. Not started — plan mode first, no implementation until the plan is reviewed.
**Related:** `docs/findings_register.md` F-071 · Tier 1 plan at `Implementation_Plan/Tier1/tier1_implementation_plan.md`

Tier 1 rigor applies in full: **plan mode first, full Technical Design section, real evidence per rule 8, no commit without explicit sign-off.** Read F-071's register entry in full before starting.

---

## Why this is the same severity tier, not a lesser follow-on

Three routes — `POST /bookings/:id/cancel` (`services/slot-engine/src/index.ts:2143`), `GET /bookings/:id` (`:2772`), `GET /bookings/:id/cancel-preview` (`:2850`) — share an identical hand-rolled IDOR guard that **fails in two opposite directions**:

**Fail-open, the serious half.** `roles.includes('owner')` matches, and these handlers perform **no branch or tenant comparison at all** — verified, there is no `tenantId` or `branchId` check anywhere in any of the three guards. Any holder of an `owner` role can read, refund-preview, and **cancel any booking in any tenant**. Functionally equal to what F-045/F-061 fixed, and arguably worse: a missing check gets noticed eventually, whereas a broken one that superficially resembles a real guard can persist indefinitely because nothing about the code *looks* wrong on a casual read.

**Fail-closed, the functional half.** `roles.includes('branch_manager')` tests a bare string against a claim format that is actually `branch_manager:<branchId>` (see `isAuthorizedForBranch`, `:170`). It never matches, so a genuine branch manager who is not the booking's owner is wrongly **denied**.

**A fix must repair both halves, or it trades one bug for the other.**

---

## The pattern to reuse — confirm it, don't inherit it

Elsewhere this file solves exactly this with `getInternalOrAdminAuth` plus a scope check that re-reads the owning branch **from the database**, never the client. Confirm by reading how the already-correct routes do it.

These three are **dual-path** — they accept an internal service key **or** a user JWT, and the guard only applies on the JWT path. Preserve that: Payment calls them service-to-service.

### Settle the `owner`-scoping question by investigation, not by decision

`isAuthorizedForBranch` (`:167-171`) currently treats `owner` as authorized for **any** branch, and that may well be deliberate elsewhere. Before proposing anything, check whether `owner` is treated as tenant-scoped anywhere else in this codebase — the JWT's `tenantId` claim, `requireUserJwt`, other admin-scoped endpoints, the identity service's token issuance — and **state definitively whether this file's existing convention already answers the question**, rather than deciding it fresh here.

This is the same move F-048 made: it established that `isMemberBooking` had no legitimate precedent as a request input *before* concluding it should be removed. Apply that instinct here. If the convention genuinely does not exist yet, say so plainly and propose one with reasoning — but do not invent one while believing you are following one.

### If the investigation comes back empty — decided in advance, 9 Aug 2026

A nil result is **not a blocked investigation**. It means the codebase has never answered "what is an `owner` allowed to reach," and these three routes are simply where that absence became visible and exploitable. That is a materially larger finding than "three routes have a broken guard," and it must not be understated.

Pre-committed handling, so this does not stall mid-investigation waiting on a decision:

1. **The fix still proceeds.** Comparing the JWT's `tenantId` against the booking's tenant is correct on its own merits regardless of precedent, and F-071 is the concrete evidence that it *should become* the precedent.
2. **Flag the nil result explicitly before proposing the fix** — same as every other real decision point in this project. Do not fold it into the fix's rationale silently.
3. **The absence gets its own finding**, reported for a reviewer-assigned ID rather than absorbed into F-071's resolution text — approximately: *no platform-wide convention exists for whether the `owner` role is tenant-scoped; F-071's fix establishes one for these three routes, but every other admin-scoped endpoint should be audited against the same question.* Folding it into F-071's resolution would understate the scope of what was actually discovered.

---

## Edge cases, against the standing categories

- **Trust boundary** — the whole finding. Real rejected cross-tenant attempts, not "the check exists."
- **Backward compatibility** — dual-path; Payment's webhook flows call these with the internal key. Confirm no service-to-service path breaks, and check whether any regression section or the guest PWA's cancel flow depends on current behaviour.
- **Fail-closed regression** — a real branch manager must end up *allowed* for their own branch. Prove it; do not let the fix imply it.
- **The positive owner path** — an owner acting legitimately within their own tenant must keep working. Central to daily operation, so it gets proven, not assumed.
- **Real browser** — the guest cancel flow touches `/cancel` and `/cancel-preview`. If any UI path changes, real rendered evidence per rule 8.

---

## Verification required

**Negative cases:**
- A real cross-tenant attempt on **all three** routes, shown rejected — an `owner` token from tenant A against a booking in tenant B.
- A branch manager **denied** for another branch, on all three.

**Positive cases** — first-class requirements, not implied by the negatives:
- **An owner correctly cancelling a real booking in their own tenant, proven working end to end** — including the refund-preview and the resulting booking state, not just a 200.
- A branch manager **allowed** for their own branch, on all three.
- The internal-key service path still working.

**Plus:**
- Red/green per rule 9 Section F: break the new scope check, show the cross-tenant attempt succeed, restore, show it rejected.
- Full regression, whole-repo typecheck and build.

---

## Two process lessons to carry in

- **F-069** — use `git status --short -uall` for scope verification. Plain `git status` under-reports untracked files in this repo (`core.fsmonitor=true`), which is what makes a scope-compliance guard pass when it should fail.
- **F-075** — prefer a script file over inline `node -e` for anything touching shared or destructive state; inline escaping has failed *silently* more than once. When a command produces unexpected silence, verify the underlying state directly before assuming a no-op.

---

**Stop after the plan. No implementation until it is reviewed.**
