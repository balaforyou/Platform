# Claude Code handover — F-325 re-scoped: hide the guest "I'm Here" check-in (Option B)

Date: 8 Oct 2026 · Decision: Bala · Reviewer: Chief · **Plan first; no commit or push without Bala's explicit go.**

## Decision (Bala)
Hide the guest "I'm Here" affordance for now: no business logic is attached to check-in. Option B: gate it behind ONE named constant (e.g. `SHOW_CHECK_IN = false`) so bringing it back is a one-line change. If the repo already has a feature-flag precedent, reuse it (rule 3). Hide the guest button only: do not touch the admin app or the backend.

## Branch / PR
Own branch off `main`, own draft PR. Separate from #131 (docs) and #132 (F-333). It may ship in the same `promote.sh` as #132 once both are reviewed and merged; each PR is reviewed on its own.

## Plan must cover (send Chief the plan, then stop)
1. Every place the guest app renders "I'm Here" or calls check-in (`BookingHistory.tsx` `isCheckInOpen`, the Home card, `BookingConfirmation`, anywhere else), with the route each calls.
2. All callers of `/bookings/:id/check-in` across all services and both frontends (rule 4): admin-v2 staff check-in, reminders, reports. Report anything that depends on it.
3. Existing data: bookings already CHECKED_IN must still show their status pill; only the action is hidden.
4. Tests: grep Playwright and unit tests for "I'm Here" and the check-in test ids; update the ones that reference them.
5. Verification: dev-stack screenshots of History and Home with a booking in a state that used to show the button (same-day slot inside the old window), light and dark; typecheck and build; Sonar and Codacy by rule and file:line (report false positives to Chief, no suppressions). Do not paste images into the chat; put numbers/statements in the report and tell Bala where the screenshots are.
6. Register: a dated correction in F-325's Description column (never in Resolution/Impact): F-325 is re-scoped, not fixed; the guest button is hidden; the backend check-in still has no time gate (nothing in the guest app reaches it); reopen the UI side when check-in gets real logic. F-325 stays Open at Low. No new ID. Add the batch-log entry. `pnpm register:check` must pass.

## Out of scope
F-326 (push delivery) and F-327 (push deep link), the F-328 dump, the `*.localhost` observation.
