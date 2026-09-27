# F-240/241/242/243/245/246/247/248 batch — backfilled plan/design doc

**Backfill, not a correction.** This doc is being written 2026-09-25, after the fact. The batch itself shipped 18 Sep 2026 in PR #44 (`F-239 + F-240/241/242/243/245/246/247/248: guest-pwa production-deploy follow-up batch`, merged into `main`), and CLAUDE.md's requirement — a `claude/claude-code-plan-<slug>.md` alongside any fix carrying a real design decision — was not satisfied at the time. Nothing below is new work or a re-litigation of what was built; it reconstructs the plan/design record from the real saved plan-mode file (`witty-seeking-engelbart.md`, headed "F-240/241/242/243/245/246/247/248 batch — plan"), the register's Resolved rows for all eight findings, and the merged PR, cross-checked against each other. F-244 is absent from this numbering deliberately — it was excluded from this batch's scope for its own dedicated pass, not skipped by mistake.

## Status

All 8 findings — F-240, F-241, F-242, F-243, F-245, F-246, F-247, F-248 — are **Resolved** in `docs/findings_register.md` (rows 188–195), all delivered and merged via the single PR #44. That PR also carried F-239 (a separately reviewed/approved fix, superseding PR #43); this doc covers only the F-240–248 portion. PR #44 was independently reviewed by the Technical Lead thread against the pushed SHA before merge, and merged 2026-09-18T08:34:27Z.

## Origin

All eight findings surfaced live during F-235's production deploy round, in Bala's own hands-on verification of the deployed JBC guest flow (real bookings, real questions asked in the moment) — not from a code audit. The plan file records each finding re-verified directly against `main`@`11f7001` before any fix was written, per rule 8 ("check current state before trusting a finding's text"), with corrections noted where the original framing needed tightening.

## Context / what was found, by group

The batch's own plan groups the eight findings into three clusters by the file/subsystem they touch — this mirrors that structure rather than listing all eight flatly.

### Group A — Booking History / Cancel screen (F-241, F-243, F-245, F-246)

Four findings in `BookingHistory.tsx` and `CancelBookingModal.tsx`, all straightforward corrections once each root cause was located — no real design fork in this group.

- **F-241 + F-243** (fixed together, same root cause): `CancelBookingModal.tsx` never branched on `booking.status`, so a `HELD` (never-paid) booking's cancel flow showed the same refund-tier math and "your refund will be processed" copy as a real `CONFIRMED` cancel — technically harmless (`cancel-preview` does return `refundPercent: 100` for a `HELD` booking) but read as if money were being processed that was never taken. Mechanical fix: branch the modal on `status === 'HELD'` and show a plain "release the hold" confirmation instead, leaving the `CONFIRMED`/`CHECKED_IN` path byte-identical. No backend change needed.
- **F-245**: no guard anywhere rejected cancelling a booking whose slot had already started; the server only used `hoursBeforeSlot` to pick a refund tier, never to reject outright. A real caller check (rule 4) found `POST /bookings/:id/cancel` has exactly one production caller — the guest PWA's own Cancel Match button — so an outright `400` rejection was safe with nothing else to break.
- **F-246**: a UI placement/animation request (move the Directions icon to the header row, add a pulse) — checked first for an existing pulse/blink keyframe to reuse (rule 4) and found none, so one small new keyframe was added rather than invented unnecessarily.

None of these four needed an "alternative considered and rejected" — each was a located bug with one obvious correct fix.

### Group B — Dashboard (`main.tsx`) parity (F-242, F-247)

Two findings, both pure parity gaps between the Home/Dashboard preview card and `BookingHistory.tsx`'s already-correct equivalent card: no Pay Now action for a `HELD` row (F-242), no Directions link at all (F-247). Both fixed by porting the existing `BookingHistory.tsx` pattern (`pay-now-btn-${id}` convention, `hasCoordinates` helper) verbatim into `main.tsx`. Mechanical ports, not design decisions — the design already existed one file over.

### Group C — Guest identity: Google avatar/JWT claims (F-248)

This is the batch's one real design decision, and the investigation surfaced more than the finding as originally written.

**What F-248 named on its own:** the guest-pwa header (`Shell.tsx`'s account trigger) never showed a real name/photo for a Google-signed-in guest, always a static generic icon — unlike admin-v2, which already had this via F-219.

**What the investigation found underneath it, going one layer further than the handover it started from:**
1. `findOrCreateMemberUser` (`services/identity-auth/src/memberGoogleAuth.ts`) never captured Google's `name`/`picture` into `displayName`/`photoUrl` for a guest/member at all — neither the `create` nor the `existing`-user branch touched those columns. Only admin-v2's identity path had ever captured them (via F-219).
2. `/auth/google/verify` has no dev-token bypass to gate around (unlike the admin path, which needed one for F-219) — simpler than that precedent, just a plain presence check on `identity.name || identity.picture`.

**Two extra, genuinely new gaps found mid-investigation (not present in the originating handover), each described in the register/PR rather than silently folded in, per rule 9:**

- **Gap 1 — first-login flicker.** `/auth/refresh`'s JWT already carries `displayName`/`photoUrl` since F-219, and guest-pwa's `AuthContext` decodes the JWT generically, so a silent refresh would already surface real name/photo once the data existed. But `/auth/google/verify`'s own JWT sign call did **not** include those claims — so a fresh Google login would show the generic icon until the *next* silent refresh (boot or the 14-minute timer), the exact flicker F-219's own design was built to avoid. This was folded into F-248's fix as one of its "three real parts" (below), not filed as a separate finding — it is the same root cause (identity-claims plumbing) surfacing in the same investigation, not an adjacent-but-different issue.
- **Gap 2 — wrong field read in `AccountSheet.tsx`.** `AccountSheet.tsx:45` already rendered a name line, but read `user?.name` — F-229's admin-typed walk-in field — instead of `user?.displayName`, F-219/F-248's real Google field. A Google-signed-in guest was shown their email (the fallback when `.name` is unset), never their real Google name, in this exact spot. Also folded into F-248's fix rather than filed separately, on the same "same root cause, same file already in scope" basis (rule 9's same-root-cause exception, not scope creep).

**Real alternative considered and rejected:** the plan explicitly weighed treating F-248 as UI-only (just add an `Avatar` component reading whatever fields already existed) versus the backend+frontend scope actually chosen. The UI-only framing was rejected once investigation showed the underlying data was never captured for guests at all (part 1) and the JWT didn't carry it on first login (Gap 1) — an avatar component alone would have rendered nothing new for a fresh Google sign-in, only masking the real gap. The design chosen instead: fix the data capture at its root (`memberGoogleAuth.ts`), fix the claims-shape mismatch between the two JWT-issuing endpoints (`/auth/google/verify` vs `/auth/refresh`), then add the UI component as the last, now-meaningful step — mirroring `??`-merge semantics and the no-op-write optimization F-219 already established, rather than inventing a new shape.

**Fix, three real parts** (as the plan and register both record): (1) `memberGoogleAuth.ts` sets `displayName`/`photoUrl` on `create`, and does a real `??`-merge update on the `existing` branch when Google supplies either field, avoiding a no-op write when it supplies neither; (2) `/auth/google/verify`'s JWT sign call gains `displayName`/`photoUrl`, matching `/auth/refresh`'s existing shape; (3) new `apps/guest-member-pwa/src/components/ui/Avatar.tsx` (img-with-fallback-to-initials, shape ported from admin-v2's own `Avatar.tsx` but using this app's own tokens — not a cross-app import), used by both `Shell.tsx`'s account trigger and `AccountSheet.tsx`'s header, with the corrected `displayName || name || email` fallback chain applied in both places.

## Blast-radius check (rule 3a), as stated in the plan

- **Playwright**: grepped for any spec referencing the Directions icon's DOM position or the account-trigger internals — zero matches. `guest-booking.spec.ts`'s `#refund-preview-display` assertion runs against a `CONFIRMED` booking with a slot ~1.9h in the future at cancel time — unaffected by both the new `HELD`-only branch and the new past-slot guard.
- **admin-web / admin-v2**: confirmed zero callers of `POST /bookings/:id/cancel` anywhere in either app — F-245's outright rejection was confirmed safe before being built, not assumed.
- **`memberGoogleAuth.test.ts`**: confirmed its existing fixture carries no `name`/`picture`, so the new merge-write branch does not fire against existing coverage; new test cases were added rather than leaving the new behavior untested.
- **No other consumer** of `findOrCreateMemberUser`, `Shell.tsx`, or `AccountSheet.tsx` beyond what this batch already touches.

## What was actually built

Synthesized from the register's per-finding Resolution text and the PR body, not a verbatim repeat of all eight rows:

- **F-241/F-243**: `CancelBookingModal.tsx` branches on a `HELD` status snapshot, showing plain hold-release copy with no refund numbers for `HELD`, refund-tier panel unchanged for `CONFIRMED`/`CHECKED_IN`. **A real second bug caught during this fix's own live-fire verification, not assumed from the plan**: `isHeld` computed live from the `booking` prop flipped to `CONFIRMED`'s copy mid-render because `onSuccess()` refreshed the list and changed the prop before the modal's success view re-rendered — fixed by snapshotting `isHeld` once at mount instead of deriving it live.
- **F-245**: `POST /bookings/:id/cancel` now rejects `400 SLOT_ALREADY_ENDED` once `new Date() >= booking.window.startTime`, checked before either status branch, leaving the booking's status untouched (not silently resolved to a 0%-tier `CANCELLED`); `BookingHistory.tsx`'s `isCancelable` hides the button client-side under the same condition. **A separate, non-blocking data-quality observation surfaced while building this test** (this dev branch's `Branch.timezone` is literally the string `"UTC"` rather than `"Asia/Kolkata"`, so displayed times are raw UTC instants) was flagged for Chief to assign an ID, not fixed here.
- **F-246**: Directions link moved to the header row next to the status badge; new `gpwa-directions-pulse` keyframe, `prefers-reduced-motion`-guarded. **A separate observation** (the icon's existing accent color measures ~2.9:1 contrast in dark mode, below WCAG AA's 3:1 for non-text UI) was flagged for Chief rather than fixed unilaterally — a pre-existing token choice, not a regression from this change.
- **F-242/F-247**: Dashboard preview card gained a working Pay Now link for `HELD` rows and a working Directions link, both ported verbatim from `BookingHistory.tsx`.
- **F-240**: `BookingHistory.tsx` gained a persistent "Receipt" button for `CONFIRMED`/`CHECKED_IN`/`CANCELLED` bookings, reusing the existing lazy-loaded `receipt.ts` functions (re-fetching a fresh `cancel-preview` first for the `CANCELLED` case so the printed refund matches the real resolved amount rather than a stale cached one). This closes out F-159, which had been left open pending exactly this persistent-access gap.
- **F-248**: as described in Group C above — data capture, JWT claims parity, and the new `Avatar.tsx` component with the corrected fallback chain in both `Shell.tsx` and `AccountSheet.tsx`.

Two further observations from this batch were explicitly **not** folded into any of the eight findings, and were routed through the Technical Lead thread instead, per the PR body: a dated corroborating note added to F-155 (the same `timezone: UTC` observation), and a new finding F-249 (Directions icon dark-mode contrast) opened for its own future pass.

## Verification — real evidence

- `tsc --noEmit` and full build clean for `guest-member-pwa`, `identity-auth`, and `slot-engine`.
- Real dev-stack live-fire for every finding, with real booking IDs read back against the database: a real `HELD` booking (`BK-D9F6820F`) showed the plain release-hold confirmation with no refund numbers; a real `CONFIRMED` booking (`BK-430244D5`) kept the refund-tier panel byte-identical; a real slot (`BK-D55CEE5B`) was booked and its real wall-clock start time was allowed to actually pass, then the Cancel Match button was confirmed gone (a real time crossing was used rather than a direct DB timestamp edit, which this session's own safety guard correctly refused against a shared resource); the Directions link's repositioning and pulse animation were checked in both light mode and emulated dark mode via computed style (`animationName: gpwa-directions-pulse` confirmed); a real `HELD` booking (`BK-DE88D00D`) showed a working Pay Now link on the real dashboard; a real `CONFIRMED` booking with real branch coordinates showed a working Directions link with the correct `destination=` query on the dashboard; a real Receipt download was exercised against `BK-430244D5` from `BookingHistory.tsx` with no prior confirmation-screen visit in the session, the specific persistent-access path F-240 was about.
- **F-248's verification was honestly scoped, not overstated**: real Google OAuth login cannot be performed from this sandbox (it needs Bala's own real account, per this project's standing operating rule), so F-248 was verified at the unit/code level instead — new `memberGoogleAuth.test.ts` cases (create persists real name/photo; existing-user real merge-update; existing-user no-op when Google supplies neither field) plus a direct diff confirming `/auth/google/verify`'s JWT sign call now matches `/auth/refresh`'s shape exactly.
- Full 5-service regression green post-rebuild (75/75, 15/15, 11/11, 20/20, 7/7), `pnpm register:check` and `pnpm diagram:verify` both green, and the whole PR independently re-reviewed by the Technical Lead thread against the pushed SHA before merge, per the PR body.

## Honesty note on this batch's mix

This batch is genuinely mixed, and this doc does not smooth that over: Group A (F-241/243/245/246) and Group B (F-242/247) are straightforward, single-cause bug fixes and file-to-file ports with no real design fork — they get no invented "alternatives considered" narrative here because none existed. Group C (F-248) is the one finding in this batch carrying an actual design decision (UI-only vs. fix-the-data-at-its-root, described above) plus two real gaps found mid-investigation, both explicitly named rather than silently absorbed.

## Sign-off

This batch is already merged (PR #44) and live in production, holding for a combined deploy with F-239 per Bala's standing call at the time. This document is a pure backfill and needs only doc-level sign-off — no further implementation, commit, or deploy action follows from it.
