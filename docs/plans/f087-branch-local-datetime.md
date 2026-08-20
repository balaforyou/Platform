# F-087 — decide how the API interprets a datetime with no offset

> **Status: IMPLEMENTED 20 Aug 2026.** The decision is the deliverable; the code is small.

## Why this had to land first

F-087 is the named blocker for the whole timezone group. F-100 exists *because* of it — both JBC
branches were pinned to `UTC` specifically to keep server, branch and input clocks agreeing by
coincidence — and F-088 lists it as part (5), required **before** any branch flip rather than after.

## Confirmed state before the change

`services/slot-engine/src/index.ts`, `POST /resource-pools/:id/availability-windows`:

```
const poolTimeZone = await getBranchTimeZone(pool.branchId);   // branch clock resolved
const start = new Date(startTime);                             // …then parsed on the SERVER clock
```

`new Date("2026-09-01T22:00:00")` — no offset — is parsed by Node as process-local time, so the
instant depended on how the container happened to be configured.

## The sibling audit the entry asked for, which had never been run

Every `new Date(<request field>)` in slot-engine, classified:

| Site | Route | Verdict |
|---|---|---|
| `:1145-1146` | `POST /resource-pools/:id/availability-windows` | The known case |
| `:1884-1885` | `POST /blocked-windows` | **Genuine sibling.** Same naive parse, and resolved **no** branch timezone at all. Not called from `apps/admin-web`, so latent rather than live |
| `:1630` | `windows/:windowId/release` | Not a sibling — `expectedUpdatedAt` is a concurrency token echoed back from a prior response, never human-typed |
| `:280` | `dayBounds()` | Out of scope — documented UTC-day semantics, owned by F-088 |

## The decision

The entry offered two options and required the choice be stated rather than fall out of the parser:

1. Reject naive input with a 400.
2. **Interpret naive input on the branch's clock.** ← chosen

Option 2 is what an admin typing a time on a venue's schedule actually means, matches the schema's own
"branch local time" convention, and needs no admin-web change — whereas option 1 breaks every existing
admin caller until the frontend is updated to send offsets. **Rejection is retained as the fallback**
when the input is not a parseable datetime. Input carrying an explicit offset is untouched: it already
says exactly which instant it means.

## Implementation

`parseBranchLocalDateTime(value, timeZone, field)` in `services/slot-engine/src/branchTime.ts`, placed
beside and reusing the DST-aware `branchLocalToUtc` rather than reimplementing the conversion. A naive
`YYYY-MM-DDTHH:MM[:SS]` is split and resolved on the branch clock; anything else falls through to
`new Date()`; unparseable input raises, and both call sites turn that into a 400 naming the field.

Applied to **both** endpoints. `blocked-windows` additionally resolves the branch timezone through its
pool — it had none — so the two cannot drift apart again.

## Evidence

Live-fire against two fixture branches (one `UTC`, one `Asia/Kolkata`), the service run from `dist`
under two different server timezones, every instant read back **from the database** rather than from
the response.

**RED — sharper than the entry describes.** Before the fix, a naive datetime only worked when the
server timezone happened to match the branch's; otherwise the alignment check — which already judged on
the branch clock — returned a **machine-dependent HTTP 400**:

| Case | server=UTC | server=Asia/Kolkata |
|---|---|---|
| UTC branch, naive | 200 → `22:00:00Z` | **400** |
| IST branch, naive | **400** | 200 → `16:30:00Z` |

**GREEN:**

| Case | server=UTC | server=Asia/Kolkata |
|---|---|---|
| UTC branch, naive | `22:00:00Z` | `22:00:00Z` |
| IST branch, naive | `16:30:00Z` | `16:30:00Z` |
| explicit `Z` | `22:00:00Z` | `22:00:00Z` |
| explicit `+05:30` | `16:30:00Z` | `16:30:00Z` |

**The safety property, proven not argued:** a UTC branch on a UTC server — the production
configuration — stores `2026-09-01T22:00:00Z` **identically before and after**. That is what makes
this landable ahead of F-088's flip. The result is also now independent of server timezone, which it
never was.

`blocked-windows` verified on the same three cases.

Whole-repo typecheck clean, regression 5/5 against `badminton_db_test`, fixture cleaned up.

## Not in scope

F-088's remaining parts — making `Branch.timezone` settable, the per-branch dry-run migration report,
the flip itself, and `availabilityGeneration.ts` — and F-100's branch correction. This lands the
blocker so those become possible; it does not start them.
