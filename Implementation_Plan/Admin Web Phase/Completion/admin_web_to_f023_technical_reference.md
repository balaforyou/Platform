# Admin Web Through F-023 Technical Reference

**Date written:** 1 Aug 2026  
**Source basis:** git history from `f5910901ac3e3d78072bb1214aeb905811353d4c` through `1f8071b489d16db4fb0b24616dac861e0990cbc9`, cross-checked against current code.  
**Purpose:** preserve the implementation plans, decisions, and walkthrough evidence that previously existed only in chat for the Admin Web phase, polish round, F-022, and F-023.

## Commit Range

| Commit | Scope |
| --- | --- |
| `f5910901ac3e3d78072bb1214aeb905811353d4c` | Admin Web initial implementation, Branch/Resource Step 1 save feedback, scaffolding for later screens, backend prerequisites, Caddy/Admin Web setup |
| `e4f54880ad1b3d5724f69b545c9303b0a073f4dc` | Assignments and Negotiated selectors, Identity phone lookup, seed extensions, JWT secret fix |
| `87baabab90251b3a6e9afccd0131df9996ab3cfd` | Refunds and Low Occupancy implementation, admin booking listing, low-occupancy release conflict guard, seed extensions |
| `60b2c89935515b4a4a53f65ac5ebac16aea8c08a` | Resource Pool display-label humanization |
| `0f56709e4076ad6e33359312c6b3d6aa218cd2e7` | Assignment aligned time-slot picker closing F-010 UI gap |
| `dca167364a67c5afc321a06113c4cb1302020c44` | Refunds empty-state and phone max-length polish |
| `138dc87b7785084b0b3eea5e680918e66a589616` | Responsive layout fixes |
| `9447fe58159b536f75da86b775d6c68347246cdf` | Caddy bare `/admin` route fix |
| `8df0098dfa5fe76da59e889657cda406e81fe5b8` | Mobile collapsible Admin Web navigation drawer |
| `f49c3fefab71144f1f18c0ba2477700e9b7118f1` | F-022 member self-confirm attendance |
| `1f8071b489d16db4fb0b24616dac861e0990cbc9` | F-023 cross-system integration test |

## Admin Web Phase, Step 1: Branch/Resource Config

### Technical Approach

The Admin Web console was implemented as a Vite/React operational UI under `apps/admin-web`, fronted in development by Caddy at `/admin*`. The initial implementation lives largely in `apps/admin-web/src/main.tsx`, with global screen styling in `apps/admin-web/src/styles.css`.

Key code references:

- `apps/admin-web/src/main.tsx:325` - shared `Shell()` layout for authenticated admin routes.
- `apps/admin-web/src/main.tsx:488` - `MutationFeedback`, the shared mutation feedback component introduced after Step 1 exposed silent saves.
- `apps/admin-web/src/main.tsx:601`, `:618`, `:625` - Branch Schedule, Resource Pool, and Booking Rule mutation feedback usage.
- `services/slot-engine/src/index.ts:406` - `PATCH /resource-pools/:id`.
- `services/slot-engine/src/index.ts:763` - `PUT /resource-pools/:id/booking-rule`.
- `Caddyfile:6` and `Caddyfile:11` - Admin Web dev proxy route to Vite port 5174.

Step 1 verified Branch Schedule and Resource Pool config using real browser saves, reloads, and server refetches. The admin UI now keeps form state controlled, submits real changed values, shows loading/success/error feedback, and refetches persisted data after mutations.

### Challenges and Root Causes

Two distinct save problems were found:

1. **Branch Schedule did not send a request.** Root cause: form state did not reflect the real loaded values, so validation/submission blocked before a network request fired.
2. **Resource Pool save succeeded but looked silent.** Root cause: the request did fire and persisted, but there was no mutation-state feedback pattern, so the UI gave no success/error signal.

The fix was intentionally split: controlled-value repair for Branch Schedule, and a shared `MutationFeedback` pattern for mutations so later screens did not each invent their own feedback behavior.

### Design Decisions

- Client validation catches obvious input quality issues, but server endpoints remain authoritative for tenant/branch scope and persisted values.
- Resource/rule config accepted last-write-wins for MVP admin configuration because these are low-frequency operational screens, not high-contention guest booking paths. The UI refetches after save rather than adding broad stale-write handling here.
- F-017 was recorded because all Admin Web screens live in one large `main.tsx`; commits were kept scoped through selective staging instead of using this phase to perform a risky file split.

## Admin Web Phase, Step 2: Assignments and Negotiated Booking

### Technical Approach

Assignments and Negotiated stopped using raw ID text boxes and moved to selectors/search flows:

- Branch and Resource Pool selectors reuse the branch/resource-pool data that Resources already loads.
- Assignments use phone lookup, branch/pool selectors, day-of-week selection, and a recurring `startTime`.
- Negotiated uses phone lookup, branch/pool selectors, date plus real availability windows, and submits through a dedicated Payment Service orchestration endpoint.

Key code references:

- `apps/admin-web/src/main.tsx:633` - `AssignmentsPage()`.
- `apps/admin-web/src/main.tsx:663` - assignment listing via `/slot-engine/member-group-assignments`.
- `apps/admin-web/src/main.tsx:669` - assignment create mutation.
- `apps/admin-web/src/main.tsx:833` - `NegotiatedPage()`.
- `apps/admin-web/src/main.tsx:904` - negotiated mutation feedback.
- `services/identity-auth/src/index.ts` - phone lookup endpoint added for admin workflows.
- `services/payment/src/index.ts:844` - `POST /payment-links/negotiated`.
- `services/payment/src/index.ts:657` - shared payment-link creation helper used by both legacy and negotiated flows.
- `services/slot-engine/src/index.ts:1650` - browser-callable member assignment listing.
- `services/slot-engine/src/index.ts:1158` - `POST /bookings/negotiated`.

The dedicated `POST /payment-links/negotiated` endpoint keeps the legacy `/payment-links` contract unchanged. It accepts the browser request under JWT/admin trust, calls Slot Engine's negotiated booking endpoint with the internal service key, then reuses the existing payment-link creation logic.

### Challenges and Root Causes

- The first plan incorrectly blurred time selection between Assignments and Negotiated. The actual backend contracts differ: assignment creation takes `daysOfWeek` plus `startTime`, while negotiated booking takes a concrete `windowId`. The implemented UI therefore uses two different controls.
- A proper phone lookup endpoint did not exist for Admin Web. This was new Identity surface, so it reused Identity's existing OTP phone normalization rather than a new ad hoc phone parser.
- The negotiated flow needed browser-retry idempotency. If Payment Service generated a fresh internal key per execution, browser retries could create duplicate bookings/payment links. The endpoint therefore persists and reuses the caller's `Idempotency-Key`.

### Design Decisions

- **Trust boundary:** separate endpoint per trust boundary. The browser calls Payment Service with JWT; Payment Service calls Slot Engine with `INTERNAL_SERVICE_KEY`.
- **Idempotency:** Admin Web supplies a logical `Idempotency-Key` for negotiated submissions. Payment Service checks for an existing intent/booking for that exact key before creating new work, matching the refund-override idempotency pattern.
- **PII minimization:** phone lookup returns only data needed for the workflow; it does not use raw ID entry as the primary UI.

## Admin Web Phase, Step 3: Refunds and Low Occupancy

### Technical Approach

Refunds became a phone-first lookup flow:

- Admin looks up a user by phone.
- Admin selects from that user's cancelled refundable bookings.
- UI shows calculated tiered refund preview.
- Override amount/reason/confirm controls are only active once a real booking is selected.
- Payment Service derives `overriddenBy` from the verified JWT; the client request body does not send `adminId` or `overriddenBy`.

Low Occupancy became a branch/pool/window operational screen:

- Admin selects branch and resource pool.
- UI displays occupancy percentage, configured threshold, cutoff context, and eligible windows.
- Release to guests sends `expectedUpdatedAt` with pricing data.
- Slot Engine performs optimistic concurrency with `updatedAt`.

Key code references:

- `apps/admin-web/src/main.tsx:792` through `:826` - Low Occupancy UI and release mutation feedback.
- `apps/admin-web/src/main.tsx:928` through `:984` - Refunds lookup/list/preview/override UI.
- `services/slot-engine/src/index.ts:582` - occupancy listing.
- `services/slot-engine/src/index.ts:641` - release-to-guests endpoint.
- `services/slot-engine/src/index.ts:658` - required `expectedUpdatedAt`.
- `services/slot-engine/src/index.ts:677` and `:705` - specific `WINDOW_ALREADY_RELEASED` conflict behavior.
- `services/payment/src/index.ts:946` - refund override endpoint.
- `apps/admin-web/tests/seed-admin-web-data.mjs` - repeatable Admin Web seed scenarios.

### Challenges and Root Causes

- Refunds originally risked becoming "type a booking UUID plus a lookup button," which would not solve the raw-ID UX problem. The final design instead starts from phone lookup, then booking selection.
- Low Occupancy's release endpoint originally had a plain read/update shape. That could not distinguish stale UI state from a valid release. The implemented guard requires `expectedUpdatedAt` and returns explicit conflict responses.
- The race case was refined to return a useful reason. If another admin already released the window, the second request returns `WINDOW_ALREADY_RELEASED`, not a generic conflict.
- The refund seed had to use the real cancel endpoint. Directly setting `Booking.status = CANCELLED` would have bypassed cancellation-flow fields and made refund preview evidence unrealistic.

### Design Decisions

- Use optimistic concurrency on `AvailabilityWindow.updatedAt`, requiring no schema change and detecting any change after the admin last fetched the row.
- Distinguish conflict causes where possible, especially "already released" versus "stale row changed."
- Keep refund audit identity server-derived from JWT. This is the same trust-boundary standard used for admin-only actions elsewhere.

## Admin Web Polish and Responsive Work

### Resource Pool Label Humanization

Commit `60b2c89935515b4a4a53f65ac5ebac16aea8c08a` changed only display labels, not payload keys or validation:

- `apps/admin-web/src/main.tsx:141` - `resourcePoolFieldLabels`.
- `apps/admin-web/src/main.tsx:611`, `:613`, `:619`, `:620` - labels applied in the Resource Pool form.

This closed the raw camelCase label issue without changing API contracts.

### Assignment Time-Slot Picker

Commit `0f56709e4076ad6e33359312c6b3d6aa218cd2e7` replaced native `<input type="time">` for Assignments with a tappable grid:

- `apps/admin-web/src/main.tsx:711` through `:724` - time-slot grid.
- `apps/admin-web/src/styles.css:390` through `:411` - time-slot styles.

The picker is generated from selected branch working hours and selected pool `minBookingDurationMinutes`, making unaligned values such as `11:11` structurally impossible in the UI. This closed the Admin Web side of F-010.

### Refunds Empty-State Polish

Commit `dca167364a67c5afc321a06113c4cb1302020c44` fixed two issues:

- Phone input now has `maxLength`, preventing unbounded digit entry before validation.
- Override amount/reason/issue controls are hidden/disabled until a booking is selected.

Relevant code:

- `apps/admin-web/src/main.tsx:952` - full-row empty state.
- `apps/admin-web/src/main.tsx:967` through `:979` - preview and issue controls rendered only after selection.

### Responsive Layout and Bare `/admin` Routing

Commit `138dc87b7785084b0b3eea5e680918e66a589616` improved narrow-screen layout in CSS. Commit `9447fe58159b536f75da86b775d6c68347246cdf` fixed the Admin Web root route through Caddy.

The root bug was real: Overview failed at `/admin?tenant=courtowner1` while named routes worked. Root cause was the bare `/admin` path hitting Admin Web without the trailing slash shape expected by the Vite/router setup. Caddy now rewrites exact `/admin` to `/admin/` while preserving query strings:

- `Caddyfile:6` through `:9` - `@adminRoot` matcher and rewrite.
- `Caddyfile:11` through `:13` - `/admin*` reverse proxy to port 5174.

### Mobile Collapsible Navigation

Commit `8df0098dfa5fe76da59e889657cda406e81fe5b8` added mobile-only collapse state to the shared Admin Web shell:

- `apps/admin-web/src/main.tsx:325` - shared `Shell()`.
- `apps/admin-web/src/main.tsx:330` - single shared `navItems` array.
- `apps/admin-web/src/main.tsx:338` - current section derived from active route.
- `apps/admin-web/src/main.tsx:371` through `:378` - mobile nav/topbar/drawer logic.
- `apps/admin-web/src/styles.css:560` onward - existing `@media (max-width: 820px)` reused.

Desktop stays on the existing sidebar. Below 820px, the sidebar collapses to a slim top bar with tenant mark, hamburger, and current section label. The drawer uses z-indexes resolved before implementation: top bar `100`, backdrop `110`, drawer `120`.

## F-017: `main.tsx` Scoped-Commit Friction

F-017 remains a process/maintainability finding, not a runtime defect. Admin Web's six screens, shell, route gating, API helpers, and many local types live in `apps/admin-web/src/main.tsx`, unlike the guest PWA's per-screen component split.

This caused repeated scoped-commit friction because unrelated verified/unverified screen changes often touched the same large file. The mitigation during this phase was disciplined selective staging and narrow commits, not refactoring the file mid-phase.

Future recommendation: split `main.tsx` by route/screen before the next broad Admin Web feature batch.

## F-022: Member Self-Confirm Attendance

### Technical Approach

F-022 added a member-facing way to see and confirm today's recurring assignment on the existing Guest/Member PWA dashboard, plus Slot Engine endpoints to support it.

Key code references:

- `apps/guest-member-pwa/src/main.tsx:124` - dashboard fetches `/slot-engine/member/today-assignment`.
- `apps/guest-member-pwa/src/main.tsx:152` - dashboard posts `/slot-engine/member/today-assignment/confirm`.
- `apps/guest-member-pwa/src/main.tsx:201` - confirmed attendance display.
- `services/slot-engine/src/index.ts:235` - deterministic `memberBookingIdempotencyKey`.
- `services/slot-engine/src/index.ts:301` - shared `ensureTodayMemberBooking` helper.
- `services/slot-engine/src/index.ts:1511` - `GET /member/today-assignment`.
- `services/slot-engine/src/index.ts:1533` - `POST /member/today-assignment/confirm`.
- `packages/database/prisma/schema.prisma:229` - `Booking.memberAttendanceConfirmedAt`.
- `packages/database/prisma/migrations/20260801090000_member_attendance_confirmed_at/migration.sql` - schema migration.
- `apps/guest-member-pwa/tests/member-self-confirm.spec.ts` - rendered-browser coverage.
- `services/slot-engine/src/concurrency.test.ts` - API trust/concurrency coverage.

The core helper, `ensureTodayMemberBooking`, is shared by both confirm and sweep. It locks the `AvailabilityWindow` row with `SELECT ... FOR UPDATE`, checks for an existing non-cancelled booking inside the transaction, and creates only if absent. It also catches Prisma unique races on the deterministic idempotency key and returns the existing booking if another trigger won first.

### Serious Design-Review Catch: Self-Defeating Sweep Bug

The most important issue caught before implementation was that the existing sweep could have defeated the new feature. Before F-022, the sweep auto-released unconfirmed member bookings after `gracePeriodMinutes`. If a member's own "I am coming" confirmation created a normal `CONFIRMED` member booking with no separate attendance marker, the later sweep would still see it as an unconfirmed member booking and change it to `RELEASED_NO_SHOW`.

That would have produced a dangerous false pass in shallow testing: the confirm button would work, the UI would show success, and the booking row would initially be `CONFIRMED`; only later would the sweep silently undo the member's attendance.

The fix was to add `memberAttendanceConfirmedAt` as an independent fact on `Booking`.

Current sweep protection:

- `services/slot-engine/src/index.ts:1755` through `:1761` finds only active member bookings where `memberAttendanceConfirmedAt: null`.
- `services/slot-engine/src/index.ts:1769` through `:1779` releases only those still-null rows.

This keeps two mechanisms separate:

1. The cutoff-time eligibility check gates whether confirmation may succeed at all.
2. `memberAttendanceConfirmedAt` protects the confirmed booking afterward from the sweep.

### Design Decisions

- **Deterministic idempotency key:** both confirm and sweep use `member-booking-{userId}-{windowId}-{date}`. The key describes the logical daily member booking, not which trigger created it. This is stronger than per-trigger keys such as `member-confirm-*` versus `sweep-*`.
- **Explicit cutoff business rule:** confirm checks `now >= resolution.cutoffTime` and returns `CONFIRMATION_CUTOFF_PASSED`. This avoids making correctness depend on which database transaction happens to win a race against the sweep.
- **Subscription status:** confirm requires an active subscription and returns `SUBSCRIPTION_INACTIVE` when absent/inactive. This matches the discovery rule that inactive subscriptions mean no future attendance should be created.
- **JWT-derived identity:** confirm derives `userId` and `tenantId` from the verified member JWT, never from client-supplied IDs.

### Verification

F-022 was verified through both rendered Playwright and Slot Engine concurrency tests. Evidence from the current test suite includes:

- `MEMBER_CONFIRM_EVIDENCE non_member_rejection` - non-member JWT rejected with `403 MEMBER_REQUIRED`.
- `MEMBER_CONFIRM_EVIDENCE authorized_success_spoof_ignored` - spoofed body ignored; booking user remains the JWT member.
- `MEMBER_CONFIRM_EVIDENCE no_session_today` - assignment exists but not for today's weekday.
- `MEMBER_CONFIRM_EVIDENCE subscription_inactive` - `409 SUBSCRIPTION_INACTIVE`.
- `MEMBER_CONFIRM_EVIDENCE cutoff_passed` - `409 CONFIRMATION_CUTOFF_PASSED`.
- `MEMBER_CONFIRM_EVIDENCE concurrent_double_confirm` - simultaneous confirms return one booking ID and `raceCount: 1`.

The Windows Prisma DLL lock issue also surfaced during closeout. Root cause: backend/dev Node processes can hold the Prisma query engine file on Windows while `packages/database` builds/copies Prisma client artifacts. The resolution was operational: stop running Node/Caddy service processes before `pnpm --filter @badminton/database run build`. Once processes were stopped, the database build passed with `Prisma Client copied to dist successfully.`

## F-023: Cross-System Integration Test

### Technical Approach

F-023 added a true end-to-end integration test across actors and services:

- Member with no session today sees a deliberate no-session dashboard state.
- Member A confirms today's recurring slot.
- Sweep runs after cutoff adjustment and does not release Member A because `memberAttendanceConfirmedAt` is set.
- Member B does not confirm.
- Sweep releases Member B as `RELEASED_NO_SHOW`.
- Admin sees low occupancy and releases the window to guests.
- Guest C, a distinct seeded `GUEST` identity, books the released slot.
- Payment mock capture confirms the booking.
- Guest C cancels through the real UI.
- Admin looks up Guest C by phone and submits refund override.

Key code references:

- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:11` through `:18` - fixed seeded actor IDs and phones.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:62` through `:63` - cleanup includes all F-023 users/phones.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:169` through `:172` - no-session member seeded on a different weekday.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:189` - full-system test.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:208` - no-session request/response logging.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:224` - member confirm request/response logging.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:245` - cutoff shift before real sweep.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:283` - unconfirmed member sweep logging.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:335` - guest booking request/response logging.
- `apps/guest-member-pwa/tests/f023-full-system.spec.ts:396` - refund override request/response logging.

### Challenges and Root Causes

- The first F-023 run exposed a seed timing problem: Member B's cutoff was still in the future, so the real sweep correctly did nothing. The fix was not to fake booking status, but to move booking-rule `gracePeriodMinutes` at scenario transition points so the actual sweep endpoint makes the decision.
- The guest route was initially assumed as `/book/:poolId`; the real route is `/branches/:branchId/book/:poolId`.
- The payment wait initially matched `/mock-capture`; the real endpoint is `/api/payment/payments/test/simulate-capture`.
- Guest C had to be a genuinely distinct actor, not only a separate browser context. The final seed gives Guest C fixed `userType: GUEST`, phone `+919866666666`, and ID `f023-guest-c`; the DB assertion verifies the confirmed guest booking's `userId` is Guest C and not Member A/B.

### Verification

Commit `1f8071b489d16db4fb0b24616dac861e0990cbc9` contains the new test file. The passing run logged:

- `F023_SEEDED_IDENTITIES` with admin, Member A, Member B, no-session member, and Guest C.
- `F023_REQUEST_RESPONSE member_no_session_today_get` with `state: NO_SESSION_TODAY`.
- `F023_REQUEST_RESPONSE member_confirm_post` with `requestBody: null`, proving no client user ID was submitted.
- `F023_DB scenario_a_after_sweep` showing Member A remained `CONFIRMED` with `memberAttendanceConfirmedAt`.
- `F023_DB scenario_b_after_sweep` showing Member B became `RELEASED_NO_SHOW`.
- `F023_REQUEST_RESPONSE guest_booking_post` showing Guest C's real booking request.
- `F023_DB guest_booking_after_payment` showing `userIsGuestC: true`, `notMemberA: true`, `notMemberB: true`.
- `F023_REQUEST_RESPONSE guest_refund_preview_get` and `guest_cancel_post`, proving cancel happened through the real UI before override.
- `F023_DB guest_booking_after_cancel` showing `status: CANCELLED`.
- `F023_REQUEST_RESPONSE admin_refund_override_post` showing the request body contains `bookingId`, `overrideAmount`, and `reason`, not `adminId` or `overriddenBy`.
- `F023_DB refund_after_override` showing `overriddenBy: f023-admin-owner`.

Screenshots generated by the passing F-023 run:

- `apps/guest-member-pwa/test-results/f023-member-no-session-dashboard.png`
- `apps/guest-member-pwa/test-results/f023-member-confirmed-dashboard.png`
- `apps/guest-member-pwa/test-results/f023-admin-low-occupancy-confirmed-seat.png`
- `apps/guest-member-pwa/test-results/f023-admin-low-occupancy-alert.png`
- `apps/guest-member-pwa/test-results/f023-guest-newly-available-slot.png`
- `apps/guest-member-pwa/test-results/f023-admin-refund-override-screen.png`

## Production Build and Local Dev Notes

The final verified build chain for this range included:

- `pnpm.cmd --filter @badminton/guest-member-pwa run typecheck`
- `pnpm.cmd --filter @badminton/admin-web run build`
- `pnpm.cmd --filter @badminton/slot-engine run build`
- `pnpm.cmd --filter @badminton/payment run build`
- `pnpm.cmd --filter @badminton/guest-member-pwa run build`
- `pnpm.cmd --filter @badminton/database run build`

The `packages/database` build must be run after stopping local Node/Caddy service processes on Windows if Prisma query engine files are locked. Successful expected output includes:

```text
Prisma Client copied to dist successfully.
$ tsc && node scripts/copy-client.js
```

The local full-stack dev setup expects:

- Slot Engine on `3001`
- Identity Auth on `3002`
- Tenant Management on `3003`
- Payment on `3004`
- Notification on `3005`
- Guest PWA Vite on `5173`
- Admin Web Vite on `5174`
- Caddy on `8080`

Caddy should be used for browser verification because it exercises the same `/api/*`, `/admin*`, and guest route behavior that caught the `/admin` root bug.

## Forward-Looking Notes

- F-017 remains open: split Admin Web screens out of `main.tsx` before the next large Admin Web phase.
- F-005 remains a business decision: do not silently invent a low-occupancy default where a real configured `BookingRule.lowOccupancyThresholdPct` is needed.
- F-023 is now covered by a committed browser integration test, but future GCP work should preserve the same Caddy/proxy-style path coverage rather than replacing it with service-only tests.
