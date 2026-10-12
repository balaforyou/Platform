# Admin v2 revamp — business discovery

**Status:** discovery complete, plan-mode only. Nothing implemented. **Revision 2 (12 Oct 2026):** Bala's
rulings recorded (Q1 / D1, Q5, batch shape). Committed as documents only.
**Date:** 12 Oct 2026. **Sources:** Bala's 8 Oct handover answers (Q1–Q8) and Chief's 12 Oct kickoff;
the mockup `docs/plans/chief-archive/admin-v2-combined-mockup.html`; read-only verification run against
the repo this session.
Filled from `docs/business_discovery_checklist_template.md`.

**No finding IDs are assigned or reserved here.** Labels `B1`–`B16`, `Q1`–`Q8` and `C-1`…`C-n` are
local to this document and the plan (`docs/plans/admin-v2-revamp-plan-mode.md`). They are not register
IDs; Chief assigns IDs per slice after the plan.

**What can and can't be claimed from this session.** No database or Docker was available (no `.env`,
no daemon), so nothing below was probed at runtime. Every "verified" is a **code read, a grep, or an
existing regression test's recorded behaviour** — per the template's own warning, a hypothesis for
anything about runtime behaviour. Where that matters it is marked **code-read only**.

---

## 1. The ask, in the business's own words

Bala asked for the admin PWA's **UI alone** to be revamped so it "streamlines the day-to-day operations
of a small badminton court", designed around his idea of the business. Owners typically have **1–3
branches (could be more)**; the hierarchy is **Owner, then n Managers**; the **manager is the front
desk** — a restricted view plus walk-ins, **not** a new role. What the owner checks weekly, in his order:
**court utilisation, collections, attendance by batch**. The target app is `apps/admin-v2`
(`apps/admin-web` is retired — see F-302 in `deploy/gcp-vm/Caddyfile`).

Scope after Chief's kickoff: **the full revamp before the client demo.** The demo date has not been
given yet.

### Business rules stated by Bala (B1–B16)

| # | Rule |
|---|---|
| B1 | The **owner** adds members (people reach out by desk / phone / WhatsApp). **Gmail and phone both mandatory.** The owner assigns an existing batch or creates a new one inline. No trial step. |
| B2 | A **batch** = a recurring 1-hour slot on selected weekdays on **1 to 4 courts — a mix: some batches use 1 court, bigger ones 2–4** (**ruled 12 Oct 2026**, replacing the earlier "one court" wording; a **courts-per-batch** setting is added); batches start on the **1st of a month**. Grouping shown Branch → time band (Morning < 12:00, Afternoon 12:00–16:00, Evening ≥ 16:00, **derived from start time**) → batch. |
| B3 | Fee is per member per month, **set per batch by the owner**; peak / non-peak reference values pre-fill and can be overridden (a group discount is just a lower rate). Quarterly / yearly: owner enters duration and amount; **no fixtures in code**. |
| B4 | Seats: min 4, max 8 (tenant default, per-batch override). Below min = owner warning only. |
| B5 | Dues due window **5th–10th, configurable**. The member pays from the **Pay button in the member app** from the start of the month until paid (gateway, like guest payment, **no cancel / refund of dues**). The owner can also record cash / UPI (UPI with reference). Part payments allowed; the **unpaid balance carries to next month**. |
| B6 | Overdue is a **flag only** — overdue members still attend; no auto-suspend. |
| B7 | **Deposit** (default amount, editable per member) collected with the first month; refunded **manually** by the owner (cash / UPI + reference), optional deduction with a note. |
| B8 | **Cancellation:** the member requests in the member app, **30 days' notice**; owner / manager notified; they check attendance, **phone the member**, then end or pause. The owner can waive the notice or adjust the shortfall against the deposit. |
| B9 | **Pause (holiday / break):** keeps the seat, pays nothing for the paused month(s), resumes by paying the next month. Owner or manager. |
| B10 | Renewal is **batch-level with a per-member untick**. Moving a member between batches is the owner's decision; the new rate applies from next month; history stays with the member. |
| B11 | **Attendance is read-only** to admin: members confirm their own attendance; no manual marking, no front-desk check-in. History is unlimited, grouped by month, with month stats and per-member history. Names first, phone one tap away. |
| B12 | **Attendance cutoff** becomes configurable (tenant default + per-batch override). **Low attendance** = fewer than 2 confirmed after cutoff → amber marker on the grid + "Add guest slot". |
| B13 | Owner's weekly view on **Today**, guest + member composed: court utilisation (member and guest hours separate), collections (member dues and guest revenue separate), attendance by batch. Per-branch revenue comparison is "nice to have". |
| B14 | Manager can: see Today / grid, take walk-ins, see **today's** collections (not history), view member attendance, call members, **pause or end** memberships. By default cannot: settings, pricing, dues / payment recording, batch create / edit, renewals, deposit refund. The owner can **grant** these per tenant later. |
| B15 | Grid cells stay **icon-only** (the F-252 decision). Guest name / payment only behind a tap. "Release to guests" is out for now. |
| B16 | Out of scope: guest passes, make-up sessions, gateway refunds of deposits, a stored parent-group hierarchy, Communications, Pricing & rules, Branch settings (untouched placeholders). |

### Final answers to Q1–Q8 (Bala, 12 Oct, via Chief)

| Q | Final answer | Caveat / what this session found |
|---|---|---|
| Q1 | **RULED 12 Oct 2026 (replaces the 8 Oct acceptance of "honour existing bookings"):** keep the signed "member contracts always win" rule (F-207.2 / F-207.3). **Create batch shows exactly which guest bookings will be relocated or refunded, and the owner confirms before creating.** | The 8 Oct wording conflicted with the signed rule (§3 row 9); Bala withdrew it after the verification. For a single-pool branch (JBC's provisioning) relocation is impossible, so the list is a refund list. The existing preview returns only a count, so a richer preview is needed (plan D13). |
| Q2 | **No grace** for quarterly / yearly terms: overdue the day the period starts. Monthly keeps the 5th–10th window. | Two definitions of "overdue" now exist; the server must own both (plan S4a). |
| Q3 | Accepted: "move now" changes the seat now; the new batch's rate applies from the next 1st. | Rates today have no billing effect (no dues ledger), so an effective-dated rate arrives with S4a. |
| Q4 | The renewal deadline is a **computed last day of the month**. "31 Oct" in the mockup is a placeholder. | Computed branch-local (precedent: `branchTime.ts`). |
| Q5 | **RULED 12 Oct 2026: strict "before".** Last day = request + 30 days (inclusive); a month is charged only if its 1st is strictly before the last day. A 2 Oct request gives a last day of 1 Nov and **November is not charged**. | The worked examples are now **normative test cases** (plan §3, T1–T14 + A1–A4). |
| Q6 | Accepted: a paused member holds the seat and counts toward seats; excluded from the attendance denominator. | Warning rule stated in §8 fork 6. |
| Q7 | **Walk-in only.** The manager can book a guest onto a low-attendance member slot **for that day**. The slot is **never shown to online guests**. | Online-guest exclusion already holds (§3 row 8). The walk-in path has **no member-collision guard** today (§3 row 8, C-4). The threshold rule differs from the existing release rule (§3 row 10). |
| Q8 | **Gmail mandatory** (and phone, per B1). | No route creates a member account from email + phone today (§3 row 14). |

---

## 2. Evidence anchor — is this grounded in something real?

**Mixed, and said plainly.**

- **Grounded (requirement):** JBC's real WhatsApp structure — "JBC Evening" community with 17+ named batch
  groups such as "JBC 7pm Batch Court 3" (`docs/discovery/f133_group_hierarchy.md` §2); a live customer
  (`jbc.elitecourts.duckdns.org`); real provisioning (`scripts/tenants/jbc.json`: one POOLED pool of 4
  courts at "JBC Old Court", 3 at "JBC New Court"). The batch, renewal, roster and attendance machinery
  was built from this (F-133 family, F-207 family, F-276).
- **Stated by Bala, no artefact seen in this repo (requirement per Bala, unverified by artefact):** the
  deposit, the 30-day notice, the 5th–10th due window, carried balances, the 4–8 seat range, pause for
  holidays, the owner-grants-manager-permissions model, the weekly view. **Recommendation:** before the
  money slices (S4a–S4c) are built, ask Bala for one real artefact per rule (a WhatsApp fee reminder, the
  notebook / sheet JBC tracks dues in, a real cancellation message). Those become the evidence anchor;
  without them these are preferences with a trusted source, not requirements with evidence.
- **Design preferences (not requirements):** the layout, the icon-only grid, bottom sheets on mobile,
  Today as a composed home. The mockup exists to settle these.

---

## 3. Does it already exist? — checked, not assumed

Method: reading the named files and running the named greps this session (no runtime probe possible).
Line numbers are from the working tree at `3b6533f`.

| # | Capability | What was run | Result | Verdict |
|---|---|---|---|---|
| 1 | Admin shell, nav, role-aware nav | `apps/admin-v2/src/screens/shell/nav.ts`, `AppShell.tsx`, `AppsOverflowScreen.tsx` | One `NAV_DESTINATIONS` list drives sidebar, bottom nav and `/apps`; filtered by **module entitlement only** (`filterByEntitlement`, F-206). No role filtering. Roles are in the JWT (`lib/claims.ts` → `AdminUser.roles`) and used ad hoc (`user?.roles?.includes('owner')`) in 5 settings screens. | **Partial** |
| 2 | Global branch / date context | `grep useBranches` across `apps/admin-v2/src` | Not a context: **9 screens** each call `useBranches()` and keep their own `useState` branch (`GuestSlotInventory`, `GuestOccupancyDashboard`, `LedgerScreen`, `GuestManagementScreen`, `GuestScheduler`, `PricingRates`, `WalkInBookingFlow`, `CreateBatchForm`, `RosterPanel`), plus `BranchSettingsScreen`'s own separate branch fetch (`branchSettings/queries.ts:36`). | **New** (a shared context) |
| 3 | Court grid + walk-in | `GuestSlotInventory.tsx`, `WalkInBookingFlow.tsx` | Court × hour grid with the icon vocabulary (7 cell types), tap-to-book, tap-through detail. `WalkInBookingFlow` is shared by Inventory, Dashboard and Guest Management → Reservations. Per **pool** (`?poolId=`), not per branch. | **Exists** (to be re-homed as Today) |
| 4 | Today composition (utilisation, collections, attendance) | `GuestOccupancyDashboard.tsx`; slot-engine `GET /branches/:id/guest-occupancy-dashboard` (index.ts:1516), `guest-month-summary` (:1804), `member-attendance` (:3206), `guest-ledger` (:2603) | Day-level, per branch, **guest-only** utilisation (`utilizationPercentage` = guest seats ÷ window capacity); `duesCollected` is actually the **sum of guest booking prices** (misnamed); member attendance for the next 2 hours; guest month summary. **No** member-hours vs guest-hours split, **no** week / month roll-up, **no** member dues, **no** attendance % per batch over a period. | **Partial** (see G12 in the plan) |
| 5 | Batches, roster, add / move / remove, renewal | `membersManagement/*`; slot-engine `POST /groups` (:6093), `GET /groups` (:6185), `GET /groups/expiring-renewals` (:6244), `GET /groups/:id/roster` (:6363), `POST/GET/PATCH /member-group-assignments` (:6420 / :6539 / :6615), `POST …/renew` (:6676) | Real and working (F-133 slices A–E). Batch term is **calendar-month aligned**; renewal is **all-or-nothing per batch** (`RenewalPanel` loops `POST …/renew`); "end" = `SUSPENDED` + `endDate = now`. | **Exists** (UI shape differs) |
| 6 | Per-member monthly dues, paid / due / overdue, carried balance | `grep -rniE "dueDay\|dueWindow\|MemberDue\|dues_ledger" schema.prisma services/*/src` (non-regression) | **No matches.** Only `Subscription {amount, frequency, status, mandateId}` (bookkeeping for Razorpay autopay; `payment` `POST /subscriptions`, `/webhooks/razorpay/autopay`). | **Genuinely new** |
| 7 | Deposit, pause, cancellation request / notice, min–max seats, manager permissions | `grep -rniE` for `deposit`, `pausedUntil\|'PAUSED'`, `cancellationRequest\|noticePeriod\|noticeDays`, `minMembers\|maxMembers\|minSeats\|BATCH_FULL`, `ManagerPermission\|permissionGrant` over `schema.prisma` + `services/*/src` (non-regression) | **No matches for any of the five.** | **Genuinely new** (each a search that would have found it) |
| 8 | Guest booking on a member-batch window | slot-engine `fetchMemberExclusionContext` (:3681), `collidesWithMemberAssignment` (:3709), `windowBookable` (:3726); `POST /bookings/negotiated` (:4914); payment `POST /bookings/manual` (:1158, `releaseGroupId` gate at :1236) | **Online guests:** never (a window is unbookable if any ACTIVE assignment covers that pool + weekday + start time; also hidden from the availability list). **Admin walk-in:** `/payment/bookings/manual` → `createHeldNegotiatedBooking` → slot-engine `/bookings/negotiated`, which checks **blocked windows and capacity only — no member-assignment collision check** ("by design" per the comments at slot-engine index.ts:2144 and payment index.ts:1229–1235). The only guard is the **F-276 `releaseGroupId`** path, which re-verifies release eligibility server-side. | **Exists partially**: the intended guard exists but is **opt-in** (C-4) |
| 8b | **Courts per batch** (the 12 Oct batch shape) | `grep -rn "courtsPerBatch\|courts_per\|courtCount"` over `schema.prisma` + `services/*/src` (non-regression) | **No matches** (the only `courtIds` hits are the grid's per-court booking placement). `Group` / `MemberGroupAssignment` carry `resourcePoolId` and no court; `memberBlocked` applies to **every court of the pool** (comment at index.ts:1246–1248, applied :1737). | **Genuinely new** (plan slice SB) |
| 9 | Guests booking ahead; what happens on collision | `GET /resource-pools/:id/availability` (:3796); `scanCollidingBookings` (:5934), `runMemberCollisionSweep` (:5975), `GET …/member-collision-preview` (:6065); `docs/discovery/discovery-admin-v2-slice2-guest-booking-mgmt.md` §"Priority" | Guest horizon = `BookingRule.guestOpenWindowDays` (code default **7**; JBC's provisioning has **7**). Creating a member assignment runs the sweep over today … today+7: each colliding booking is **relocated to a sibling POOLED pool at the same time, else cancelled with a full refund** (HELD ones cancelled outright). This is the **signed "member contracts always win" decision**, with an admin-facing preview (`{ scanned }`). | **Exists — and Bala has now ruled to keep it** (D1) |
| 10 | Low-attendance → guest placement | `computeGroupReleaseEligibility` (:1169; rule at :1238), `GET /groups/:id/release-eligibility` (:6389) | `eligible = now ≥ cutoffTime && no member is CONFIRMED`. i.e. **only when zero members confirmed**, not "fewer than 2". Callers: the dashboard (`computeBranchGuestDay`, :1573), the route, payment `/bookings/manual`, regression tests, and admin-v2 `GuestOccupancyDashboard` / `WalkInBookingFlow`. | **Exists partially** (threshold differs) |
| 11 | Attendance cutoff configurable | slot-engine :1116, :1204, :2041 (`gracePeriodMinutes`); `docs/plans/batch-log.md:4102` | Cutoff = the pool's `BookingRule.gracePeriodMinutes` (code fallback **30**). Settable via `POST /booking-rules` / `PUT /resource-pools/:id/booking-rule`, validated (F-061, F-068). JBC's value was **30 against a stated 60-minute policy and was corrected to 60 on both pools** (F-276 close-out). No admin-v2 screen; **no per-batch override**. | **Exists partially** |
| 12 | Server-side role enforcement | slot-engine `isAuthorizedForBranch` (:297), `requireOwnerOrInternal` (:305, used on pattern and resource-eligibility routes, F-225 / F-237), payment role checks (:686, :1006, :1106, :1218, :1451), tenant-management owner-gated routes | A real **owner-only precedent** exists (`requireOwnerOrInternal`). But every batch / member / assignment / release / manual-booking route admits **owner or the scoped branch manager** (`getInternalOrAdminAuth` + `requirePoolScope`). No notion of a grantable permission. | **Exists partially** (precedent yes, matrix no) |
| 13 | Managers admin | tenant-management `POST /tenants/:id/roles` (:595), `GET /users/:id/roles` (:921) | Assign exists. **No list-by-tenant and no revoke route found** (route-name search; not exhaustive). F-141's fix is present (`targetUser.tenantId !== id` check at :677). | **Partial** |
| 14 | Create a member from Gmail + phone | identity-auth `GET /users/lookup` (:130), `POST /users/walk-in` (:222), `PATCH /users/:id/type` (:1458); `memberGoogleAuth.ts` | Promote requires an **existing** account (found by email). `walk-in` creates a **phone + name** guest. Google sign-in does `findFirst({ OR: [googleId, email] })` within the tenant, so a **pre-created user with the right email would be matched on first sign-in**. | **Partial** (no create-by-email-and-phone route) |
| 15 | Member Pay button precedent | guest-member-pwa `BookingPay.tsx` (+ `lib/bookingPayLogic.ts`, F-309); payment `createIntentHandler` (:119), `createOrderHandler` (:226), `verifyPaymentHandler` (:324), `POST /webhooks/razorpay` (:437) | Intent → create-order → Razorpay checkout → verify + webhook. Both the webhook and verify-payment **assume `intent.referenceId` is a booking id** and call slot-engine `/bookings/:id/confirm`. `purpose` is written (`guest_booking`, `subscription_billing`) but never branched on. | **Exists** for bookings; a dues purpose needs a branch (S4b) |
| 16 | Notifications / push for admins | `apps/admin-v2/src/lib/firebase.ts` (`POST /notification/devices/register`), `AppShell` | Device registration and a service-worker `push` listener exist (F-197). **No trigger** for a cancellation request exists (none such entity). | **Partial** |

---

## 4. Reusability — is there a proven pattern here already?

Reuse is the default; each new thing names its precedent.

| New thing | Closest precedent | Fit |
|---|---|---|
| Role-aware nav | `filterByEntitlement` in `nav.ts` (F-206): a destination carries `module?`; add a sibling `roles?`, same single list | Fits exactly; keeps one source of truth for sidebar, bottom nav and `/apps` |
| Server-side owner-only | `requireOwnerOrInternal` (slot-engine :305), tenant-management `verifyTenantOwnerOrInternal` | Fits for the fixed matrix. **Does not** fit owner-grantable permissions — needs a small permission store |
| Walk-in onto a low-attendance member slot | **F-276** `releaseGroupId` + `computeGroupReleaseEligibility` re-verified server-side at write | Fits, with the threshold generalised (zero → fewer than N) and made **mandatory** for member-window placements |
| Batch-creation clash warning | F-207.3 `GET …/member-collision-preview` (cheap pre-hoc signal) | Fits for the guest-booking half; a **batch-vs-batch** clash check is new (C-1 changes what "clash" means) |
| Dues payment by member | F-309 / `BookingPay.tsx`: `createIntentHandler` ownership + `requireBookingOwnership` (F-045), idempotent intent reuse, `buildRazorpayPrefill` | Fits for the client; the **server must branch on `purpose`** |
| Owner-recorded cash / UPI | payment `POST /bookings/manual` (F-229): immediate-capture sequence, `cash_` / `upi_` `gatewayRef` prefixes, `Idempotency-Key`, `requirePaymentLinkAdmin` | Fits as the model for recording a dues payment (UPI reference required, same error code shape) |
| Share a pay link | payment `POST /payment-links` (:964) | Fits |
| Computed renewal deadline | `branchTime.ts` (`endOfNextCalendarMonthUtc` and friends), `computeExpiringBatchesByBranch` | Fits; add "last day of the current month, branch-local" |
| Dues / deposit entities | Self-defending migration `DO $$` blocks (F-067 `20260809120000_booking_rule_unique_per_pool_f067`, F-115 `20260815140000_role_assignment_unique_f115`) per `packages/database/CLAUDE.md` | Use for every new constraint / index |
| Mobile sheets / modals | admin-v2 `Modal.tsx` (Radix Dialog) and the **Radix `Presence` trap** (root `CLAUDE.md`) | Must follow the enter-only or hard-timeout-fallback rule |

---

## 5. Genericity — vertical-specific or a reusable capability?

**Not claiming a generic extraction.** The `packages/job-scheduler` bar (zero runtime deps, no vertical
vocabulary) is not met by this work and is not the aim. The honest position, per the root "core
principle":

- The **revamp UI** is badminton-vocabulary in labels but should take its nouns from the tenant's
  resource type where cheap (the mockup's "Court group" idea), so a second sports vertical needs no fork.
- The **new entities** (dues ledger, deposit, cancellation request, pause) should be named neutrally —
  the F-207 discovery already reframed Guest and Member allocations as one "Contract" concept. The plan
  keeps entity names free of "badminton", "court" and "batch" where the concept is a charge, a payment,
  a deposit or a notice.
- **Concrete second use case:** none yet in hand. The repo's other discovery briefs
  (`driver_rental_app_discovery_brief.md`, `tournament_module_api_spec.md`) are different verticals
  without recurring-membership billing, so no genericity claim beyond naming discipline is made.

---

## 6. Dependencies and blockers

Findings named by ID where they exist today; everything new is unnumbered until Chief assigns.

**Hard blockers (cannot start):**

- The **member-app Pay button** (S4b) cannot start before the **dues ledger** (S4a) exists — it needs
  something to pay against.
- **S4c** (pause, cancellation, deposit) cannot start before **S4a** (a pause waives dues; a deposit sits
  beside them) and needs the **S0 permission matrix** (refund is owner-only).
- **S3 and S4a manager-facing restrictions, and every manager-permission toggle**, are blocked on **S0**
  (server-side role enforcement) — Chief's rule.
- The **low-attendance "Add guest slot"** (S2) is blocked on the **walk-in guard decision** (C-4).

**Soft ordering preferences:**

- S1 before S2 before S3 (the shell and context first).
- **Decisions before S3 design is locked:** capacity accounting (§8 fork 2, Spike first) and the mix of
  courts per batch (§8 fork 3, **ruled**, which adds the new backend slice **SB** that S2 and S3 now depend on).
  Fork 1 (collision policy) is **ruled**.
- Existing findings that touch the same code and were not re-opened here: F-133 family (batch /
  roster / renewal), F-207.x (collision / term), F-276 (release), F-252 / F-256 (grid), F-206 (module
  gating), F-141 (resolved, verified present), F-225 / F-237 (owner-only precedent), F-309 / F-045
  (payment pattern), F-229 / F-230 (manual booking), F-302 (admin-web retired).

---

## 7. Data reality

Three things kept apart, per the template:

| Data | Schema supports it | Something writes it | Enough real history |
|---|---|---|---|
| Batches (`Group`), assignments, terms | Yes | Yes (F-133 slices) | **Indirect evidence only:** the F-328 pre-wipe dump taken on the VM on 1 Oct 2026 (`docs/plans/chief-archive/f328-dev-rehearsal/row-counts-orig-vs-restored.txt`) shows **`Group` 0 and `MemberGroupAssignment` 0** — no live batches or members then. Eleven days old; **confirm with Bala** whether any exist today |
| Member attendance confirmations | Yes (`Booking.isMemberBooking`, `memberAttendanceConfirmedAt`, `…DeclinedAt`) | Yes (member app confirm / sweep release) | Depends on how long members have used the app; **unlimited history view needs a window query per batch per date today** (`GET /groups/:id/roster?date=`) |
| Per-member dues, payments, balances | **No** | **No** | **None.** "Dashboard shows all members overdue" (Bala, 6) has no data until S4a. A one-time **opening-balances import** is only needed if live members exist (the 1 Oct counts suggest none) |
| `Subscription` rows (the attendance-confirm gate) | Yes | **Nothing in apps or scripts** (`POST /payment/subscriptions` is internal-key only, no caller, F-293; the autopay webhook only updates an existing row) | **1 row** in the 1 Oct dump, its `subscription_billing` intent looking seeded. **How production members get one is a question for Bala** |
| Deposit, pause, cancellation | **No** | **No** | None |
| Guest revenue per branch | Per booking `price`; per pool `guest-ledger`; per branch `guest-month-summary` | Yes | Yes (live since F-229); a per-branch rollup across **months** is a read query, not a model change |
| Court utilisation (member + guest hours) | Derivable from windows + bookings | n/a (read-only) | Derivable; **no endpoint** produces the member-hours side |
| Cutoff / grace per pool | Yes (`BookingRule.gracePeriodMinutes`) | Yes (provisioning; F-276 data fix) | JBC corrected to 60 — **production value not re-read this session** |

---

## 8. Real design questions to settle before build

The genuine forks. Forks 1–3 were **discovered by this verification** and are the most consequential.

**Fork 1 — Q1: honour existing guest bookings, or keep "member contracts always win"? — RULED 12 Oct 2026: keep the signed rule; show the exact affected bookings and require the owner's confirm (plan D1 / D13). The text below is the history of the question.**
Bala's accepted answer is to honour them. The signed Slice-2 decision, F-207.2 and F-207.3 do the
opposite: creating the first assignment relocates or cancels-and-refunds every colliding guest booking
in today … today+7 and shows the admin a preview. Options:
(A) keep the behaviour, surface its preview in Create batch (zero backend change; the mockup's amber
note changes to "N guest bookings will be moved or refunded");
(B) honour — change `runMemberCollisionSweep` to skip bookings already confirmed on a date, and settle
what then happens on that day: the grid draws `member-blocked` **before** it checks for a guest booking
(index.ts:1737), so an honoured booking would be **invisible on the grid**; the member's own confirm can
hit `MEMBER_SLOT_AT_CAPACITY` if the guest holds a seat (index.ts:2152); the attendance denominator and
the "fewer than N confirmed" rule still need defining.
**Needs Chief and Bala: reconcile Q1 with the signed rule before S3.**

**Fork 2 — capacity accounting (code-read only).** A confirmed member attendance creates a real `Booking`
(`isMemberBooking: true`) that counts against the window's capacity, and the guard refuses once
`activeOccupants.length >= matchingWindow.capacity` (index.ts:2152). JBC's windows have capacity **4**
(pool capacity = court count; `scripts/tenants/jbc.json`). Bala's batches hold up to **8**. Read literally,
the **5th** member to confirm in an 8-member batch — or the 2nd batch at the same hour — would get 409.
Regression fixtures sidestep this by creating pools with capacity 8
(`member-multi-batch-attendance.regression.ts:40`). **Not probed at runtime. A live probe against
`badminton_db_test` is the first act of any S3 work**, before anything about batch size is built.

**Fork 3 — batches are pool-level; the business needs a per-batch court footprint. — RULED 12 Oct 2026: a batch is a mix (1 court; bigger ones 2–4); add courts-per-batch; new backend slice SB (plan D3 / D11 / D12). The text below is the history of the question and still describes today's backend.** `Group` and
`MemberGroupAssignment` carry a `resourcePoolId`, **not** a court. `memberBlocked` is computed per pool +
start instant and **applies to every court of the pool** (comment at index.ts:1246–1248; applied at :1737). In JBC's single
4-court pool a 7 PM batch blocks guests from **all four courts** at 7 PM; the grid would show every court
locked. The mockup draws one court locked and the rest open. Options: (A) accept pool-level and redraw the
UI honestly (the batch card says "pool, 7 PM", the grid locks the row); (B) make batches court-level
(touches the exclusion context, `windowBookable`, the sweep, the grid, capacity — a large backend change).
**This is the biggest unresolved scope question.**

**Fork 4 — Q7: what rule gates a manager's guest placement?** The existing guard allows it only when
**zero** members confirmed. Bala wants "fewer than a threshold". Whatever the threshold, the guard must
be **server-side and mandatory** for any placement on a member window (C-4). Define: threshold source
(RULES: tenant default + per-batch override), whether it counts members only or also paused, and whether
the placement is allowed only after cutoff (mockup: yes).

**Fork 5 — Q5 worked notice examples. — RULED 12 Oct 2026: strict "before"; the examples are normative test cases in plan §3 (T1–T14).** Rule as the mockup states it: last day = request date + 30 days;
the member pays any later calendar month whose **1st is strictly before the last day**; no pro-rating.

| Request | Last day | Months charged after the request month — strict (`<`, mockup) | If the 1st may equal the last day (`≤`) |
|---|---|---|---|
| Thu 1 Oct 2026 | Sat 31 Oct | none | none |
| Fri 2 Oct 2026 | Sun 1 Nov | **none** | **Nov** |
| Mon 5 Oct 2026 | Wed 4 Nov | Nov | Nov |
| Thu 15 Oct 2026 | Sat 14 Nov | Nov | Nov |
| Sat 31 Oct 2026 | Mon 30 Nov | Nov | Nov |
| Sun 1 Nov 2026 | Tue 1 Dec | **none** | **Dec** |
| Sat 2 Jan 2027 | Mon 1 Feb | **none** | **Feb** |
| Sat 30 Jan 2027 | Mon 1 Mar | Feb | **Feb, Mar** |

**Ruling needed from Bala:** when the last day *is* the 1st of a month (rows 2, 6, 7, 8), does the member
attend that day free (strict) or owe that month (inclusive)? The strict reading also means **a request on
the 5th costs a full next month** for four days of notice running into it — the owner's waive-or-adjust
lever (B8) exists for exactly this. Also needs saying: "last day" is **inclusive** (they can attend on
it), and the server needs a **scheduled end date**, which does not exist (today "end" = `endDate = now`).

**Fork 6 — Q6: can a pause push a batch below the seat minimum, and what warns?** Under the accepted rule
a paused member **holds the seat**, so **pause never changes seats held and can never push seats below
the minimum**. Proposed warning rule:
- **Seats held** = active + on-notice + paused. The min / max limits and the "below minimum" warning use
  seats held, evaluated live and at each month boundary. A batch with **zero** members is "no members yet",
  not a below-minimum warning.
- A separate **attending** figure = seats held minus paused. When it is below the minimum, show a soft
  note on the batch and in Today's follow-ups ("only N attending, M paused"). **It never blocks** a pause,
  a move or an end.
- Ending a membership (the notice's last day reached) reduces seats held and **can** trigger the
  below-minimum warning.
Min / max are **not enforced anywhere today** (§3 row 7), so "max 8" must also become a server-side
refusal on add / move, not only a UI disable.

**Fork 7 — the attendance-history shape.** Unlimited look-back, per batch and per member, grouped by
month, with month stats. The existing read is one roster per batch per date. A monthly aggregate endpoint
is needed, with pagination for long-running batches (plan S3).

**Fork 8 — the manager permission store.** Fixed matrix (owner-only list) plus owner-grantable toggles.
Granularity (per capability, per branch, per manager?) and where it lives (tenant-management beside
`RoleAssignment`) need a decision at S0.

---

## 9. Scope verdict

**Neither a UI addition nor a new view over existing data — a mix, and the proportions matter.**

- **Pure UI (S1, most of S2, the read parts of S3):** the role-aware shell, global branch / date context,
  the merged Today grid, member list / profile, roster and create-batch forms over **existing**
  endpoints, plus two new frontend components for the grid (laptop and mobile are separate code in
  admin-v2) sharing one cell model.
- **New views over existing data needing new read endpoints:** Today's composition (member-hours
  utilisation, multi-day attendance and collections roll-ups), unlimited attendance history.
- **New data modelling and new server rules (the heavy, risky part):** the dues ledger and overdue rule
  (S4a), member Pay button server branch (S4b), pause / cancellation request / deposit (S4c),
  per-batch cutoff override and manager permission store (S0 / S5), min–max seat enforcement, create-batch
  clash check, member creation from Gmail + phone, a server-enforced guard on guest placement onto member
  slots.
- **Three structural facts could resize all of it** (§8 forks 1–3): the collision policy that already
  exists, member capacity accounting against pool capacity, and pool-level batches. They need answers
  before S3 design is signed.

The register's next step is therefore **per slice**, not one finding: S0 and S4a–S4c are backend
findings with live-fire evidence requirements; S1–S3 are frontend slices with reviewable mockup parity.
