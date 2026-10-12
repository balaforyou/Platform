# F-339 -- a venue or pool switch keeps the auto-advanced date

Date: 8 Oct 2026 · Reviewer: Chief · Founder: Bala

**Source note.** There is no handover document from Chief for this finding. This is Claude Code's own plan, approved by Chief on 8 Oct 2026 with the three additions below; Bala's design answers (reset to today, keep a hand-picked date, Low, live-fire only) and his go for implementation were relayed the same day. Evidence is in `docs/plans/batch-log.md`, not here.

## Problem
On `/book`, a venue with no slots today makes F-212's effect auto-advance the date. Switching to the other venue keeps the advanced date and shows "No slots available on this date. Try another date." The other venue's own slots, including today's, are never offered. Bala saw it on JBC, New Court then Old Court. The behaviour is identical on a `67ddcb8` build and on `7d50b59`, so it predates F-335.

## Root cause (`BranchBooking.tsx` on `7d50b59`)
- `bookingDate` (`:187`) is plain state; `handleSelectBranch` (`:128`) and the pools effect (`:148`, which clears only `selectedPoolId`) do not reset it.
- `autoAdvancedToRef` and `searchRanForRef` (`:201-202`, checked at `:411-412`) hold only a date, so a date the first venue advanced to counts as already searched for the second.
- Both reset only in `pickDate` (`:438-441`). Pool chips (`:704`) have the same bug.

## Rulings
- Reset an auto-advanced date to **today**, then let the existing F-212 search find the next date. A **hand-picked date is kept**. Severity **Low**. **Live-fire only**, no committed spec.
- Fix shape: key both guards by **pool plus date**, and call **one reset helper** from `handleSelectBranch` and the pool chip's `onClick` (one render, one fetch); keeps F-212's one-search-per-pool-and-date rule.
- Chief's additions: (1) `todayKey()` is an extraction of the initialiser at `:187`, nothing else; record which zone it uses (it is browser-local) as an adjacent observation for the F-336 family, do not fix it here, and run one case with a browser zone different from `Asia/Kolkata`. (2) A pre-fix control for hand-picked dates (S12): confirm on `67ddcb8` that picking an empty date by hand on the same venue already advances. (3) No null pool in the key: the key must never read `null|date`, the search effect stays gated on a real pool id, asserted in the S9 and S10 request logs.
- Scope: `BranchBooking.tsx` only; `CourtBooking.tsx` (dead copy of the refs), the backend, F-336 and F-338 untouched.

## What was built
- Module helpers `todayKey()` (the old initialiser, unchanged) and `searchKey(poolId, date)` (real strings only).
- The search effect reads and writes `searchKey(poolId, date)` after its existing `!poolId` guard.
- `resetAutoAdvance()` clears both refs and the notice, and puts the date back on `todayKey()` only if the ref says the current date was auto-advanced for the current pool. `handleSelectBranch` calls it only when the venue changes, and also clears `selectedPoolId` in the same batch (the same reset the pools effect does after the next render) so the old pool is never fetched for one render with the reset date; the pool chip calls it only when the pool changes.

## Live-fire matrix (S1 to S12 and Z)
Run on a `67ddcb8` build and on the fix, same fixtures; results and request logs are summarised in the batch-log entry.

## Known limitations / for later
- "Today" is the browser's local calendar date (unchanged); a guest whose browser zone differs from the branch's can open `/book` on a different day from the branch's. Adjacent to F-336; not fixed here.
- Not provable locally: a real device.
