> **Status: ready to commit as `docs/plans/walkthrough-checklist.md`.** Group 2's member-attendance
> route question is resolved (see Group 2 below) — this is no longer blocked.

# Structured Walkthrough Checklist — pre-demo stabilization

Grounded in the actual routes in both frontend apps (checked directly, not assumed), not a generic
UX checklist. Three sessions, each pairing a guest/member-facing flow with its corresponding admin
surface — the seam where most trickle so far (F-156, F-169-173) has actually occurred.

**How to use this:** one pass per group, in order. For each screen: do the thing, then immediately
do the *adjacent* thing an admin would need to do in response (or vice versa). Note anything that
surprises you, even mildly, even if you can't say why yet — "that felt slower than I expected" is
a valid entry. Don't diagnose root cause during the walkthrough; that's the investigation step
after, same discipline as every batch here. Log candidates as **described, not numbered** — bring
them back to this thread for ID assignment, same standing rule as implementation batches.

---

## Group 1 — Guest booking + Admin management of guest bookings

**Guest side** (`apps/guest-member-pwa`):
- [ ] `/login` — sign in as a fresh/throwaway guest
- [ ] `/` (MainDashboard) — check the Upcoming Slots card (F-156's fix), general first-impression
- [ ] `/branches` — branch selection list
- [ ] `/branches/:branchId` (BranchDashboard) — branch landing
- [ ] `/branches/:branchId/about` — branch info page
- [ ] `/branches/:branchId/book/:poolId` (CourtBooking) — full slot list, select a slot on **mobile
      width** specifically (F-153's fix), check the rate summary and Hold & Proceed button
- [ ] `/bookings/:bookingId/pay` (BookingPay) — payment flow through to completion
- [ ] `/bookings/:bookingId/confirmation` — confirmation screen
- [ ] `/bookings/my` (BookingHistory) — verify the just-made booking appears
- [ ] Cancel a booking (if guests can) and confirm it reflects everywhere it should
- [ ] Try to double-book the same slot as a second session/tab — see what happens, don't assume

**Admin side** (`apps/admin-web`), same booking(s) from the guest pass:
- [ ] `/resources` — find the branch/pool the guest booking used
- [ ] `/scheduling` — check the pool's availability patterns against what the guest actually saw as
      offered times (this exact mismatch class is what F-171 was)
- [ ] `/occupancy` — confirm the guest's booking shows up here, with correct status
- [ ] `/refunds` — if a cancellation happened, confirm it surfaces correctly here
- [ ] Cross-check: does anything the admin can toggle (pattern, hours, pricing) desync from what
      the guest side is currently showing without a refresh?

---

## Group 2 — Member attendance + Member admin management

**Setup** (admin side first, since a member group assignment must exist before attendance means
anything):
- [ ] `/assignments` (AssignmentsPage) — create a new `MemberGroupAssignment`, using the real
      pattern-derived time grid (F-171's fix) — confirm the create actually succeeds end-to-end,
      not just that the grid looks right
- [ ] Toggle days on/off while creating, confirm the grid updates and, on a day-combination with
      no shared time, confirm the empty-state banner and disabled create (F-171's G1 gap — this is
      the walkthrough's chance to close that verification gap for real, on the real screen)
- [ ] `/assignments` — edit/deactivate an existing assignment (`PATCH`), confirm it behaves as
      expected (this is the still-open PATCH carry-over — a real click here may resolve it faster
      than more code reading)

**Member side** (`apps/guest-member-pwa`) — resolved: this is **not** a separate route. Member
attendance is a section (`renderMemberSessionCard`, the "Today's Member Session" card) embedded
directly inside `MainDashboard` at `/` — the same screen Group 1's first guest-side stop already
covers. There is no dedicated `/member` or `/attendance` route.
- [ ] Sign in as a member with an active assignment, land on `/`, confirm the "Today's Member
      Session" card shows correctly (window time, pool name)
- [ ] Confirm attendance via the card's action (`POST /slot-engine/member/today-assignment/confirm`),
      at/near the actual session start time if feasible
- [ ] Try confirming attendance **outside** the valid window — see what actually happens, don't
      assume it's blocked correctly
- [ ] Sign in as a member with **no** active assignment, confirm the card's empty/absent state on
      the dashboard reads clearly rather than looking broken

**Admin side, attendance view:**
- [ ] `/occupancy` → Member Attendance section — confirm the member's session and status show
      correctly, cross-check status pill against what actually happened on the member side
- [ ] Look at a member with **no** assignment, and one with an assignment but no session today —
      confirm both empty/non-cases read clearly, not just the happy path

---

## Group 3 — Branch management

- [ ] `/resources` — full branch list, general read
- [ ] `/resources/new` (OnboardingWizardPage) — onboard a fresh throwaway branch end-to-end,
      start to finish, without skipping steps
- [ ] `/scheduling` — set up availability patterns for the new branch's pool(s) from scratch
- [ ] `/negotiated` — if this branch/pool has negotiated-rate scenarios, walk one through
- [ ] Cross-check: does the freshly onboarded branch actually work on the **guest side**
      immediately (Group 1's flow), with no manual step you had to remember to do?
- [ ] Deactivate/archive something (a pool, a pattern) that has live bookings against it — see
      what actually happens, don't assume it's guarded correctly

---

## After each session

- Compile the noticed-but-undiagnosed list, described not numbered, bring to this thread
- Note anything that took *longer than expected* even if nothing broke — friction that doesn't
  error is still friction, and it's exactly the Type 2 class Option B's code sweep can't find
- Flag any screen or flow you expected to exist and didn't find
