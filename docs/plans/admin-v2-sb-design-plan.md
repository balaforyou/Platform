# SB design plan — batch court occupancy (PLAN ONLY)

**Status:** PLAN ONLY. Nothing is implemented. **Revision 2, 13 Oct 2026:** Chief's rulings on the seven §12 questions are
recorded (§12), and a **design gap Chief found is fixed**: the reservation now derives from the **batch itself**, not
from its members (SB-11, §4, §5.1, §6, step 5b). Revision 1 text that changed is replaced, not annotated, because the
document is unmerged. Stops for Chief's read of the diff; nothing is built until Bala signs off.
**Inputs:** `docs/plans/admin-v2-revamp-plan-mode.md` (SB section, D2 / D11 / D12 / D13, now also D14–D16 in the
open rulings PR #143), the Spike archive `docs/plans/chief-archive/admin-v2-spike/` (P1–P7), register F-340–F-345
(provisional), and Bala's addendum of 12 Oct (a member in many batches, one deposit per member, pause and cancel per
batch membership). Local labels: `SB-n` = requirement, `Pn` = Spike probe.
**Scope discipline:** SB changes what a batch *occupies* and how a member joins one. It does **not** build dues,
deposit, pause or cancellation (S4a / S4c); those only constrain SB's data shape (§9). F-340, F-341, F-343 are out of
SB (S2, S0, S2). F-342 and F-345 are SB / S3 (D13). **F-344 shares SB's function; it is listed as its own commit and
its own test (§8), and Chief should confirm the bundling.**

---

## 1. Requirements (each one is testable; the evidence column is the RED baseline that must turn GREEN)

| # | Requirement | RED baseline today |
|---|---|---|
| **SB-1** | A batch reserves a **fixed set of courts**, chosen by the owner at creation (D11). Guests are excluded **only** from those courts at that pool-hour; every other court stays guest-bookable. | P2: one member locks all four courts |
| **SB-2** | A member's confirmed attendance **does not consume guest capacity** (D12). All members of a batch can confirm, up to the batch's seat limit, whatever the pool capacity. | P1: members 5–8 get `409 MEMBER_SLOT_AT_CAPACITY` |
| **SB-3** | Two batches at the same pool-hour fit if their court sets are **disjoint**; Σ courts ≤ pool capacity. Creating one that overlaps is refused with a clear message. | P1b-b: the pool-hour is shared; 4 of 6 confirm |
| **SB-4** | **A member can join any number of batches** (R1 / D14). The `@@unique([userId, resourcePoolId])` rule and its `409 ASSIGNMENT_ALREADY_EXISTS` go. | P7(i): `409` on the second batch in a pool |
| **SB-5** | **Overlap guard:** joining a batch that clashes with one the member already holds (same hour **and** a shared weekday) is refused, `409 MEMBER_BATCH_OVERLAP`, with a message naming the clashing batch. Different hours on the same day are fine. | none today (one batch per pool made it unnecessary) |
| **SB-6** | Seat counts and min / max are **per batch**; a member counts once in each batch they hold. (Counting primitive only; enforcement of min / max is S3, C-6.) | not enforced anywhere |
| **SB-7** | **Create batch shows exactly which guest bookings are affected** (D13): each booking listed with its outcome; only the **overflow** is displaced, **latest-booked first**; the owner confirms; the write refuses if the outcome changed since the preview. | P5 / P6: everything displaced; preview is a count **Added 13 Oct 2026 (Chief): the same list is also a copyable / exportable phone list** — one row per displaced or re-courted guest with name, phone, booking date, time, court, amount and outcome — so the venue can phone every affected guest, because push reaches only guests with a registered push token (see the push-only ruling, §6). Data source: the guest's `User` name and phone, the same lookup the grid and dashboard already use. |
| **SB-8** | **Every displaced or re-courted guest is notified** (D13, F-345), through a **channel-agnostic** event; push is the first wired channel (§6). The preview and the message say **"refund recorded; the venue will return your money"** and never "refunded". | P5 / P6: no notification sent |
| **SB-9** | A batch whose **term** has not started (or has ended) **does not** withhold guest slots, and the creation-time scan covers the batch's term ∩ the guest horizon (F-344). | P7(ii): a batch queued to 1 Nov already removes today's slot |
| **SB-10** | With **no batch having courts set**, guest-facing behaviour is **byte-identical** to today (rollout safety, §10). | n/a (regression) |
| **SB-11** | **The reservation derives from the batch itself** (its courts, weekdays, start time and term), **not from its members.** A batch with no members yet still holds its slots; the creation-time sweep and preview therefore match exactly what availability enforces, and the first member joining needs no sweep. Only legacy `groupId null` assignment rows keep assignment-based reservation. | today: an empty batch reserves nothing (no assignment exists), and the exclusion is assignment-based (`:3696`) |
| **SB-12** | **Moving a member between batches is one atomic operation**; the overlap guard ignores the batch being left (Chief, 12 Oct). | today: RosterPanel composes suspend + create in two calls |

---

## 2. What the code does today (probed where marked; line numbers at `763e51c`)

| Fact | Evidence |
|---|---|
| `Group` and `MemberGroupAssignment` carry `resourcePoolId`, no court. | schema; `POST /groups` `:6093` |
| `windowBookable` (`:3726`) → `collidesWithMemberAssignment` (`:3709`) withholds a window if **any** ACTIVE assignment of the pool matches weekday + start time; `fetchMemberExclusionContext` (`:3681`) selects by pool and `status` only (no `startDate` / `endDate`). | code; **P2, P7(ii) probed** |
| A confirming member creates a `Booking` (`isMemberBooking true`, `resourceId null`) in the **same window** as guests, and the guard `activeOccupants.length >= window.capacity` (`:2147–2156`) refuses it. | code; **P1 probed** |
| Guest capacity counts (`status HELD or CONFIRMED`) do **not** exclude `isMemberBooking`: `:3757` (`windowBookable`), `:4251`, `:4355 / 4368 / 4414` (`POST /bookings`), `:4639` (booking-orders), `:4800 / 4810 / 4840` and `:5007 / 5020 / 5054` (negotiated and its siblings), `:5891` (relocation target), `:5966` (scan). | grep of `BookingStatus.HELD, BookingStatus.CONFIRMED` |
| Court assignment for a POOLED window is `assignPooledCourt` (`:144`): first court not taken (and `guestBookable` for guests) in `createdAt` order; **member bookings carry no court**, so they do not occupy a named court. | code |
| The grid draws `member-blocked` for **every** court when the window is `memberBlocked`, before it looks for a guest booking (`:1737`). | code; **P2 probed** |
| `POST /member-group-assignments` (`:6420`) creates the assignment and **always** runs `runMemberCollisionSweep` (`:5975`); a duplicate (user, pool) maps P2002 to `409` (`:6531`). | code; **P7(i) probed** |
| The sweep displaces every active booking in a colliding window and cannot relocate in a single-pool branch. | **P5 / P6 probed** |
| Member attendance is per assignment: `POST /member/today-assignment/confirm` (singular route name) takes `{ assignmentId }`, resolves **that one** assignment (`resolveOneTodayMemberAssignment`, `:2081`) and its own window by (pool, start time); the member booking idempotency key embeds user, window and date (`:1938`). `GET /member/today-assignment` returns an array, one entry per ACTIVE assignment. The guest-member-pwa already has a per-batch tab bar over that array (`main.tsx:207–250`, F-133 Slice B). | code |

---

## 3. Attendance with several batches on one day (addendum item 2) — what I checked and what I did not

**By code read (not probed):** with the uniqueness rule lifted, two assignments for one member resolve independently:
different hours → two windows → two bookings → both confirm. The existing `(userId, windowId)` guard makes a *second*
assignment at the **same** hour silently resolve to the *same* booking (`ensureTodayMemberBooking` returns the existing
one), i.e. the member would appear to attend one slot while owing two batches — which is exactly why SB-5 (overlap
guard) is required and why it must be **member-wide (any pool of the tenant), not per pool**: the same hour at two
branches is as impossible as at one. *Open decision (§12 Q3).*

**The existing fixture `member-multi-batch-attendance.regression.ts` (F-133 Slice B), read in full:**
- *Covers:* one member, two ACTIVE assignments in **two different pools** (each capacity 8, each its own window at +4 h
  and +5 h today, grace 30); `GET /member/today-assignment` returns 2 entries; confirming A creates exactly one booking
  and none for B; declining B leaves A untouched; a foreign `assignmentId` gives 404; decline then re-confirm before
  cutoff; decline is cutoff-gated and not subscription-gated; the two `slot_release_reminder` dispatches dedupe across
  sweeps.
- *Does not cover:* **two assignments in the same pool** (impossible until SB-4); **same-hour** clashes (SB-5); any
  assignment created through `POST /member-group-assignments` or a real `Group` (it inserts rows directly, so the route
  and its sweep are bypassed); pool capacity pressure (capacity 8, so P1's refusal cannot occur); guests on the same
  window; the member-app list; dues or a deposit.
- *Plan:* extend it (do not replace it) with same-pool different-hour (both confirm), same-hour refusal at join
  (SB-5), and an 8-member batch at capacity 4 (SB-2).

**Member app:** list-and-confirm-each-batch already exists as a tab bar over the array. SB adds nothing to the member
app *unless* the overlap error needs a member-facing message (it does not; joins are admin-side). Verify on a real
phone with two batches in **one** pool once SB-4 lands.

---

## 4. Data model (additive; self-defending migration, F-067 / F-115 precedent)

1. **`Group.reservedResourceIds`** (`String[]`, default empty). **Empty = all courts of the pool** (today's behaviour;
   the rollout default, SB-10). `courtsPerBatch` is derived (`length`, or pool capacity when empty), not stored. Court
   identity is `Resource.id` (D11), validated to belong to the batch's pool. A `Group` already carries `resourcePoolId`,
   `daysOfWeek`, `startTime`, `startDate`, `endDate` — **everything the reservation needs is on the batch** (SB-11).
2. **The reservation is a property of the Group, not of its assignments.** `MemberGroupAssignment` rows are *members of* a
   batch; they no longer decide whether a slot is held. **Legacy rows** (`groupId null`, created before F-133 or by
   scripts) have no batch to read, so they keep today's assignment-based behaviour (all courts of the pool, their own
   weekdays / start time, and — per SB-9 — their own `startDate` / `endDate`).
3. **Drop** `@@unique([userId, resourcePoolId])` on `MemberGroupAssignment` (SB-4); **add** `@@unique([userId, groupId])`
   (the *same* batch twice is still refused; Postgres treats `groupId null` rows as distinct, so legacy rows are not
   constrained). A self-defending `DO $$` migration drops the old index only if it exists and adds the new one only if
   absent.
4. **No change** to `AvailabilityWindow`, `Booking` or `Resource`. (`Booking.isMemberBooking` already exists.)

*Relaxing the unique index is not strictly "additive"; its rollback story is in §10.*

## 5. Server behaviour

**5.1 One shared reservation function** (the F-212 precedent: change the shared function once, not per caller).
`reservedCourtsFor(window, ctx)` returns the set of reserved court ids at a window =
(a) the union of `reservedResourceIds` of every **Group** in the window's pool whose weekdays and start time match the
window and whose **term** (`startDate` … `endDate`, compared on the window's branch-local date) contains it — **whether
or not the Group has any member** (SB-11) — **plus** (b) for legacy `groupId null` assignments only, the all-courts
reservation of each in-term ACTIVE assignment matching weekday and start time. An empty `reservedResourceIds` on a Group
means "every court". It replaces `collidesWithMemberAssignment`'s boolean in `windowBookable`, and `fetchMemberExclusionContext`
reads **Groups** (plus the legacy assignments), not all ACTIVE assignments. The F-207 entitlement gate (MEMBER_MANAGEMENT
ACTIVE) is kept.
**5.2 Guest capacity** becomes `capacity − |reserved| − (guest bookings)`, where guest bookings **exclude** `isMemberBooking`
(SB-2). Every counter in §2's grep list is touched; each is listed in §7 with its caller.
**5.3 Court assignment for guests** (`assignPooledCourt`) skips reserved courts, the way it already skips non-`guestBookable`
ones (F-225 / F-230). A guest booking is therefore never placed on a reserved court.
**5.4 Member confirm** (`ensureTodayMemberBooking`): the capacity guard is replaced by "this window is reserved by this
member's batch" (a member whose batch does not reserve the window cannot confirm). Members never take a court row.
**5.5 Batch create** (`POST /groups`): new optional `courtIds`, validated (belong to the pool; disjoint from other in-term
batches sharing a weekday and the same start time; Σ ≤ capacity); error codes `BATCH_COURTS_INVALID`,
`BATCH_COURT_CONFLICT`. Absent `courtIds` = all courts (today's request keeps working). **The batch is the unit that
reserves, so creation is where displacement happens (§6).**
**5.6 Member join** (`POST /member-group-assignments`): remove the P2002 → `ASSIGNMENT_ALREADY_EXISTS` for a *different* batch;
keep it for the same batch twice. **No sweep on join** — the batch already holds its slots (SB-11), so a join reserves nothing
new and displaces nobody. Add the **member-wide overlap guard** (Chief, 12 Oct: a person cannot be in two places in one
hour): look up the member's other non-ended assignments across **all pools of the tenant** (assignment → pool → tenant),
and refuse with `409 MEMBER_BATCH_OVERLAP` naming the clashing batch when a shared weekday exists, the hours overlap
(`[start, start + pool.minBookingDurationMinutes)`; each side in its own branch's zone, compared as instants on a
representative week), **and the terms intersect** (a member may join a queued batch that starts after the clashing one
ends). Legacy `groupId null` assignments take part in the guard too.
**5.7 Move between batches (SB-12, Chief's ruling 5).** A new `POST /member-group-assignments/:id/move { targetGroupId }`
does, in **one transaction**: end the source assignment (`SUSPENDED`, `endDate = now`, exactly what RosterPanel's suspend
does today) and create the target assignment; the overlap guard **excludes the source assignment**; seat-limit checks (S3)
apply to the target only. Failure rolls both back. RosterPanel then calls this route instead of composing two calls (its
only caller). Dues, deposit and notice interactions of a move are S4 concerns and are not designed here.

## 6. Collision preview and displacement (D13, F-342, F-345)

- **Where it happens:** at **batch creation** (SB-11). Because the batch reserves from the moment it exists, the creation-time
  scan and the availability rule use the **same** `reservedCourtsFor`; there is no window of time in which an empty batch
  looks free to guests and then collides when its first member arrives.
- **Scan scope:** every window matching the batch in its **term ∩ [today, today + guestOpenWindowDays]** (SB-9). Dates beyond
  the guest horizon cannot hold guest bookings yet, and once the batch exists they cannot acquire them (reserved).
- **New** `POST /groups/preview` (read-only, `write:false`): input = the batch as it would be created. For each guest booking
  (HELD + CONFIRMED, non-member) in scope: **stays** (its court is unreserved), **re-courted** (its court is reserved but an
  unreserved court is free → moved, no loss), or **displaced** (overflow beyond `remaining = capacity − |reservedAfter|`; chosen
  **latest-booked first**, F-183 parent + children as one unit). Output: one row per booking (guest name / phone, date, time,
  amount, outcome) plus totals, and a `previewToken` (hash of the booking ids and outcomes).
- **Write** (`POST /groups` with `previewToken`): recompute inside the transaction with the window rows locked (`FOR UPDATE`,
  ordered by id); if the outcome set differs → `409 PREVIEW_STALE` and the UI re-shows the list. A caller with no token may
  create a batch **only** when the recomputed displaced and re-courted sets are empty.
- **Displaced:** relocation keeps `tryRelocateBooking` (sibling POOLED pool at the same time); otherwise `cancelBookingCore` +
  payment `POST /refunds`. **A `Refund` row is bookkeeping only (no gateway call) — ruled 12 Oct: a recorded row, and the owner
  returns the money manually. No payment change.** Wording, everywhere (preview, owner confirmation, guest message): **"refund
  recorded; the venue will return your money"**. The word "refunded" is not used.
- **Notification (SB-8), channel-agnostic.** One new event `guest_booking_displaced` (and `guest_booking_recourted` for the
  no-loss move) carrying channel-neutral variables (venue, date, time, court, amount, outcome, wording above). Its **channel
  policy** is a list in `CHANNEL_POLICY` (`['push']` to start); its **template** is a row per (tenant or platform, channel,
  event). Adding a channel later is a policy edit plus a template and a dispatcher, **not an SB change**.
  **What is wired now vs only provisioned (verified in `services/notification`):**
  - *Wired now:* the event, its policy entry (`['push']`), the platform-default push template, and the enqueue from SB.
    Real push dispatch exists (`sendPush`, F-197) **only when Firebase is configured**; without it the queue uses
    `mockDispatch` (as in CI).
  - *Provisioned only (nothing real behind it):* **SMS** and **email** — the policy matrix and queue accept `sms` / `email`
    requests, but dispatch for them is `mockDispatch`, i.e. **no SMS or email is actually sent anywhere today**; **WhatsApp**
    and **Telegram** — no code exists in the service at all.
  - *Ruled 13 Oct 2026 (Chief): SB ships **push only**; no SMS fallback.* Real SMS dispatch does not exist, so a fallback
    would be a notification-service build, not a policy edit; it is out of SB. A guest with no registered push token **is
    not reached by the system**: the owner confirmation says so plainly and offers the **phone list (SB-7)** so the venue
    phones those guests. The channel-agnostic event and policy list stay, so SMS, WhatsApp or Telegram attach later without
    changing SB. *(This replaces the earlier "Open (Chief confirming with Bala)" wording, kept here as history: whether an
    SMS fallback ships in SB was the question.)*
  - Sent after the transaction commits; a notification failure never rolls back the batch (F-321 precedent).
- **Old preview route** `GET /resource-pools/:id/member-collision-preview` stays (its only callers, by grep: the retired
  `apps/admin-web` and one regression section; **admin-v2's `CreateBatchForm` does not call it at all**) until the new
  preview ships, then is retired in a separate step.

## 7. Blast radius (every caller of the touched code; grep-driven, stated before implementation per root rule 3a)

*slot-engine functions:* `fetchMemberExclusionContext`, `collidesWithMemberAssignment`, `windowBookable`,
`poolHasAvailabilityOnDate`, `ensureTodayMemberBooking`, `assignPooledCourt`, `placeBookingsOnCourts` /
`createCourtPlacementResolver` (grid display), `computeBranchGuestDay`, `computeGroupReleaseEligibility`,
`scanCollidingBookings`, `runMemberCollisionSweep`, `tryRelocateBooking`.
*routes:* `GET /resource-pools/:id/availability`, `…/next-available-date`, `POST /bookings`, `POST /booking-orders`,
`POST /bookings/negotiated`, `GET /branches/:id/guest-inventory-grid`, `…/guest-occupancy-dashboard`,
`…/member-attendance`, `POST /groups`, `POST|PATCH /member-group-assignments`, `…/renew`, `GET /groups/:id/roster`,
`GET /groups/:id/release-eligibility`, `POST …/windows/:windowId/release`, `POST /member/today-assignment/*`.
*payment:* `createHeldNegotiatedBooking`, `/bookings/manual` (capacity semantics change under it), `/refunds`.
*notification:* `CHANNEL_POLICY`, templates.
*schema:* `Group` (+column), `MemberGroupAssignment` (index swap).
*frontend consumers of changed shapes:* admin-v2 `GuestSlotInventory`, `GuestOccupancyDashboard`, `useAvailability`,
`CreateBatchForm`, `RosterPanel`, `WalkInBookingFlow`, `types.ts`; **guest-member-pwa `BranchBooking.tsx`,
`CourtBooking.tsx` (availability, `remainingCapacity`, `next-available-date`, `POST /bookings`, `/booking-orders`) — the
live customer flow**; `apps/admin-web` reads `availability` (retired; reference only).
*regression suites that encode today's behaviour (will need updated expectations, never a weakened rule — the F-141
lesson):* `member-collision-sweep`, `pooled-court-placement`, `member-flow`, `member-multi-batch-attendance`,
`group-roster-calendar`, `group-relocate-remove`, `group-renewal`, `group-tenant-scoping`, `low-occupancy-release`,
`daily-booking-cap`, `court-slot-index`, `multi-slot-booking`, `booking-orders`, `next-available-date`,
`guest-ledger`, and payment `manual-booking`.
*Out of SB (named so they are not absorbed):* F-340 (mandatory walk-in guard — S2), F-341 (manager matrix — S0),
F-343 (`duesCollected` rename — S2 / S4a), min / max enforcement (S3), the release flow's own rules (S2).

## 8. Steps and evidence (small commits, each independently revertible)

| Step | Change | Evidence before merge |
|---|---|---|
| 1 | Self-defending migration: `Group.reservedResourceIds`; index swap | migrate on a copy of the F-328 dump shape; `prisma migrate deploy` idempotent twice |
| 2 | `reservedCourtsFor` + `windowBookable` + guest capacity excludes members + `assignPooledCourt` skips reserved courts; **default (empty) reproduces today** | SB-10: same availability / grid / booking requests before and after on a pool with no courts set, diffed **byte-identical**; full regression green |
| 3 | `ensureTodayMemberBooking` guard → reservation check | P1 RED → GREEN (8 of 8 confirm) |
| 4 | **F-344 as its own commit:** term-bounded exclusion (also grid and member lookup) | P7(ii) RED → GREEN; then also check the grid and a guest booking attempt on a queued batch (still unchecked) |
| 5 | `POST /groups` `courtIds` + validation | P2 / P1b-b RED → GREEN: a 1-court batch leaves 3 courts bookable (availability, grid, a real guest booking succeeds on an unreserved court and **fails** on a reserved one); a disjoint 2-court + 1-court pair fits; a third overlapping batch is refused |
| 5b | **The empty-batch test (Chief's double-sell case).** | A single named test: (1) create a batch with courts {2, 3} and **no members**; (2) a guest books a court — a booking on an **unreserved** court (1) **succeeds**, an attempt on a **reserved** slot is refused (`MEMBER_SLOT_RESERVED`), and availability shows exactly the unreserved courts; (3) **add the first member**; (4) the guest booking from step 2 is **still CONFIRMED**, availability is **byte-identical** to step 2, the join response carries **no** sweep, and nothing was cancelled or refunded. Plus the all-courts variant (a batch with no `courtIds`): after creation **no** guest can book that hour, with zero members. RED today: step 2 allows a guest onto the soon-to-be-reserved slot because no assignment exists. |
| 6 | Member join: lift uniqueness, add overlap guard | P7(i) RED → GREEN; same-hour refused with the clashing batch named; different hours both confirm; extended `member-multi-batch-attendance` |
| 6b | Atomic move (SB-12) | move between two non-overlapping batches: source ended and target created in one transaction; a forced failure on the target leaves the source `ACTIVE`; the overlap guard ignores the source (moving to a clashing hour of the *source itself* succeeds, to a third batch's hour is refused) |
| 7 | Preview + `previewToken` + overflow-only displacement + term-bounded scan + notifications | P5 / P6 RED → GREEN: 2 guests + 2-court batch → both stay; 4 guests + 2-court batch → latest-booked 2 displaced; stale token → `409`; notification service receives one send per displaced guest |
| 8 | Deployed-VM check behind a provisional `-preproof` image with a **throwaway tenant** (root rule 10), then the real SHA | real HTTPS: the five checks above on the deployed stack; `deploy:verify` |

Each step: typecheck + build clean, rebuild before regression, `badminton_db_test` only, stop manual services on
3001–3005 first, the suites in §7 run in full. Raw output archived under `docs/plans/chief-archive/` as the Spike was.

## 9. Constraints SB places on later slices (so SB's shape does not have to change)

- **Dues (S4a)** key off the **assignment** (member × batch); SB keeps assignment as the unit and does not merge a
  member's batches. A member's dues screen groups by batch (S4a / S3 UI).
- **Deposit (S4c):** one record per member — **not** an SB column; lives with the member / billing entity.
- **Pause and cancel (S4c):** attach to the assignment; SB's `status` values (`ACTIVE` / `SUSPENDED`) are the only ones
  it touches, so S4c must add `PAUSED` / `NOTICE` states **without** SB's term check (SB-9) misreading them (a paused
  assignment still reserves its batch's courts — a paused member holds the seat, Q6).
- **Seats (S3):** per-batch counts are derived from assignments grouped by `groupId`.

## 10. Rollout and rollback (SB edits the live guest booking flow on JBC)

- **Dormant by default:** after deploy, no batch has courts set, so guests see exactly today's behaviour; the only
  change anyone can observe is for members (more of them can confirm — a fix).
- **Order:** migration + code dormant → regression and RED→GREEN on the test database → throwaway-tenant check on the
  deployed stack → real SHA → smoke over HTTPS → **only then** does an owner set courts on a real batch.
- **Rollback:** `./deploy/gcp-vm/promote.sh <previous-sha>` (the immutable image set). The new column is ignored by old
  code. A batch an owner had given courts then reads as pool-level under old code — the **safe** direction (guests see
  fewer slots; nothing is double-sold). The one thing old code does *not* tolerate is the **dropped unique index**:
  old code would let the same member join two batches in one pool, which it then handles correctly per assignment (the
  Spike showed per-assignment resolution), so this is harmless but is stated so nobody is surprised.
- **Verification that the rollout changed nothing for guests:** before / after capture of `availability`,
  `next-available-date`, the grid and one real booking on a pool with no courts set, diffed.
- No feature flag proposed (Chief to say if one is wanted for the first JBC week).

## 11. Risks and traps

- `windowBookable` is the single bookability function: a wrong edit hides or **double-sells** customer courts. Mitigation:
  step 2's byte-identical diff, and the RED→GREEN pairs above.
- Deadlocks: preview-and-write lock several windows; lock in id order.
- Preview ↔ write drift: the `previewToken` makes it explicit rather than assumed.
- Refund wording: "refund" means a recorded row, not money moved (F-345). The UI must not say "refunded".
- Frozen-transition / gradient / Radix `Presence` traps apply to the UI work that follows (S2 / S3), not to SB.
- Ports and databases: Spike lessons stand (own scratch DB, rebuild first, no manual services).

## 12. Rulings (Chief / Bala, 12 Oct 2026) and what is still open

| # | Question | Ruling | Where it lands |
|---|---|---|---|
| 1 | D12 | **Final:** a batch reserves its courts at batch level; members never consume guest capacity. | SB-1, SB-2, §5.1–5.4 |
| 2 | F-344 | **Its own commit inside SB**, same shared function. | step 4, SB-9 |
| 3 | Overlap guard scope | **Member-wide across the tenant's pools and branches.** | SB-5, §5.6 |
| 4 | Refund | **A recorded row; the owner returns the money manually.** Wording "refund recorded; the venue will return your money", never "refunded". **No payment change.** | SB-8, §6 |
| 5 | Move between batches | **One atomic operation; the guard ignores the batch being left.** | SB-12, §5.7, step 6b |
| 6 | Notification | **Channel-agnostic** (event, policy, template); push first; SMS / WhatsApp / Telegram attach later without changing SB. The plan states what is wired and what is provisioned. | §6 |
| 7 | Min / max | **SB counts, S3 enforces.** | SB-6 |

**Added by Chief (design gap):** the reservation derives from the batch, not its members (SB-11), with the empty-batch test
(step 5b).

**Still open:**
1. ~~**SMS fallback in SB?**~~ **Ruled 13 Oct 2026: push only, no SMS fallback in SB** (§6); the phone list (SB-7) covers guests the system cannot reach.
2. **Empty batches that never fill:** under SB-11 a batch holds its slots until its term ends even with zero members. This is the
   ruled behaviour; whether an owner should see a "holding N slots, 0 members" warning is an S3 UI question.
3. **Overlap-guard timing arithmetic across zones** (JBC is `Asia/Kolkata`, courtowner1 `UTC`): §5.6 compares instants on a
   representative week; confirm that is acceptable or whether a single-branch member (the realistic case) suffices for v1.

**Nothing is built until Bala signs off.**
