# F-155 — reject slots that have already started

> **Status: PROPOSED — awaiting approval. Nothing implemented.**
> Urgent: real money can currently be taken for a court time that has already elapsed.

## Context

The founder saw an 11:00 AM slot still offered at 1:00 PM IST. That is confirmed live, and quantified —
querying the deployed JBC pool at **5:44 PM IST**, availability returned **16 slots for today, 7 of which
had already started**, each with capacity and each bookable:

| Slot (IST) | Stored `startTime` | Still offered |
|---|---|---|
| 11:30 AM | `2026-08-19T06:00:00.000Z` | yes, 3 seats |
| 12:30 PM | `2026-08-19T07:00:00.000Z` | yes, 4 seats |
| 1:30 PM | `2026-08-19T08:00:00.000Z` | yes, 4 seats |

### The stated root cause is wrong, and the correction makes this much smaller

The kickoff expects to find a comparison against UTC `now` while the slot's real meaning is IST.
**There is no comparison against `now` at all.** `GET /resource-pools/:id/availability`
(`services/slot-engine/src/index.ts:1896`) filters on exactly three things — date range, blocked
windows, and remaining capacity — and never asks whether the window has already begun. `POST /bookings`
checks only the *upper* bound (`maxBookingDate`, `:2127`); there is no lower bound.

**This is therefore not a timezone bug.** `window.startTime` is stored as an absolute UTC instant and
the browser already renders it correctly in IST — the display was never wrong. The same defect would
exist with the branch set to IST. That matters for two reasons:

- **The fix needs zero timezone math.** Comparing two absolute instants is correct in every zone, so
  this structurally *cannot* drift into F-088 — the concern the kickoff rightly raised. If that turns
  out to be false during implementation, I stop and say so rather than widening scope.
- **F-100's UTC setting is a real but separate problem.** It affects day-boundary and browse-horizon
  maths, not this. Fixing this does not fix that, and does not depend on it.

## The change — two edits, both in `services/slot-engine/src/index.ts`

**1. `POST /bookings` — authoritative rejection.** Beside the existing `maxBookingDate` upper-bound
check at `:2127`, reject when the window has already started, with a distinct error code
(`SLOT_ALREADY_STARTED`, 400). This sits **inside the existing `FOR UPDATE` transaction** (`:2079`), so
it cannot be raced. This is the change that closes the financial exposure and it holds even for a
caller hitting the API directly, bypassing the UI.

**2. `GET /availability` — hide started slots.** In the window loop (`:1965`), skip any window whose
`startTime` has passed. **Unconditional**, per your decision: the endpoint is unauthenticated and
cannot distinguish an admin caller, and differentiating is speculative scope on an urgent fix. Guest
and admin views both stop showing started slots.

No client changes: `CourtBooking.tsx` renders whatever the endpoint returns, so the guest list corrects
itself.

**3. Register:** log **F-162** for the admin-reconciliation question this defers — whether admins need
visibility of today's already-started slots — to be settled later with real evidence if it matters.

## Boundary and compatibility

**Chosen boundary: reject when `startTime` has passed**, as specified. The alternative — rejecting only
once `endTime` has passed, so a partially-elapsed slot stays bookable — is deliberately *not* chosen;
noted only so the decision is visible.

**No lead-time buffer is introduced, and none exists today.** A slot 10 minutes away still books.
Verified that neither existing rule is a booking-lead-time control: `guestAccessCutoffMinutes` governs
the low-occupancy sweep and admin release of freed capacity (`packages/database/prisma/schema.prisma:289`,
and F-065's note at `:3033`), and `gracePeriodMinutes` is the *member confirmation* cutoff (`:630`).
Inventing a buffer would be a new policy decision, not a bug fix.

**Regressions are safe, checked rather than assumed.** Fixtures build windows with
`nextAlignedHour(2)` (`regression/_fixtures.ts:52`) — `now + 2h` floored to the hour, so always at
least an hour ahead. No regression creates a past window, and none requests availability for today.

## Verification

**Live-fire, both directions, on the deployed stack — the proof this finding demands:**

1. **Before:** call `POST /bookings` directly for a slot that has already started and confirm it
   currently **succeeds** — reproducing the defect at the API level, not just the UI.
2. **After:** the same call is rejected with `SLOT_ALREADY_STARTED`.
3. **Near-future still works:** a slot shortly in the future books normally, proving the guard did not
   overshoot into legitimate bookings.
4. **Availability shrinks correctly:** the same query that returned 16 slots (7 started) returns only
   the not-yet-started ones, and the count matches the wall clock at the time of the run.

Then: all five regression suites, whole-repo typecheck, and build. Rebuild before testing (F-085), and
run regressions against the disposable database with the ports free (F-151).

## Out of scope

F-087 and F-088's timezone rollout. Changing JBC's branch timezone from UTC. Any admin UI for branch
timezone. The `endTime`-based boundary above. Guest lead-time policy.
