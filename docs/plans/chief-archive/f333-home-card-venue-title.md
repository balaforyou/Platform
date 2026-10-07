# Claude Code handover — F-333: venue name becomes the Home "Current Bookings" card title (Option A)

Date: 7 Oct 2026 · Reviewer: Chief · Founder: Bala · Status: Bala approved the mockup; **plan first, no commit without sign-off.**

## Source of truth for the visual
The approved mockup is in the Project: `claude/f333-card-mockup.html` (open in a browser; "Toggle dark" switches theme). Left column = live today, right column = proposed. Match the right column. Where this note and the mockup disagree, the mockup wins; tell Chief about the disagreement.

## Finding
**F-333 (Low)**, assigned by Chief. Add a `Confirmed-ID` entry in `docs/plans/pending-findings.md` and an Open register row. Text: "On the Home Current Bookings card the title is the pool name stripped of its venue prefix ('Main Courts'), which Bala does not want shown; the venue name becomes the title and the pool name is dropped from the card. Found 5 Oct 2026 on Bala's device while checking F-331." Do not reopen F-331 (resolved on Bala's device evidence, 5 Oct). Separate branch off `main`, separate draft PR, separate from the docs PR #131.

## The change (Option A, decided by Bala)
File: `apps/guest-member-pwa/src/main.tsx`, the card in `MainDashboard()`.
1. Title = `branchAboutById[b.branchId]?.name` (the booking's OWN branch), next to the shuttlecock, same typography as today's title (15px, bold, heading font).
2. Remove the pool-name title and `displayPoolNameHome` usage; remove the F-331 MapPin venue line (the venue is now the title).
3. Time line, date badge, court box, Pay Now (HELD), Directions, status pill: unchanged, same positions.
4. Long names: wrap to **two lines max**, then truncate with an ellipsis; `title` attribute with the full name. Pill and court box must never be pushed or clipped (mockup 3rd card, "Coimbatore Main Arena and Sports Academy, Race Course Road").
5. While the branch fetch is pending: do not show a blank or wrong title. Fall back to the stripped pool name (current behaviour) until `about?.name` resolves, and avoid a visible height jump (F-331 measured an 18px jump when a line appeared late; here the title is always one line at minimum, so the jump should be at most one extra line only for long names — measure with a slowed `/about` and report).
6. Dead code: grep every caller of `displayPoolNameHome`. If main.tsx line ~679 was the only one, delete the function and its import. Report the grep.
7. Test ids: F-331 added `data-testid="upcoming-venue-name"`. Decide whether to keep it on the new title or remove it; grep Playwright/unit tests for it and the old title text; update any that reference them. Keep `upcoming-date-badge`, `upcoming-court-*`, `pay-now-btn-*` as they are.

## Blast radius (rule 4: check callers, don't assume)
BookingHistory, BookingConfirmation, receipt.ts and the Pay screens must not change; confirm none depend on this card's title or on the removed line. Other tenants: the change is generic (single-branch tenants such as `courtowner1` show their own venue name).

## Verification (rule 8: real evidence, screenshots to Chief)
- Dev stack, JBC with both venues on two cards, and `courtowner1` with a booking of its own; light and dark.
- A long venue name at 360px (two-line clamp + ellipsis; pill and court box intact).
- Slowed `/about` (loading fallback, height jump measured).
- Contrast of the new title (light and dark, ≥ 4.5:1), typecheck, build, unit tests, `pnpm register:check` if the register is touched.

## Process
Plan-mode first: send Chief the plan (files, grep results, fallback choice, test-id decision), wait for sign-off. Then implement on a new branch, open a **draft** PR, paste CI results and screenshots; Chief diffs before it is marked ready. Merge, `promote.sh <merged SHA>` and the production check each need Bala's explicit go.

## Also report (not part of F-333)
Where PR #131 (docs: F-328 close-out, F-325/326/327/330/331/332, PR #128 correction) stands, and move F-331 to Resolved on Bala's 5 Oct device screenshot (JBC New Court line visible on a real production booking) in #131 or a one-line follow-up.
