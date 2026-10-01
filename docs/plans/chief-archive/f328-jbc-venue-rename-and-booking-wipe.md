# F-328 / F-329 — approved plan + Chief sign-off (archived per rule 12, 1 Oct 2026)

## Chief sign-off, 1 Oct 2026 (decisions and corrections absorbed)
- Wipe scope: guest bookings only (`isMemberBooking = false`); `--include-member-bookings` stays off.
- Pool names: "JBC Old Court - Main Courts" / "JBC New Court - Main Courts"; Old = "Japan Badminton Court, Coimbatore", New = "JBC – New Japan Badminton Court". Tenant and app name unchanged.
- Execution: dev and production steps run from Bala's machine and the GCP VM; Bala says go on each gate (0 dump, 1 production rename, 2 production wipe).
- Correction 1: court box — purely numeric label shows "Court: 6"; any other label shown unchanged, no prefix; no label hides the box.
- Correction 2: `guest_booking_reminder` dispatch rows match on `dedupKey = booking.id`, never `subjectId` (that is the user id); verify other jobs' key shapes from code.
- Correction 3: PaymentIntent delete covers chain parents and children (F-317); print matched and orphan counts.
- Correction 4: production delete is a single psql file under `nohup`, one transaction, no prompts, so a dropped tunnel rolls back.
- F-328 and F-329 assigned by Chief (see `docs/plans/pending-findings.md`).

## Plan as approved (Claude Code, 1 Oct 2026; superseded where the sign-off above differs)

# Plan — Home "Current Bookings" card redesign (Part A) + JBC venue rename and test-booking wipe (Part B / F-328)

No commit without explicit sign-off. Part B writes to the live database only after its own, separate approval gates (below).

## Environment limits found during investigation (decide before sign-off)
This cloud session has **no Docker daemon, no `.env`, no `DATABASE_URL`, and no route to the JBC production VM** (`curl` to jbc.elitecourts.duckdns.org returned 000). `psql` and `pg_dump` binaries exist. Consequences:
- Part A: I can typecheck and build here. Browser screenshots need the dev stack, which needs Postgres. I can try a local Postgres plus the stack, but "live dev stack" evidence as specified may need to come from Bala's machine. I'll report which evidence was produced where.
- Part B: the dump, the before/after counts, the delete and the read-back **cannot run from this session**. I'll deliver reviewed, parameterised scripts and the exact runbook. Bala (or a session with VM access) runs them on dev, then prod. Nothing is reported as "done on prod" without a pasted read-back.

## Part A — Current Bookings card (`apps/guest-member-pwa/src/main.tsx` ~618-690)

**Change:** the `upcomingSlots.slice(0,3).map` row body only.
- Top row: ~22px inline-SVG shuttlecock (`currentColor`, `--color-accent-700`), pool name (`displayPoolNameHome`, bold, `line-clamp-3`, no truncate), outlined status pill (same labels and `upcomingBadge()` styles).
- Time line: mono, indented under the name, time range only (`formatBranchTime(start)` – `formatBranchTime(end)`). Date no longer repeated.
- Bottom row: date badge (stacked WED / 30 / SEP from `formatBranchTime(b.window.startTime, tz, {weekday|day|month:'short'})`, so the start date in the branch timezone, never hardcoded), court box "Court: N" from `b.resource?.name` (box hidden if missing; see court-name note below), Directions icon (`hasCoordinates(about)` gate unchanged, F-247), Pay Now for HELD (same `Link`, same `pay-now-btn-${b.id}` id, F-242).
- Tokens only: `--color-neutral-*`, `--color-accent-*`, `--slot-almostfull-*`, `--color-accent-2-*`. Tap targets ≥ 44px (Directions and Pay Now get min-h/min-w 44px wrappers).
- Unchanged: fetch/dedup/sort/filter, empty state, error state, "View all", header, member card, Book button.

**Court-name note:** today the row prints `b.resource?.name` raw, so "Court: N" would double-prefix for "Court 1" and be wrong for JBC New ("Court A"). There is an existing `lib/courtLabel.ts` (`describeCourtAssignment`, used by `receipt.ts`) that also handles `courtSlotIndex`. I'll reuse it rather than concatenating strings, and will confirm its output format when I implement.

**Blast radius (rule 3a), verified by grep:**
- The ids `upcoming-slots-list`, `upcoming-slot-${id}`, `pay-now-btn-${id}`, `view-my-bookings-btn`, `upcoming-slots-view-all`, `upcoming-slots-empty`, `upcoming-slots-error` are all defined only in `main.tsx` (lines 584-692). `pay-now-btn-` is also in `BookingHistory.tsx:481` (a separate card, untouched).
- **No Playwright spec references any of these ids or the old "Sep 30 · …" row text.** The only spec hits are `#view-my-bookings-confirmation-btn` (a different element, on the confirmation page). All ids are kept regardless. I'll re-run `guest-booking`, `findings-verification`, `pwa-install-dismissal`, `member-self-confirm` and `f041-*` anyway, and compare against the documented e2e baseline (CLAUDE.md in the app dir says that suite is partly red already and time-of-day dependent).
- Consumers of `displayPoolNameHome`: only this file. `upcomingBadge` and `hasCoordinates` are shared with the same file or `BookingHistory`; I'm not changing them.

**Evidence:** typecheck and build clean (whole app); built-CSS grep of the new classes and tokens (no misspelled Tailwind token); screenshots light and dark × HELD, CONFIRMED, CHECKED_IN, long pool name at ~360px, no-coordinates branch, empty state. Frozen-transition trap: inject `* { transition:none !important }` before reading computed styles; check `background-image`, not just background-color.

## Part B — F-328: rename venues + wipe test bookings (separate commits, separate evidence, separate approvals)

### B1. Consumer sweep (rule 3a) — names are read **live**, never snapshotted, except notifications
| Consumer | Source | Notes |
|---|---|---|
| Venue switcher `VenueSwitcherSheet.tsx:73`, `BranchSelect.tsx:130` | live `branch.name` | picks up rename |
| Receipt PDF `lib/receipt.ts:29` ("Venue") | live `branchAbout.name` | new receipts show new name |
| Booking history `BookingHistory.tsx:374` | live `window.resourcePool.name` | |
| Home card `main.tsx` | live pool + branch, prefix-stripped | |
| Prefix strip: `displayPoolNameHome` (main.tsx), `displayPoolName` (`BranchBooking.tsx`), `normalizeDashes` (`CreateBatchForm.tsx`, F-282) | live | needs pool name to start with `"<branch> - "` |
| Admin: `admin-web/main.tsx`, `admin-v2 GuestOccupancyDashboard.tsx` | live | to check for hardcoded strings during implementation |
| slot-engine `index.ts` lines 970, 1106, 1138, 5168, 6930, 7006, 7145, 7214 (`resourcePoolName`/`poolName` in notification variables) | live at send time, **then stored** in `NotificationRequest.variables` | old rows are deleted by the wipe; new ones use the new name |
| tenant-management `index.ts:546` (`/branches/:id/about`) | live | |
| payment service | no name strings found in grep | to confirm for Razorpay description |

Hardcoded strings: only `scripts/tenants/jbc.json` and explanatory **comments** (`main.tsx:173,634`, `CreateBatchForm.tsx:18-22`, `slot-engine index.ts:699`). No code or spec fixture depends on the old names. The comments quoting the old names can be left as historical examples (flag only).

### B2. Write path — reuse existing APIs, no SQL for the rename
- Branch: `PATCH /branches/:id` (tenant-management, `{ name }`, owner JWT or internal key). `@@unique([tenantId, name])`, so collision is impossible with the two target names.
- Pool: `PATCH /resource-pools/:id` (slot-engine, accepts `name`; `validateResourcePoolFields`).
- Target names: branch "JBC Old Court", pool "JBC Old Court - Main Courts"; branch "JBC New Court", pool "JBC New Court - Main Courts" (plain hyphen, so the prefix strip keeps working, with the en dash no longer in play).
- Before/after: read-back via `GET /tenants/:id/branches?includeDraft=true` and `GET /branches/:id/resource-pools`, plus a direct `SELECT id,name FROM "Branch"/"ResourcePool"` where the tenant is `jbc`.
- Tenant name "Japan Badminton Court" and app name "JBC Courts" untouched.
- **Landmine found:** `scripts/provision-tenant.mjs` matches branches **by name** and its pool step is a plain POST (not idempotent). After the rename, re-running it against the old seed would create a second branch and a second pool. So `jbc.json` must be updated in the same PR (names above), and I'll note in the PR that a re-provision against an existing tenant already duplicates pools today (pre-existing; not fixing here, flag as a possible separate finding for Chief to number).
- `jbc.json` addresses are not renamed (only `name` fields change).

### B3. Booking wipe — derived from the real schema
Scope: JBC tenant, its two branches only. Table list and order (single transaction):
1. `Refund` where `paymentIntentId` in the JBC booking-linked intents (FK cascade from PaymentIntent exists, but delete explicitly so counts are printed)
2. `PaymentIntent` where `tenantId = jbc` and `purpose = 'guest_booking'` and `referenceId` in JBC booking ids (**not** `subscription_billing` rows)
3. `BookingPlayer` (cascades from Booking; counted explicitly)
4. `Booking` (children have `parentBookingId`, `onDelete: Cascade`; one `DELETE ... WHERE tenantId=jbc` covers parent and child chains; includes order-grouped rows via `orderId`)
5. `NotificationRequest` where `tenantId = jbc` and `variables->>'bookingId'` in the deleted ids **(to verify against real rows: whether every booking-linked event stores `bookingId`)**. Rows with no bookingId (e.g. low-occupancy alerts) are left alone and listed.
6. `ScheduledJobDispatch` where `jobName in ('payment_confirm_reconciliation','guest_booking_reminder', …)` and the `dedupKey`/`subjectId` equals a deleted booking id or its payment intent id. The slot-release reminder / low-occupancy / renewal dispatch rows are keyed to assignments, pools and branches, so they are kept.

Kept: users, `DeviceToken`, tenants, branches, pools, resources, windows, patterns, overrides, booking rules, groups, `MemberGroupAssignment`, `Subscription`, `ScheduledJob`, `WebhookEvent`, `AuthSession`. Windows keep their rows; occupancy is derived from `Booking` rows, so deleting bookings frees the capacity by itself (nothing to decrement). Stale HELD sweep: the sweep reads `Booking` by status, so no rows remain to sweep; the dispatch rows are removed in step 6 so nothing re-fires.

**Open question for Bala (member bookings):** `Booking.isMemberBooking = true` rows are generated from `MemberGroupAssignment` (batches) and drive the member session card and attendance calendar. "All booking rows" would wipe today's/upcoming member session rows along with the guest test bookings, and the batches (kept) would show no booked occupant for them until regenerated. **Recommend: delete guest bookings only (`isMemberBooking = false`) and leave member bookings**, unless Bala confirms the member rows are also test data. The script takes a `--include-member-bookings` flag defaulting to off, and the count report splits the two.

Safeguards, all in the script/runbook (`scripts/` one-off, read-only `--report` mode first):
1. `pg_dump -Fc` of the whole database first; report file path, size, and a `pg_restore --list` sanity check.
2. Per-table counts for the JBC tenant and for every other tenant (`courtowner1` etc.) before and after; the other tenants' counts must be identical.
3. One `BEGIN … COMMIT` transaction, with `ROLLBACK` if any post-delete assertion fails (other tenants unchanged, kept-table counts unchanged).
4. Dev database (`badminton_db`) first; **production only after Bala approves the plan and the counts.**
5. **Re-confirmation with Bala immediately before the production run** that nothing real has been booked since today (the report's `MAX(createdAt)` and Razorpay-live check go in front of him).
After the wipe: confirm `ScheduledJobDispatch` has no rows pointing at deleted bookings; empty-state of Current Bookings screenshot; one new booking under the new names, freshly downloaded receipt showing "JBC New/Old Court".

### B4. Sequencing
Commit 1: Part A (PR on its own). Commit 2: B2 rename (`jbc.json` + runbook; data change executed after approval gate 1, evidence attached). Commit 3: wipe script + runbook (executed only after gate 2, which is separate and irreversible without the dump). Part B can ship without Part A and vice versa.

### B5. Register / process items
- F-328: reviewer assigned the ID in the handover. `check-register.mjs` requires a `Confirmed-ID: F-328` entry in `docs/plans/pending-findings.md` (the reviewer supplies that content; I won't self-number). Log Open in `docs/findings_register.md` and `docs/plans/batch-log.md` in the same pass, and flip to Resolved only after the production read-back. Run `pnpm register:check`.
- Archive the approved plan to `docs/plans/chief-archive/f328-jbc-venue-rename-and-booking-wipe.md` (rule 12; the reviewer pastes the source content; I'll use this approved plan if Bala prefers).
- Close-out report states finding ID, PR/commit and register status (rule 11); verify push on origin (rule 7).
- Branch: `claude/vigilant-cori-30c600`; draft PR after push.

## Verification (end to end)
`pnpm -r typecheck`, `pnpm -r build` (rebuild before testing, suites run from dist), `pnpm register:check`, `pnpm diagram:verify` if a tagged finding is touched, regression suite against `badminton_db_test` only (explicit `DATABASE_URL` per CLAUDE.md), Playwright specs listed above against `badminton_db_e2e`.

## Decisions I need from Bala
1. Member bookings in the wipe: guest only (recommended) or everything?
2. Evidence logistics: given no Docker/DB/prod access in this session, who runs the dev/prod steps and screenshots (Bala's machine or a VM-access session)?
3. Pool names: confirm "JBC Old Court - Main Courts" / "JBC New Court - Main Courts" (needed so the card still reads "Main Courts").
