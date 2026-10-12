# Admin v2 revamp — plan-mode document

**Status:** PLAN ONLY. Nothing is implemented. **Revision 3, 12 Oct 2026 (third pass):** the **Spike has
been run** (scratch database, no product code; archive `docs/plans/chief-archive/admin-v2-spike/`) and Chief's
rulings on D2 / D4 / D6–D13 are recorded. Revision 2 (earlier 12 Oct): D1 keep the signed rule with a preview;
Q5 strict "before"; batch shape = a mix by courts-per-batch. Plan review signed off in principle at `3e79083`.
**Stopped at the decision gate: no SB, S2 or S3 design is final until Chief has read the Spike (§5).**
**Companion documents:** `docs/discovery/admin-v2-revamp.md` (business discovery, B1–B16, final Q1–Q8,
the evidence behind every claim here) · `docs/plans/chief-archive/admin-v2-combined-mockup.html` (the
acceptance reference; **all names, numbers and revenue in it are fake and stay in that file only**).

**Labels.** `S0…S5` and `SB`, `D1…D13` (decisions) and `C-1…C-14` (candidate findings) are local to this plan;
`G9`–`G12` are the gap labels from the 8 Oct handover, kept so Chief can match them.
**No finding IDs are assigned or reserved.** Chief assigns IDs per slice. Existing register findings are
cited by their real IDs.

**Evidence standard used throughout.** "Verified" means a code read, a grep (negative results included) or an
existing regression test's recorded behaviour; anything about runtime behaviour is marked **code-read only**
unless it says **probed (Spike)**. **Revision 3:** the Spike (§5) ran on 12 Oct against a throwaway local
PostgreSQL with the five real built services; where a §2 / §3 / §9 claim was one of its probes the entry now
says *probed* and cites the probe. Claims the Spike did not touch stay **code-read**.

---

## 0. Summary

1. The revamp is **mostly frontend for S1–S3** and **mostly new backend for the money lifecycle
   (S4a–S4c)**. Admin-v2 already has the grid, walk-in, ledger, batch / roster / renewal panels and role
   claims in the token; it has **no dues, deposit, pause, cancellation, seat limits or manager
   permissions** anywhere in schema or services (searched; see §3 of the discovery doc).
2. **Rulings recorded 12 Oct (Bala):**
   - **D1:** keep the signed "member contracts always win" rule. Create batch must show **exactly which
     guest bookings will be relocated or refunded** and the owner confirms before creating. The earlier
     "honour existing bookings" wording is **replaced** (dated note in §1).
   - **Q5:** strict "before". A request on 2 Oct gives a last day of 1 Nov and **November is not charged**.
     The worked examples are now **normative test cases** (§3).
   - **Batch shape:** a batch is a **mix** — some use 1 court, bigger ones 2–4. A **courts-per-batch**
     setting is added. This is the biggest re-scope: the backend today is **pool-level** (one batch locks
     every court of the pool for that hour), so S2 and S3 now depend on a new backend slice, **SB**.
3. **Spike result (12 Oct, §5):** P1–P6 all **confirmed** the code-read predictions (8-member batch: only 4
   confirm; one member locks all four courts; the walk-in route has no mandatory guard; the Subscription
   gate refuses; single-pool collisions refund everything; partial overlap displaces everything). P7 (extra)
   found two things nobody predicted: **a member cannot belong to two batches in one pool**, and **a batch
   queued for next month already withholds today's slot from guests** (§9, C-15 / C-16). Displaced guests are
   **not notified** (C-17).
4. **What can still resize the plan:**
   - **Capacity accounting (D2) — Spike-confirmed.** A confirmed member attendance consumes one unit of
     window capacity; with JBC's pool capacity 4, **members 5–8 of an 8-member batch are refused
     `409 MEMBER_SLOT_AT_CAPACITY` (P1)**. Under the mix a batch must reserve **its courts**, not charge per
     member. Target model ruled by Chief / Bala; final after Chief reads the Spike (§5).
   - **The mix vs the pool-level backend (new slice SB).** Without SB a 1-court batch still locks all four
     courts for guests.
   - **The Subscription gate (C-7).** A member can only confirm attendance if an `active` `Subscription`
     row exists and **nothing in the apps or scripts creates one**. Indirect evidence on production is in §2;
     the real answer is a question for Bala. Register **F-108** and **F-109** (both Open) sit on the same gap.
5. **Order:** **Spike (done) → S1 → SB → S2 → S0 (may overlap S2) → S3 → S4a → S4b → S4c → S5.** S0
   (server-side role enforcement) sits before every slice that needs it; **no manager permission toggle ships
   before it.** After Chief has read the Spike, S1 (frontend, low risk) can start in parallel with SB design.
6. **Minimum-demo cut (§8) — demo ruled more than 4 weeks away:** Spike + S1 + SB + S2 + S0 (the part S3
   needs) + S3 **plus S4a**; S4b, S4c and S5 after the demo unless time allows. It cannot show the Pay button,
   pause, cancellation, deposit or manager-permission toggles. If SB cannot land before the demo, the
   fallback is a **labelled interim** (pool-level locking) — stated openly, never faked.
7. **Risky / backend-heavy parts:** **SB** (re-models what a batch occupies, touching availability, the
   grid, the sweep and capacity), **S4a** (new money ledger), **S4c** (new entities + member app +
   notifications), **S0** (cross-service enforcement).

---

## 1. Inputs

**Final decisions (Bala, via Chief, 12 Oct):** Q2 no grace for quarterly / yearly (overdue from the day the
period starts). Q7 walk-in only: the manager can book a guest onto a low-attendance member slot for that
day, never shown to online guests. Q8 Gmail mandatory. Q3, Q6 accepted with caveats. Q4: the renewal
deadline is a **computed last day of the month**; "31 Oct" in the mockup is a placeholder.
**Scope:** the full revamp before the client demo.

**Rulings recorded 12 Oct 2026 (second pass, after the verification report):**

- **D1 — dated note (12 Oct 2026).** *Replaces* the 8 Oct acceptance of Q1 ("existing guest bookings on those
  slots are honoured"). After the verification showed the signed rule (F-207.2 / F-207.3: member contracts
  always win; colliding guest bookings are relocated or cancelled with a full refund), Bala ruled to **keep
  the signed rule**. Create batch must show **exactly which guest bookings will be relocated or refunded**,
  and the owner **confirms before creating**. The "honour" wording is **retired**: it survives only in this dated note, the §2 verification row that records the history, and the resolved C-3 row.
- **Q5 — strict "before".** A month is charged only if its 1st falls strictly **before** the last day. The
  2 Oct request → last day 1 Nov → November not charged. All worked examples are **test cases** (§3).
- **Batch shape (new).** A batch is a mix: some use **1 court**, bigger ones **2–4**. A **courts-per-batch**
  setting is added. S2 and S3 are re-scoped against the pool-level backend (new slice **SB**); the S2 grid
  must show batches that span several courts.
- **Probe spike first.** The pool-capacity question is more important now. A live probe on the test
  database comes first, with raw output reported before any slice code (§5).
- **Push:** Bala's go is explicit; documents only.

**Rulings recorded 12 Oct 2026 (third pass — Spike go; plan signed off in principle at `3e79083`):**

- **Spike:** go is explicit; run on a scratch database, never `badminton_db`, no product code, raw output
  archived, **stop at the decision gate** (done: §5).
- **D2 / D12 target model:** a batch **reserves its courts at batch level**; member confirmations do **not**
  consume guest capacity. Final only after Chief reads the Spike.
- **D4 accepted** (server-side, mandatory for any guest placement onto a member-reserved court; confirmed
  members only, paused excluded, only after the cutoff; closes C-4). **D6** accepted as proposed. **D7**
  accepted (membership active = assignment `ACTIVE` and within term; dues never change that; direction for
  F-109; Chief rules on F-108 / F-109 closure when S4a is planned). **D8** accepted + a requirement (§5 S0).
  **D9** closed (nothing live; no opening-balances import; to be verified by a read-only query, §11).
  **D10:** demo more than 4 weeks away → minimum cut plus S4a. **D11:** fixed courts per batch, chosen by
  the owner at creation. **D13** accepted (displace only the overflow, latest-booked first, each listed;
  single-pool branches get a refund list; **one line on guest notification, in D13**).
- **Plan changes required:** SB rollout and rollback plan (§5 SB); an **updated mockup** (multi-court grid +
  Create-batch displacement preview) is a **required step before S2 and S3 sign-off** (§10); highest F-number
  on `main` confirmed (§9); one read-only VM query for Bala (§11).
- **Provisional finding IDs** F-340 to F-343 from Chief; see §9 (rows go in as a separate docs-only PR).

**Chief's rules applied:** reuse existing patterns and cite the precedent for each new thing; check real
callers before changing any route; flag adjacent issues as separate candidates (never bundled); G10
before anything that depends on it; stop after the plan.

**Repo conventions applied (root `CLAUDE.md`):** plan → approval → implement → evidence → sign-off; blast
radius stated before implementation; reuse proven patterns; no commit of code without explicit sign-off;
the real-evidence and live-fire rules; known traps (§7).

---

## 2. Read-only verification (each reported verified / not verified, with evidence)

Line numbers from the working tree at `3b6533f`. "Code-read" = no runtime probe (none was possible).

| Item | Result | Evidence |
|---|---|---|
| **G9** — does the backend allow a guest booking on a member-batch window? | **Verified (code-read): it depends on the path.** Online guests: **never**. Admin walk-in: **yes, with no member check**, unless the opt-in F-276 guard is supplied. | `windowBookable` (slot-engine `index.ts:3726`) returns not-bookable when `collidesWithMemberAssignment` (`:3709`) matches any ACTIVE assignment for that pool + weekday + start time; the availability list is filtered the same way (`:3887`). Walk-in = payment `POST /bookings/manual` (`:1158`) → `createHeldNegotiatedBooking` → slot-engine `POST /bookings/negotiated` (`:4914`), which checks **blocked windows and capacity only** ("deliberately NOT collision-checked", comments at `:2144` and payment `:1229`). The only gate is the **`releaseGroupId`** branch (payment `:1236`) which re-asks `computeGroupReleaseEligibility` server-side; its rule is `now ≥ cutoff && no member CONFIRMED` (`:1238`), i.e. **zero** confirmed, not "fewer than N". → **C-4**, and fork D4. |
| **Q1** — how far ahead can guests book today? | **Verified (code-read + provisioning file): 7 days.** | `GET /resource-pools/:id/availability` (`:3796`): `guestOpenWindowDays = rule?.guestOpenWindowDays ?? 7`; `scripts/tenants/jbc.json` sets 7 on both JBC pools. The collision scan covers today … today+7 (`scanCollidingBookings`, `:5934`). Production's live value **not re-read** this session. |
| **Q1** — what happens to that day's member session when a guest booking sits on it? | **Verified (code-read): the system does not "honour" — it displaces; honouring would introduce four side effects.** | Creating the first assignment runs `runMemberCollisionSweep` (`:5975`): CONFIRMED guest bookings are relocated to a sibling POOLED pool at the same time, else cancelled with a full refund; HELD ones are cancelled. This is the signed Slice-2 decision ("member contracts always take precedence"; `docs/discovery/discovery-admin-v2-slice2-guest-booking-mgmt.md` §Priority) with an admin preview, `GET …/member-collision-preview` (`:6065`, `{ scanned }`). If bookings were honoured instead: (1) the grid draws `member-blocked` **before** it looks for a guest booking (`:1737`), so the honoured booking would be **invisible**; (2) the member's own confirm can fail `MEMBER_SLOT_AT_CAPACITY` if the guest holds a seat (`:2152`); (3) the attendance denominator and "fewer than N confirmed" rule would need defining; (4) the sweep itself must change. → fork **D1**, **ruled 12 Oct: keep the signed rule** (§1). |
| **G11** — F-141 register status | **Verified: Resolved, and the fix is present in code.** | `docs/findings_register.md:298` (in the Resolved section, which starts at `:167`): the target user must exist and belong to the tenant. Code: tenant-management `POST /tenants/:id/roles` (`:595`) checks `targetUser.tenantId !== id` (`:677`). The row also records that the route has **no production caller** and that no role pre-assignment path exists. Left open deliberately there: a real FK on `RoleAssignment.userId`. |
| **G11** — list / revoke role routes | **Not found (route-name search; not exhaustive).** | Only `POST /tenants/:id/roles` and `GET /users/:id/roles` (`:921`) exist in tenant-management. The Managers screen needs both new routes (S5). |
| **G12** — which Today aggregates do existing endpoints cover? | **Verified (code-read): the guest side partly; the member side and every multi-day roll-up not at all.** | `GET /branches/:id/guest-occupancy-dashboard` (`:1516`): per-branch, **single day**, **guest-only** utilisation (`utilizationPercentage` = guest seats ÷ window capacity), `duesCollected` (= **sum of guest booking prices**, misnamed → C-8), next-2-hours member attendance. `GET …/guest-month-summary` (`:1804`): guest bookings with price / method for a month. `GET /resource-pools/:id/guest-ledger` (`:2603`): per pool. `GET …/member-attendance` (`:3206`): today only. `GET /groups/:id/roster?date=` (`:6363`): one batch, one date, **phone only, no names**. **Missing:** member-hours vs guest-hours split; any week / month roll-up; attendance % per batch over a period; member dues (no data, F-109); per-branch revenue across months; cross-branch totals (would be N calls). |
| **Q5** — notice-period worked examples | **Computed (date arithmetic, not a code check).** | Table in §3 (fork D5). Rule as the mockup states it: last day = request + 30 days; the member pays any later month whose 1st is strictly before the last day; no pro-rating. The boundary case needs one ruling from Bala. |
| **Q6** — can pausing push a batch below the seat minimum? | **Verified by definition + code-read: no — pause cannot, by the accepted rule; ending can; and min / max are not enforced anywhere today.** | Q6 accepted: a paused member holds the seat. Searches for `minMembers\|maxMembers\|minSeats\|maxSeats\|BATCH_FULL` and for any pause concept over schema + services found **nothing**. Warning rule in §3 (fork D6). |

Additional facts found while verifying (each feeds a slice or a candidate):

| Fact | Evidence |
|---|---|
| Confirming attendance needs an `active` `Subscription`; **nothing in apps / scripts creates one** | slot-engine `getActiveSubscription` (`:1986`), used by `POST /member/today-assignment/confirm` (`:5627`); payment `POST /subscriptions` (`:407`) is internal-key only, "no frontend … no backend caller" (F-293 comment); only the autopay webhook updates status (`:564`, `:589`). **How members get one in production today is not derivable from code.** Indirect evidence only: the F-328 pre-wipe dump taken on the VM on 1 Oct 2026 (`docs/plans/chief-archive/f328-dev-rehearsal/`, row counts `row-counts-orig-vs-restored.txt`) shows **`Group` 0, `MemberGroupAssignment` 0, `Subscription` 1** (the lone `subscription_billing` intent has a placeholder-looking id) — i.e. **no live batches or members then, and the one subscription looks seeded**. Eleven days old, so **a question for Bala** (§11). |
| Batch assignments renew **monthly by definition**; a `termPreset` is **rejected** | `POST /member-group-assignments/:id/renew` (`:6676`): `TERM_PRESET_NOT_APPLICABLE`. Quarterly / yearly members inside a batch are **not supported** by current code. Presets exist as code fixtures (`TERM_PRESET_MONTHS`, `:5843`) — at odds with B3 "no fixtures in code". |
| "End membership" is immediate (`SUSPENDED` + `endDate = now`); **no scheduled last day** | F-133 Slice D (`RosterPanel` composes suspend + create). Needed for the 30-day notice (C-11). |
| The payment webhook and verify-payment **assume `intent.referenceId` is a booking id** | payment `:437` / `:324`: both call slot-engine `POST /bookings/:id/confirm`. `purpose` is written but never branched on. |
| Payment service has **no readable endpoints** (all `POST` except `/health`) | `grep` of `server.(get\|post…)` in payment `index.ts`; register **F-108** (Open). |
| Cutoff is the pool's `BookingRule.gracePeriodMinutes` (fallback 30); JBC's was corrected 30 → 60 | slot-engine `:1116 :1204 :2041`; `docs/plans/batch-log.md:4102` (F-276 close-out). No admin-v2 screen, **no per-batch override**. |
| Google sign-in matches an existing user by `googleId` **or email** within the tenant | `memberGoogleAuth.ts` `findOrCreateMemberUser`; so a pre-created member account with the right email is matched on first sign-in. No route creates a user from Gmail + phone (identity-auth has `walk-in` = phone + name, `users/:id/type` = promote an existing account). |

---

## 3. Decisions (ruled, and still needed)

| # | Decision | Status | Blocks | Recommendation / ruling |
|---|---|---|---|---|
| **D1** | **Collision policy for a new batch.** | **RULED 12 Oct** | S3 | **Keep "member contracts always win".** Create batch lists the **exact** guest bookings affected and the owner confirms first. The existing `member-collision-preview` returns only a count (`{ scanned }`), by design (F-207.3 deliberately stops before predicting the outcome), so S3 needs a **richer preview** (D13). |
| **D2** | **Capacity accounting for member attendance** vs JBC capacity 4, batches up to 8, now also vs **courts-per-batch 1–4**. | **TARGET RULED 12 Oct; baseline probed (Spike)** | SB, S3 | **Target:** a batch reserves its courts at batch level; member confirmations do not consume guest capacity (see D12). **Probed baseline:** P1 — 8 members, capacity 4: **members 1–4 confirm, 5–8 get `409 MEMBER_SLOT_AT_CAPACITY`**; P1b — footprint equals the **confirming-member count** (3 members cost 3 units and a walk-in still fits the 4th; two 3-member batches at one hour: 4 of 6 confirm). Final after Chief reads the Spike (§5). |
| **D3** | **Batch shape.** | **RULED 12 Oct: a mix (1 court; bigger batches 2–4)** | SB, S2, S3 | Add **courts-per-batch** to the batch. The pool-level backend (one batch locks the whole pool-hour) no longer matches the business; **slice SB** re-models the footprint. Fallback: a labelled pool-level interim. |
| **D4** | **Q7 gating rule.** | **ACCEPTED 12 Oct** | S2.3 | Guard **server-side and mandatory** for any guest placement onto a member-reserved court (today it is opt-in via `releaseGroupId`; **P3 probed: a scoped manager's `POST /payment/bookings/manual` without it returns `201`**). Counts **confirmed members only**, **paused excluded**, and only **after the cutoff**. Threshold in the attendance rules (tenant default, per-batch override). Closes C-4 (F-340, provisional). |
| **D5** | **Q5 boundary.** | **RULED 12 Oct: strict "before"** | S4c | Last day = request + 30 days, **inclusive** (the member may attend on it); a month is charged iff its 1st is **strictly before** the last day and after the request month. Test cases below. |
| **D6** | **Q6 warning rule.** | **ACCEPTED 12 Oct, as proposed** | S3, S4c | As "Q6 rule" below. |
| **D7** | **What makes a membership "active"** now that overdue must still attend (B6); what replaces the `Subscription` gate on confirm. | **ACCEPTED 12 Oct** | S3, S4a | A membership is **active when the assignment is `ACTIVE` and within its term; dues never change that.** The gate in `confirm`, `computeBranchMemberAttendance` and release eligibility is replaced accordingly (**P4 probed: with no `Subscription` row, confirm is refused `409 SUBSCRIPTION_INACTIVE`, 0 bookings written**). Direction for register **F-109** (billing = owner-recorded + member-initiated pay, not autopay-only). **Chief rules on F-108 / F-109 closure when S4a is planned** — not before. |
| **D8** | **Manager permission model.** | **ACCEPTED 12 Oct, plus a requirement** | S0, S5 | Store in tenant-management beside `RoleAssignment`; services read **claims** (a `caps` claim minted where `GET /users/:id/roles` already feeds every JWT). A grant **or revocation** takes effect only at token refresh. **Requirement: report the access-token lifetime and bound revocation of money permissions** — answered in §5 S0 ("Token lifetime and bounding revocation"). |
| **D9** | **Evidence artefacts and opening balances.** | **CLOSED 12 Oct (opening balances); artefacts still open** | S4a | Nothing live → **no opening-balances import**. To be **verified by a read-only VM query** (§11, for Bala). One real artefact per money rule is still wanted — **blocking when S4a is planned**. |
| **D10** | **Demo date and demo scope.** | **RULED 12 Oct: more than 4 weeks away** | order | Plan the **minimum cut plus S4a**; **S4b, S4c and S5 after the demo unless time allows** (§8). |
| **D11** | **Court identity under the mix:** which *physical* courts a batch reserves. | **RULED 12 Oct: fixed courts per batch** | SB, S2 | The **owner chooses the courts on creation**; the server **validates them against the pool's courts and against other batches at the same hour** (no court shared on a shared weekday; Σ courts at an hour ≤ pool capacity). `courtsPerBatch` is derived from the chosen set. "Interchangeable on the day" is out. |
| **D12** | **Capacity model under the mix.** | **TARGET RULED 12 Oct (final only after the Spike — now run, awaiting Chief's read)** | SB | A batch **reserves** `courtsPerBatch` courts of the pool-hour at **batch** level; **member confirmations do not consume guest capacity**; guests are excluded only from reserved courts, so the **remaining courts stay guest-bookable**. Spike P1 / P1b / P2 / P6 are the **RED baselines** SB must turn GREEN. |
| **D13** | **What the Create-batch preview shows, and who is displaced under partial overlap.** | **ACCEPTED 12 Oct** | S3, SB | Displace **only bookings beyond the remaining capacity**, **latest-booked first**, and **list each** in the preview (guest, date, time, amount, relocate-or-refund). In a **single-pool branch** (JBC's provisioning) nothing can be relocated, so the list is a **refund list** (**P5 probed: 2 CONFIRMED refunded, 1 HELD cancelled, `relocated 0`**; **P6 probed: 2 bookings displaced and refunded although capacity would have allowed both**). **Are displaced guests notified? No — not today** (Spike: the notification service received no send during P5 / P6; the sweep path has no notification call, `cancelBookingCore` `:5334–5427`). They are real customers, so SB / S3 must add one (C-17). Also: a `Refund` row is **bookkeeping only** (`POST /refunds` writes `processed` with no gateway call, payment `:732–739`), so "refund" in the preview means "recorded; the owner returns the money" unless Chief rules otherwise. |

### Q5 test cases (normative — strict "before", last day inclusive)

Rule under test (a pure date function in `branchTime.ts`, unit-testable with no database; request date is the
**branch-local** date, F-066 / F-087 precedent): `lastDay = requestDate + 30 days`;
`monthsCharged = { month M | M is after the request month AND firstDayOf(M) < lastDay }`; the member may
attend on `lastDay` itself; no pro-rating.

| Case | Request (branch-local) | Expected last day | Months charged after the request month |
|---|---|---|---|
| T1 | Thu 1 Oct 2026 | Sat 31 Oct 2026 | none |
| **T2** | **Fri 2 Oct 2026** | **Sun 1 Nov 2026** | **none — November is not charged** |
| T3 | Mon 5 Oct 2026 | Wed 4 Nov 2026 | Nov 2026 (full month; the owner's waive / adjust lever exists for this) |
| T4 | Thu 15 Oct 2026 | Sat 14 Nov 2026 | Nov 2026 |
| T5 | Sat 31 Oct 2026 | Mon 30 Nov 2026 | Nov 2026 |
| T6 | Sun 1 Nov 2026 | Tue 1 Dec 2026 | none |
| T7 | Wed 2 Dec 2026 | Fri 1 Jan 2027 | none (year boundary) |
| T8 | Thu 31 Dec 2026 | Sat 30 Jan 2027 | Jan 2027 |
| T9 | Sat 2 Jan 2027 | Mon 1 Feb 2027 | none |
| T10 | Sat 30 Jan 2027 | Mon 1 Mar 2027 | Feb 2027 |
| T11 | Sun 31 Jan 2027 | Tue 2 Mar 2027 | Feb 2027, Mar 2027 |
| T12 | Sat 29 Jan 2028 | Mon 28 Feb 2028 | Feb 2028 (leap year) |
| T13 | Sun 30 Jan 2028 | Tue 29 Feb 2028 | Feb 2028 (last day is the leap day) |
| T14 | Mon 1 Mar 2027 | Wed 31 Mar 2027 | none |

Additional assertions: **A1** the member is **not** blocked from attending on the last day; **A2** a request
at 23:30 branch-local on 2 Oct is the 2 Oct case (T2) even though the UTC date is earlier / later depending
on the zone — the test runs under a non-UTC branch timezone; **A3** the owner's waive and
adjust-against-deposit options change the *charge*, never the computed last day; **A4** the same function
feeds the member app's "your last day is …" text and the admin Requests tab (displayed = enforced, the F-065
class).

### Q6 rule (proposed)

- **Seats held** = active + on-notice + paused. The min / max limits and the "below minimum" warning use
  seats held, live and at each month boundary. A batch with **zero** members is "no members yet", not a
  warning.
- **Pause cannot reduce seats held**, so it cannot by itself push a batch below the minimum.
- **Attending** = seats held − paused. When attending < minimum, show a **soft note** on the batch and in
  Today's follow-ups ("only N attending, M paused"). It **never blocks** a pause, a move or an end.
- **Ending** (the notice's last day reached) reduces seats held and can raise the below-minimum warning.
- **Max** is a **server-side refusal** on add / move (`409`, new code); today only the UI could ever
  disable it and nothing enforces it.

---

## 4. Slice overview

| Slice | What | Kind | Depends on | Risk | Size |
|---|---|---|---|---|---|
| **Spike** | Live probes on `badminton_db_test` (capacity, courts-per-batch footprint, pool-level lock, walk-in guard, subscription gate, collision outcome). **No product code.** Raw output reported first. | evidence | none | n/a | S |
| **S1** | Role-aware shell + global branch / date context | frontend | none | low | M |
| **SB** | **Batch court occupancy (new):** `courtsPerBatch` (and court identity, D11), capacity model (D12), availability / exclusion / grid / sweep re-modelled so a batch reserves **its courts**, not the pool-hour | backend + data model | Spike; D2, D11, D12 | **highest of the non-money slices** | L–XL |
| **S2** | Today: composition, merged grid (**batches spanning 1–4 courts**), low-attendance + "Add guest slot" | frontend + read endpoints + one server guard | S1, SB (or the labelled interim); D4 | **high** | L |
| **S0** | Server-side role enforcement + permission store (G10) | backend, cross-service | Spike | **high** (4 services) | L |
| **S3** | Members core: list / profile, Add member, **Create batch (courts-per-batch, exact displacement preview)**, Manage roster / Move, batches, attendance history | frontend + backend | S1, SB, S0; D1, D6, D11–D13 | **high** | L |
| **S4a** | Dues ledger, owner-recorded payments, overdue, renewals review, opening balances | backend + frontend | S0, S3; D7, D9 | **highest** (money) | XL |
| **S4b** | Gateway Pay button in the member app | member app + payment | S4a | medium (F-309 precedent) | M |
| **S4c** | Pause, cancellation request, deposit | backend + both apps + notifications | S0, S4a; D5 (ruled), D6 | **high** | XL |
| **S5** | Owner tools: attendance rules, member settings, manager permission toggles, Managers screen | backend + frontend | S0 (hard), S4a for dues settings | medium | L |

Sizes are relative (S < M < L < XL), not durations.

**G10 placement (Chief's rule).** S0 precedes every slice that depends on it: **S3** (manager-facing
restrictions on the member routes), **S4a** (record payment owner-only), **S4c** (refund owner-only),
**S5** (permission toggles and the Managers screen). S1, SB and S2 do not depend on it: S1 only changes
navigation (UI-only gating is stated as such, never as security), and S2's manager actions (walk-in, read)
are already permitted server-side to the scoped manager.

---

## 5. Per-slice plan

Each slice lists scope, **blast radius (real consumers, found by grep this session)**, routes touched with
their **real callers**, precedent, evidence plan and traps. Traps are in §7; slice-specific ones are noted.

### Spike — evidence before design (no product code; first act after sign-off)

**Status: RUN, 12 Oct 2026, 07:36 UTC (Bala's go).** Against a **throwaway local PostgreSQL 16.15**
(`badminton_db_scratch_spike`; **not** `badminton_db`, not `badminton_db_test`), schema from `prisma migrate
deploy`, the five services **rebuilt** from the working tree and run as their real `dist/index.js`, ports
3001–3005 free before and after. **No product code was written.** The probe scripts are throwaway harness code;
they and the **raw output** are archived under `docs/plans/chief-archive/admin-v2-spike/` (`README.md` = setup,
commands and readout; `spike-raw-output.txt` = every request, status, body and SQL read-back; `probes/` =
the scripts), following the `f328-dev-rehearsal/` precedent. The remainder of this section keeps the original
spec; the **results table follows it**.

Every probe records: the exact request, HTTP status + body, and a **SQL read-back** (`Booking`,
`AvailabilityWindow`, `MemberGroupAssignment`) before and after.

| Probe | Setup | What is measured | Expected by code-read (to confirm or refute) |
|---|---|---|---|
| **P1 — the 8-member question** | Pool capacity 4 (JBC shape), one batch, 8 ACTIVE members each with an `active` Subscription; `grace` so the cutoff is open | All 8 call `POST /member/today-assignment/confirm` | The first 4 succeed, the **5th returns `409 MEMBER_SLOT_AT_CAPACITY`** (`index.ts:2152`). Record how many of 8 confirm. |
| **P1b — courts-per-batch footprint today** | Same pool; (a) one 3-member batch, (b) two batches at the same hour (3 + 3 members), (c) one 8-member batch | After confirmations: `remainingCapacity` from `GET /resource-pools/:id/availability`, `activeBookings` per window, the booking count | Today there is **no courts-per-batch notion**: the footprint equals the **number of confirming members**, whatever the batch's courts — so a "1-court" 6-member batch costs 6 units and a "2-court" 3-member batch costs 3. Establishes the baseline SB must replace. |
| **P2 — pool-level lock** | One pool, 4 courts, one ACTIVE 1-member batch at hour H | `GET /branches/:id/guest-inventory-grid` and `GET /resource-pools/:id/availability` for H | **Every** court `member-blocked` / unbookable at H, though only one member is attending. |
| **P3 — the walk-in guard (C-4)** | Scoped manager token; a member-blocked window | `POST /payment/bookings/manual` **without** `releaseGroupId` | **200** — a guest placed onto a member window with no member-collision check. Then with `releaseGroupId` and 1 confirmed member → `409 RELEASE_NO_LONGER_ELIGIBLE` (zero-confirmed rule). |
| **P4 — the Subscription gate (C-7)** | Member with an ACTIVE assignment and **no** `Subscription` row | `POST /member/today-assignment/confirm` | `409 SUBSCRIPTION_INACTIVE`. Then add an `active` row → success. |
| **P5 — collision outcome in a single-pool branch (D13)** | One-pool branch, 2 CONFIRMED + 1 HELD guest bookings at hour H inside the guest horizon; create the first assignment | The response `collisionSweep` + rows after | `relocated: 0`; confirmed bookings **cancelled with full refunds**, the held one cancelled (no sibling pool to relocate to). |
| **P6 — partial overlap (D13)** | Capacity 4, **2** guest bookings at hour H, then create a 2-member batch | Which bookings survive | Today **all** colliding active bookings are displaced (the scan returns every active booking in the window), even though capacity would allow both — the gap D12 / D13 close. |

**Results (all raw output in `docs/plans/chief-archive/admin-v2-spike/spike-raw-output.txt`):**

| Probe | Observed | Verdict |
|---|---|---|
| **P1** | 8 members, capacity 4, one window: members 1–4 `201`; **members 5–8 `409 MEMBER_SLOT_AT_CAPACITY`**; 4 `Booking` rows, all `isMemberBooking = t`, court unassigned | **Confirmed** |
| **P1b-a** | 3-member batch: 3 confirmed, `capacity_consumed 3 of 4`; a negotiated walk-in then succeeds on the 4th unit (`201`, court 1) | **Confirmed**: footprint = confirming members |
| **P1b-b** | two 3-member batches, same hour, same pool: **4 of 6 confirm**, members 5–6 refused | **Confirmed** |
| **P2** | one member, **not yet confirmed**: grid **all four courts `member-blocked`** (control before: all `guest-vacant`); availability no longer returns the hour; guest `POST /bookings` → `409 MEMBER_SLOT_RESERVED` | **Confirmed**: one member locks the whole pool-hour from the moment the assignment exists |
| **P3** | scoped manager, member-reserved window: (a) no `releaseGroupId` → **`201 CONFIRMED`** guest booking, no check; (b) with `releaseGroupId`, member CONFIRMED → `409 RELEASE_NO_LONGER_ELIGIBLE`; (c) control after cutoff, nobody confirmed → `201` | **Confirmed**: C-4 |
| **P4** | ACTIVE assignment, 0 `Subscription` rows: `GET /member/today-assignment` → `SUBSCRIPTION_INACTIVE`; confirm → `409 SUBSCRIPTION_INACTIVE`; 0 bookings | **Confirmed** |
| **P5** | single-pool branch, 2 CONFIRMED + 1 HELD guest bookings: preview `{scanned: 3}`; first assignment → `collisionSweep {scanned 3, relocated 0, cancelled 3, failed []}`; both CONFIRMED `CANCELLED` with `refundAmount 100.00`, **2 `Refund` rows `processed`**, HELD cancelled | **Confirmed** |
| **P6** | capacity 4, 2 guest bookings, 2-member batch: preview `{scanned: 2}`; the first assignment cancelled and refunded **both**; the second found nothing | **Confirmed**: the sweep ignores the remaining capacity |
| **P7** (extra) | (i) same member, second batch, same pool, different hour → `409 ASSIGNMENT_ALREADY_EXISTS`; (ii) a batch made on a non-1st day is queued to 1 Nov, its assignment is `ACTIVE` with `startDate 2026-11-01`, yet **today's slot at that hour is already missing from guest availability** | **New** (C-15, C-16) |

**What the Spike does not prove:** it used a fresh single-tenant fixture, not JBC data; the seeded payment
intents are `cash_` refs, so no gateway path was exercised (and `POST /refunds` makes no gateway call at all);
P7(ii) was observed on availability only.

**Decision gate (reached; stopped here).** The results go to Chief and Bala **before any SB / S2 / S3 design
is final**. P1 shows members are refused at capacity, so SB's capacity redesign is **mandatory, not optional**.
P2 / P6 confirm the blunt behaviour, so the labelled interim remains the only way to demo before SB lands.

### S1 — Role-aware shell + global branch / date context (frontend only)

**Scope.**
- A `roles?` field on `NavDestination`; `filterByRole` composed with `filterByEntitlement` (one list stays
  the single source for sidebar, bottom nav and `/apps`). Role kind derived once in `lib/claims.ts` from
  `AdminUser.roles` (`owner`, `branch_manager:<id>`).
- New destinations (mockup parity): Today, Walk-in (action), Ledger, Members, owner tools (Communications,
  Attendance rules, Pricing & rules, Branch settings, Managers). Old routes (`/dashboard`, `/inventory`,
  `/guests`, `/members`, `/court-groups`) keep **redirects** (the SW caches the shell; bookmarks exist).
- A `BranchDateContext` in the shell: branch (`all` | id) and date; last branch remembered per user in
  `localStorage` **wrapped in try/catch** (storage can throw), never required for correctness. Segmented
  switcher ≤ 4 options, dropdown beyond; hidden for a single-branch manager. The 9 screens' local branch
  state move onto it.
- Direct-URL guard: a role-hidden route redirects to Today (same posture as `GuestManagementScreen`'s
  entitlement refusal). **UI-only — documented as not a security boundary.**
- Mobile: the bottom nav has the daily tasks; owner tools behind "More". Both shells stay mounted with a
  CSS breakpoint (the `AppShell` precedent, 767 px).

**Blast radius (consumers).** `shell/nav.ts` → `shell/AppShell.tsx`, `AppsOverflowScreen.tsx`; `App.tsx`
(routes + redirects); `auth/AdminAuthContext.tsx`, `lib/claims.ts` (+ `claims.test.ts`); the 10 screens
holding branch state — `GuestSlotInventory`, `GuestOccupancyDashboard`, `LedgerScreen`,
`GuestManagementScreen`, `GuestScheduler`, `PricingRates`, `WalkInBookingFlow`, `CreateBatchForm`,
`RosterPanel`, `BranchSettingsScreen` (own fetch, `branchSettings/queries.ts:36`);
`guestManagement/queries.ts` (`useBranches`, `branchScopes`); `styles.css` (`.av2-shell`, `.av2-sidebar`,
`.av2-bottom-nav`); components `SidebarNavItem`, `BottomNavItem`, `Modal`; e2e `auth-ceremony.spec.ts`
(landing assertions); the five settings screens' `isOwner` checks (`BranchSettingsScreen`, `GuestScheduler`,
`AuthorizedCourts`, `CancellationPolicy`, `PricingRates`). F-206 gating (`filterByEntitlement`,
`moduleVisible`, `MembersScreen` / `GuestManagementScreen` refusals) is **preserved**, not replaced.

**Routes touched:** none.
**Precedent:** F-206 `filterByEntitlement`; `GuestManagementScreen` refusal; `useAdminApi` (F-220).
**Evidence.** Typecheck + `tsc && vite build`; vitest for `filterByRole`, the role-kind helper and the
context (pattern of `claims.test.ts`); extend `tests/seed-admin-v2-data.mjs` (generic, resolves the tenant
by subdomain) with a **scoped-manager seed** (and a second branch) so e2e can sign in as each role via the
dev token path; Playwright: owner vs manager nav at 1280 and 390 px; built-artifact check (grep compiled CSS
for the new classes); real-device pass on a phone.
**Traps.** Radix `Presence` exit-animation trap on any new drawer / sheet; frozen-transition and
gradient false passes in contrast checks; verify the **built** CSS, not source; rebuild `@badminton/ui-shared`
first if touched.

### SB — Batch court occupancy (backend + data model) — NEW after the 12 Oct batch-shape ruling

**Why it exists.** Bala: a batch is a **mix — some use 1 court, bigger ones 2–4**. The backend models a batch
as **pool-level**: `Group` and `MemberGroupAssignment` carry a `resourcePoolId` and **no court**; a window is
`memberBlocked` for **every court of the pool** whenever any ACTIVE assignment covers that pool + weekday +
start time (`index.ts:1246–1248` comment, `:1737`, `:3709`); and each confirming member consumes one unit of
window capacity (`:2152`). Neither matches "this batch plays on courts 2 and 3; courts 1 and 4 are still
sold to guests".

**Scope (design to be fixed after the Spike).**
- A **`courtsPerBatch`** value on the batch (integer, 1 to the pool's court count). It is a **different limit
  from seats** (members, min 4 / max 8): *courts* say how much of the pool-hour the batch reserves, *seats*
  say how many people share it.
- **D11 court identity (ruled): fixed courts per batch, chosen by the owner on creation**; the server validates
  them against the pool's courts and against other batches at the same hour. The count is derived.
- **D12 capacity model:** a batch **reserves** its courts at batch level; **member confirmations stop
  consuming guest capacity**; guests are excluded only from the reserved courts, so a 1-court batch leaves
  the other courts bookable. Batch-vs-batch validation at create: Σ courts at the same hour ≤ pool capacity,
  and no explicit-court overlap on a shared weekday.
- **D13 sweep + preview:** the collision sweep displaces only guest bookings **beyond the remaining
  capacity** (latest-booked first), and the preview lists each affected booking (§3, D13).
- **Fallback (labelled interim, not a design):** store `courtsPerBatch` but keep pool-level locking, so every
  court shows locked at the batch's hour. Honest for a demo only if labelled; it *loses* guest revenue on
  the unreserved courts, so it is not a production position.

**Rollout and rollback (required: SB edits the live guest booking flow on JBC).** `windowBookable` is the one
bookability function every guest path reads, so a wrong change either hides or **double-sells** a customer's
court.
- **Migration is additive and self-defending** (F-067 / F-115 `DO $$` precedent): new nullable column(s) on
  `Group` for the reserved courts; **nothing is altered, dropped or rewritten**. The F-328 dump showed `Group`
  0 on 1 Oct (D9's VM query re-confirms), so there is nothing to back-fill; even if rows exist they stay valid.
- **Default reproduces today.** A batch with **no courts set means "all courts of the pool"**: availability,
  exclusion, the grid cells and `POST /bookings/negotiated` behave exactly as today, and **nothing changes on
  JBC until an owner sets courts on a batch**. Proof: the same availability / grid / booking requests are
  captured **before** and **after** the deploy on a pool with no batches and diffed (**byte-identical**). The
  one deliberate behaviour change for default batches is for **members**, not guests: confirmations stop
  consuming capacity, so members 5–8 are no longer refused (a fix; the whole pool-hour is reserved for the
  batch either way, so what guests see is unchanged).
- **Order of ship:** (1) deploy migration + code with the new path dormant (no batch has courts); (2) regression
  green on `badminton_db_test`, Spike probes P1 / P1b / P2 / P6 **RED → GREEN**; (3) per root rule 10, capture
  the failing "before" on the deployed stack with a **throwaway tenant** (never JBC's data) behind a
  provisional `-preproof` image, then ship the real SHA; (4) deployed-VM smoke over real HTTPS: a guest
  booking on an unreserved court succeeds, on a reserved one fails; `deploy:verify`; (5) only then does an
  owner set courts on a real batch.
- **Rollback:** redeploy the previous immutable image set with `./deploy/gcp-vm/promote.sh <previous-sha>`. The
  migration needs **no down-step**: old code ignores the new column. A batch an owner had already given courts
  then reads as **pool-level** under old code, which errs on the **safe side** (guests see fewer slots; no court
  is double-sold). No feature flag is proposed; Chief to say if one is wanted for the first JBC week.

**Blast radius (real consumers, found this session).**
*slot-engine:* `fetchMemberExclusionContext` (`:3681`), `collidesWithMemberAssignment` (`:3709`),
`windowBookable` (`:3726`) and its callers — `GET /resource-pools/:id/availability` (`:3796`),
`next-available-date` (`:3930`), `POST /bookings` (`:3987`, exclusion read at `:4315`), `POST /booking-orders`
(`:4549`), `POST /bookings/negotiated` (`:4914`, capacity count + `assignPooledCourt`); `ensureTodayMemberBooking`
(`:2095`, capacity guard at `:2152`); `computeBranchGuestDay` / `guest-inventory-grid` (`:1676`, cell
derivation `:1737`) / `guest-occupancy-dashboard` (`:1516`) / `computeBranchMemberAttendance`;
`runMemberCollisionSweep` + `scanCollidingBookings` + `tryRelocateBooking` + the preview route (`:5975`,
`:5934`, `:6065`); `assignPooledCourt`; `POST /groups` (`:6093`). *payment:* `createHeldNegotiatedBooking`
(`:925`) and `/bookings/manual`. *Schema:* `Group` (new column(s), **self-defending migration**, F-067 /
F-115 precedent; the F-328 counts show **0 `Group` rows** at 1 Oct, so back-fill risk looks low — confirm).
*Frontend consumers of the changed shapes:* admin-v2 `GuestSlotInventory`, `GuestOccupancyDashboard`,
`useAvailability`, `types.ts`; **guest-member-pwa** `BranchBooking.tsx` and `CourtBooking.tsx` (availability +
`remainingCapacity`, `next-available-date`, `POST /bookings`, `/booking-orders`) — **the guest booking flow
is on the blast radius**; `apps/admin-web` still reads `availability` (retired, code reference only).
*Regression suites that encode today's behaviour:* `member-collision-sweep`, `pooled-court-placement`,
`member-flow`, `member-multi-batch-attendance`, `group-*`, `low-occupancy-release`, `daily-booking-cap`,
`court-slot-index`, `multi-slot-booking`, `booking-orders`, `next-available-date` (all slot-engine) and
payment `manual-booking`.

**Routes changed and their real callers.** `GET /resource-pools/:id/availability` — admin-v2
`useAvailability`, guest-member-pwa `BranchBooking` + `CourtBooking`, admin-web (retired); response shape
**must stay backward compatible** (`remainingCapacity` keeps its meaning for guests). `POST /bookings`,
`/booking-orders` — guest-member-pwa only. `POST /bookings/negotiated` — payment only. Grid / dashboard routes
— admin-v2 only. `POST /groups` — admin-v2 `CreateBatchForm` + regressions (new optional field).

**Precedent.** F-207.2 exclusion (`windowBookable` is the single shared bookability function, the F-212
precedent — change it once, not per caller); F-205 / F-225 / F-230 court assignment; F-250 shared day read;
F-067 / F-115 migration guard.
**Evidence.** The Spike's P1 / P1b / P2 / P5 / P6 are the **RED** baselines; after: the same probes **GREEN**
with DB read-backs — (a) 8 members confirm at capacity 4; (b) a 1-court batch leaves the other courts
bookable (availability + grid + a real guest booking succeeds on an unreserved court and **fails** on a
reserved one); (c) a 2-court batch plus a 1-court batch at the same hour fit in capacity 4 and a third
2-court batch is refused; (d) the guest booking path **byte-identical** when no batch exists (regression);
(e) the sweep displaces only the overflow, latest-booked first, with full refunds recorded.
**Traps.** This slice edits the shared bookability function — a wrong change silently hides or double-sells
guest courts, the **customer-facing** booking flow (guest-member-pwa), so it needs the deployed-VM check
beside the local one. Rebuild before regression; `badminton_db_test` only; stop manual services first
(ports); the suites listed above write real rows.

### S2 — Today (frontend + read endpoints + one server guard)

**Gate (12 Oct ruling): the updated mockup — multi-court grid + Create-batch displacement preview — must exist
and be reviewed before S2 is signed off** (§10). The archived mockup predates the batch-shape ruling.

**Scope.**
- **2.1 Grid re-home.** Today = the existing Inventory grid (same 7 cell types, icon-only) + a composed
  header. **Batches span 1–4 courts** (12 Oct ruling): a member batch is drawn as a **joined span** of
  `member-blocked` cells across exactly its reserved courts (laptop: adjacent cells in the hour column joined
  by a single bar; mobile: the same cells joined across the court columns), all opening the **same batch
  sheet**; courts the batch does *not* reserve stay Open and tappable for a walk-in. This needs the grid
  endpoint to return `member-blocked` **per resource** — that is **SB**. **Until SB lands the grid can only
  show the pool-level truth (every court of the pool locked at the batch's hour)**, which must be labelled as
  an interim, never presented as the final design. Two components for the grid — **laptop** (courts down, hours across) and **mobile** (hours down,
  courts across, opens at the current hour) — sharing **one cell model** module. Per-**pool** stacking when
  a branch has more than one pool (the existing endpoint is `?poolId=`; JBC has one per branch). Walk-in
  becomes a side panel / bottom sheet over the existing `WalkInBookingFlow` (reused, not rewritten).
  Switching mechanism: a `matchMedia` hook for the grid only (deliberate deviation from the shell's CSS
  breakpoint — the grid is heavy; flagged for review).
- **2.2 Composition.** Utilisation (member vs guest hours), collections (guest revenue now; member dues
  slot appears with S4a), attendance by batch, member follow-ups. New **read-only** aggregate route(s) on
  slot-engine extending `computeBranchGuestDay` (the F-250 shared read), auth `getInternalOrAdminAuth` +
  `isAuthorizedForBranch`. All Branches = N per-branch calls from the client (no cross-branch endpoint).
- **2.3 Low-attendance + "Add guest slot".** Generalise `computeGroupReleaseEligibility` from "zero
  confirmed" to "fewer than N after cutoff" (N from the rules, D4) and make the guard **mandatory
  server-side** for any placement onto a member-blocked window (closes C-4). The existing `releaseGroupId`
  flow is the precedent; the client flag is no longer the gate.

**Blast radius.** *Frontend:* `GuestSlotInventory.tsx`, `GuestOccupancyDashboard.tsx` (both retire into
Today; `/dashboard` and `/inventory` redirect), `WalkInBookingFlow.tsx` (consumers: `GuestSlotInventory`,
`GuestOccupancyDashboard`, `ReservationsPanel`), `ReservationsPanel` / `GuestManagementScreen`
(Reservations tab absorbed), `guestManagement/queries.ts` + `types.ts`, `reservationHelpers.ts`, `styles.css`
(grid / badge classes). *Backend:* `computeGroupReleaseEligibility` and its callers — the dashboard
(`computeBranchGuestDay` call at `:1573`), `GET /groups/:id/release-eligibility` (`:6389`), payment
`POST /bookings/manual` (`:1236`), admin-v2 `GuestOccupancyDashboard` / `WalkInBookingFlow` / `types.ts`,
and regression suites `payment/manual-booking.regression.ts`, slot-engine `low-occupancy-release`,
`member-collision-sweep`, `pooled-court-placement`.

**Routes touched and real callers.**
- `POST /payment/bookings/manual` — **callers:** admin-v2 `WalkInBookingFlow` (via `useCreateManualBooking`);
  payment regression; no guest-member-pwa or admin-web caller of this route.
- `POST /bookings/negotiated` (slot-engine) — **callers (grep, non-regression):** only payment
  `createHeldNegotiatedBooking` (`payment/src/index.ts:925`), reached by `/payment-links/negotiated` **and**
  `/bookings/manual`; no app calls the slot-engine route directly (admin-web's Negotiated page calls the
  payment route `/payment/payment-links/negotiated`; retired surface, F-302); regressions. **The guard is added on the `/bookings/manual` side or
  as an opt-out parameter so `/payment-links/negotiated` ("admin negotiating for a member", deliberately
  unfiltered, F-225) behaves byte-identically.**
- `GET /groups/:id/release-eligibility` — callers above.
- New: aggregate read route(s) — no existing callers.

**Precedent.** F-250 `computeBranchGuestDay`; F-252 / F-256 cell vocabulary; F-276 release guard; F-229 /
F-230 manual booking.
**Evidence.** RED / GREEN live-fire against `badminton_db_test`: manager places a guest onto a member
window with 1 confirmed → 200; with 3 confirmed → 409; omitting any flag onto a member window → **today
200 (RED), after 409 (GREEN)**; the walk-in path onto a non-member window byte-identical (regression); the
grid and the composed numbers compared to a direct DB read-back; Playwright at 1280 and 390 px (grid
scroll position at the current hour); real device. **Parity:** the archived mockup draws a **single-court** lock; the ruled shape is 1–4 courts, so
acceptance is the multi-court span above once SB lands, and the pool-level interim (labelled) before it;
record the deviation.
**Traps.** Cell semantics change when SB lands (the interim and the final grid differ — plan the switch). Today's "now" is branch-local — use
`branchTime.ts` helpers, never `new Date()` arithmetic (F-066 / F-087 family). Radix `Presence` on the
bottom sheet. Gradients and contrast on the amber marker in dark mode.

### S0 — Server-side role enforcement + permission store (G10)

**Scope.** Produce the exact **route × role matrix from the code first** (a grep-driven inventory, the way
F-237 did), then enforce it. Fixed owner-only set (record payment, create / edit batch, renew, deposit
refund, settings / rules, managers, move member) plus the **owner-grantable** layer (D8). Manager always:
view attendance and Today, take walk-ins, see today's collections, **pause or end** a membership, read
member contact details.
- **Where it lives:** permission grants in tenant-management beside `RoleAssignment`; a `caps` claim minted
  where `GET /users/:id/roles` already feeds every JWT (the four fetch sites in `identity-auth/src/index.ts`: `:542`, `:747`, `:816` and the refresh path `:1231`; the F-076 register row cites older line numbers).
  A grant takes effect at the next refresh (documented).
- **Helper:** `requireCapability(auth, cap)` beside `requireOwnerOrInternal` (slot-engine `:305`) and
  tenant-management's `verifyTenantOwnerOrInternal`; internal-key bypass unchanged.

**Token lifetime and bounding revocation of money permissions (D8 requirement).**
- **Access token: 15 minutes** (`expiresIn: '15m'` at identity-auth `index.ts:563`, `:774`, `:844` and the
  refresh path `:1258`). **Refresh cookie: 30 days.** Roles are **re-read from tenant-management on every
  issuance, refresh included** (`issueAccessToken`, `:1223–1243`), and a failed role fetch yields `roles = []`
  (fail-closed). So today a revoked manager keeps the roles in an already-issued token for **at most 15
  minutes** and cannot refresh into them.
- **Proposal.** (1) For ordinary capabilities (attendance, member edits, walk-ins) accept the **15-minute**
  bound and state it in the UI copy and the doc ("takes effect within 15 minutes"). (2) For **money
  permissions** (record payment, refunds, deposit) do **not** rely on the claim: the payment-side routes
  **re-check server-side** at write time with the same internal-key `GET /users/:id/roles` call
  identity-auth already makes (one extra internal call per money write; volume is low; optional ≤ 30 s cache),
  so a revocation of a money permission is effective **immediately**, not within 15 minutes. (3) Not
  recommended: shortening the access token for everyone (multiplies refresh traffic and the F-287 refresh-grace
  surface across all users for a benefit only the money routes need). Chief to confirm (2) before S0 design.

**Blast radius.** *slot-engine:* `getInternalOrAdminAuth`, `requirePoolScope`, `isAuthorizedForBranch`
(`:297`), and every route on the matrix — `POST /groups`, `POST|PATCH /member-group-assignments`,
`POST …/renew`, `POST /resource-pools/:id/windows/:windowId/release`, patterns and overrides (already
owner-only, F-237). *payment:* the five role checks (`:686, :1006, :1106, :1218, :1451`),
`/refunds`, `/refunds/override`, `/payment-links*`, `/bookings/manual`. *tenant-management:*
`RoleAssignment` routes (`:595`, `:921`), the owner-gated guest-pricing route (F-224), module entitlement.
*identity-auth:* the four role-fetch / JWT issuance sites (`:542`, `:747`, `:816`, `:1231`) + admin Google verify + WebAuthn login. *admin-v2:*
`lib/claims.ts`, `claims.test.ts`, the five `isOwner` screens. *Test suites:* `role-scoping`,
`admin-phone-lookup`, `walk-in`, `jwt-session` regressions, slot-engine `admin-operations`,
`group-tenant-scoping`.

**Routes touched and real callers.** Each route on the matrix: **callers are admin-v2 hooks in
`guestManagement/queries.ts`** (all of them), `apps/admin-web/src/main.tsx` (retired), and slot-engine /
payment regression suites; the member routes (`/member/*`) are guest-member-pwa-called and are **not**
touched. No route is *removed*; some start returning 403 to a scoped manager — so each must be listed with
its caller before the change, in the S0 sub-plan.

**Precedent.** `requireOwnerOrInternal` (F-225 / F-237), F-141 live-fire RED / GREEN style, F-076 claims
path, F-115 self-defending migration for the store.
**Evidence.** Per route, a **RED / GREEN 403 / 200 matrix** for owner, scoped manager, other-branch
manager, other-tenant owner, internal key; read-back proving **no write** on every 403; the existing
suites green (fixtures corrected, **not** the rule weakened — the F-141 lesson); a token-refresh test
showing a grant taking effect.
**Traps.** The five suites above write real rows — **use `badminton_db_test`**, stop manual services first
(ports), rebuild first. `RoleAssignment.userId` has no FK (F-141 note) — do not assume referential
integrity. Pipe-escaping if the register is touched later.

### S3 — Members core (frontend + backend)

**Gate (12 Oct ruling): the same updated mockup — specifically the Create-batch courts-per-batch field and the
displacement preview — must exist and be reviewed before S3 is signed off** (§10).

**Scope.**
- **Members list / profile** (read): search + filters. Needs **names**: `GET /groups/:id/roster` selects
  phone only (`:6320`); add `displayName` / `email` to the roster (and a list-by-tenant read) — C-9.
- **Add member:** a new identity-auth route to create a MEMBER account from **Gmail + phone**
  (both mandatory, C-12), then the existing `POST /member-group-assignments`. Plan / deposit / first
  payment are **not** in this slice (they arrive with S4a); the form shows batch + contact only.
- **Create batch:** **courts-per-batch** (1 to the pool's courts; D3) and, per D11, the **explicit courts**;
  days / time / name / rate reference (existing tenant member default rates) / **seats (members) min–max** —
  two separate limits; **batch-vs-batch clash check** (Σ courts at the same hour ≤ capacity, no explicit-court
  overlap on a shared weekday; new, server-side). **D1 ruled (keep "member contracts win"):** before creating,
  the form shows **exactly which guest bookings will be relocated or refunded** (guest, date, time, amount —
  D13) and the owner **must confirm**; no booking is touched until then. The existing
  `GET …/member-collision-preview` returns only `{ scanned }` (F-207.3 stops before predicting), so a richer
  preview is a **new read** built on the same `scanCollidingBookings`, listing each booking and stating
  honestly that relocate-versus-refund is decided at write time (for a single-pool branch such as JBC's
  provisioning, relocation is impossible, so the list is a refund list).
- **Manage roster:** seats vs min / max (server `409` on max), add, **move** (existing suspend + create
  composition; effective-dated rate arrives with S4a), call, open.
- **Batches** grouped Branch → time band → batch (computed client-side from branch + start time; **no
  stored hierarchy**).
- **Attendance history:** unlimited, per batch and per member, grouped by month, with month stats — a new
  aggregate read (discovery §8 fork 7), paginated for long-running batches.
- Manager view of Members: read-only, restricted (enforcement by S0).

**Blast radius.** *Frontend:* `MembersScreen.tsx`, `membersManagement/CreateBatchForm.tsx`, `RosterPanel.tsx`,
`RenewalPanel.tsx` (kept until S4a), `guestManagement/sections/MemberProvisioningPanel.tsx` (absorbed;
the promote-by-email path stays for an existing account) and its host `GuestManagementScreen` Members
tab, `queries.ts` hooks (`useCreateGroup`, `useGroups`, `useAllGroups`, `useGroupRoster`,
`useAddGroupMember`, `useSuspendAssignment`, `useExpiringRenewals`), `types.ts`, F-206 `MEMBER_MANAGEMENT`
gating. *Backend:* slot-engine group + assignment routes and `computeGroupRoster`; identity-auth (one new
route + `memberGoogleAuth` matching, no change expected); `schema.prisma` if seat limits get columns
(`Group.minSeats` / `maxSeats`, nullable, tenant default elsewhere) — **self-defending migration**.
*Suites:* `group-*`, `member-*`, `module-entitlement`, `admin-operations`, identity-auth `walk-in` /
`admin-phone-lookup`.

**Routes touched and real callers.**
- `POST /groups` — admin-v2 `useCreateGroup` → `CreateBatchForm`; slot-engine regressions
  (`group-tenant-scoping`, `group-roster-calendar`, `group-renewal`, `group-relocate-remove`); no
  guest-member-pwa caller.
- `GET /groups`, `GET /groups/:id/roster`, `GET /groups/expiring-renewals` — admin-v2 `RosterPanel` /
  `RenewalPanel` / `CreateBatchForm`; regressions; adding fields to the roster is additive.
- `POST /member-group-assignments` — admin-v2 `useAddGroupMember` (add + relocate), `apps/admin-web`
  (retired), six slot-engine regression files; **adding the max-seat `409` is behaviour-changing for every
  caller**.
- `PATCH /member-group-assignments/:id` (suspend) — admin-v2 `useSuspendAssignment`; admin-web; regressions.
- Member app: `GET /member/today-assignment`, `/confirm`, `/decline`, `GET /member/calendar` — called by
  `apps/guest-member-pwa/src/main.tsx`; **not changed in S3**, but D2 / D7 may change them later.
- New: identity-auth create-member route; aggregate attendance route.

**Precedent.** F-133 slices A–E (batches / roster / renewal); F-207.3 collision preview; F-228 promote
flow; F-206 gating; F-115 / F-067 migration guard; `getInternalOrAdminAuth` + `requirePoolScope`.
**Evidence.** Spike results first (D2) and SB landed. Regression sections for `BATCH_FULL`, batch-vs-batch
clash, **the preview listing exactly the bookings the sweep then relocates / refunds (preview ⊇ outcome, and
nothing is touched without the confirm)**, roster names, the new route's tenant scoping (**a tenant-A owner cannot create a member for tenant B** — the F-141 class);
live-fire read-backs; Playwright create-batch → add-member → roster → move at 1280 and 390 px; the member
app's confirm still working for an added member (D7 / C-7 — **an added member who cannot confirm is a
failed slice**).
**Traps.** The members' attendance gate (C-7) — added members may be unable to confirm until S4a; either
create the `Subscription` row in the add flow as a stop-gap (flag it) or gate S3 behind D7. Radix `Presence`
on sheets. `badminton_db_test` only for suites.

### S4a — Dues ledger, owner-recorded payments, overdue, renewals review

**Scope.**
- **Ledger (neutral names):** an append-only charge / payment record per membership with a derived balance
  (carried balances fall out naturally); **overdue derived server-side** with the two rules (monthly: after
  the due window; quarterly / yearly: from the period start). Due window **configurable** (tenant, owner-only).
- **Owner-recorded payment:** cash / UPI (UPI reference required), `Idempotency-Key`, part payments, owner-only.
- **Renewals:** batch-level renew with per-member tick / plan / amount; durations as **integer months +
  amount** (no preset fixtures; presets only as UI shortcuts), computed **last-day-of-month deadline** (Q4).
- **Effective-dated rate** for moves (Q3) and a rate-change-from-next-month rule.
- **Activeness (D7):** replace the `Subscription` gate; overdue never deactivates.
- **Opening balances import** (D9). **Read endpoints** for dues (answers F-108 for this domain).
- Today / Members integrate: overdue counts, dues card, per-member dues.

**Blast radius.** *New:* tables + payment-service routes (reads and a record route); `Tenant` columns for the
due window. *Changed:* slot-engine `confirm` / `decline` (`getActiveSubscription` gate at `:5574`, `:5632`),
`computeBranchMemberAttendance`, `computeGroupRoster`, `computeGroupReleaseEligibility` (all derive
`SUBSCRIPTION_INACTIVE` from `Subscription`), `POST …/renew` (`:6676`, preset rejection), `TERM_PRESET_MONTHS`.
*Consumers:* guest-member-pwa `main.tsx` (confirm / decline / dashboard states), admin-v2 `RenewalPanel`
(replaced), `RosterPanel`, Today. *Existing findings:* **F-108** (payment reads), **F-109** (billing model;
Bala's answers decide it), **F-293** (internal-key `POST /subscriptions`) stay consistent. *Suites:*
`member-flow`, `member-multi-batch-attendance`, `group-renewal`, payment regressions.

**Routes touched and real callers.** `POST /member-group-assignments/:id/renew` — admin-v2 `RenewalPanel`
(per-member loop), admin-web (retired), `group-renewal` regression; `POST /member/today-assignment/confirm`
— guest-member-pwa `main.tsx:379`, e2e `member-self-confirm`, `f023-full-system`, regressions. New payment
routes — none yet.

**Precedent.** F-229 manual-payment sequence (idempotency, `cash_` / `upi_` refs, `requirePaymentLinkAdmin`);
F-207.1 term dates + `endOfNextCalendarMonthUtc` / `branchTime.ts`; F-133 Slice E renewal; F-115 migration
guard; the provisioning-script pattern for the import.
**Evidence.** A written **ledger invariant** (balance = Σ charges − Σ payments; no negative carried
balance; idempotent replays create nothing) proven by RED / GREEN live-fire with DB read-backs for each
payment path (full, part, replay, wrong tenant, wrong role); the two overdue rules at their boundaries
(window close; period start); the **member can still confirm while overdue** (B6); the import dry-run
read-back; month-boundary tests in the branch timezone (F-087 precedent).
**Traps.** This is the slice most likely to ship a plausible-looking wrong number — evidence must come from
rows, not screens. Money fields in paise (the payment service's convention) vs rupees elsewhere.

### S4b — Gateway Pay button (guest-member-pwa + payment)

**Scope.** A member-facing dues view with a **Pay** button from the start of the month until paid; payment via
the existing Razorpay flow; **no cancel / refund of dues**; admin "Share pay link" via the existing
`POST /payment-links`.
**Precedent.** **F-309 / `BookingPay.tsx`:** `POST /payment/intents` → `create-order` → checkout →
`verify-payment`; ownership via `requireUserJwt` + `requireBookingOwnership` (F-045); `buildRazorpayPrefill`
(F-309, `lib/bookingPayLogic.ts`, vitest-covered).
**Blast radius.** payment `createIntentHandler` (`:119`), `createOrderHandler` (`:226`),
`verifyPaymentHandler` (`:324`), `POST /webhooks/razorpay` (`:437`) — **all four assume a booking
reference** and must **branch on `purpose`** (a new `member_dues` purpose) without altering the booking
path; `PaymentIntent.referenceId` semantics; guest-member-pwa `BookingPay.tsx` (unchanged) + a new dues
screen; `ui-shared` (rebuild first). **Callers of the changed routes:** guest-member-pwa `BookingPay.tsx`
(`/payment/intents`, `create-order`, `verify-payment`), Razorpay → webhook, slot-engine (confirm), payment
regressions.
**Evidence.** RED / GREEN: a dues intent for **another member's** dues → 403 (the F-045 class); webhook
replay idempotent; a dues payment never calls booking-confirm; a booking payment byte-identical
(regression); **Razorpay checkout cannot be tested locally** (static IP + HTTPS) — evidence for the real
checkout comes from the deployed VM with test keys only (root `CLAUDE.md`). Dev-mock path for local.
**Traps.** `import.meta.env.DEV` controls (dev-only simulate control compiled out of production);
rebuild `@badminton/ui-shared` before the PWA (the F-309 closeout order).

### S4c — Pause, cancellation request, deposit

**Scope.** Pause (hold seat, waive the month(s), resume by paying next); the member's **cancellation request**
(member app) with the 30-day notice; **scheduled end** (a last day, C-11); notify owner **and** manager (push
infrastructure exists, F-197; sweeps / scheduler exist, F-044 Resolved); owner or manager handles it after
checking attendance and phoning; **deposit** held and **manually refunded** by the owner (cash / UPI +
reference, optional deduction + note, audit); notice waive / adjust-against-deposit (owner only).
**Blast radius.** New entities (neutral names: a pause, a notice / request, a deposit with a refund record);
slot-engine member routes (`today-assignment` must reflect pause / scheduled end; `member/calendar`);
`computeGroupRoster` / attendance denominator (paused excluded, Q6); renewal (S4a) skips paused / notice;
notification service + admin-v2 device registration; guest-member-pwa (request screen, status, calendar);
admin-v2 Requests tab. *Suites:* `member-flow`, `member-collision-sweep`, `group-relocate-remove`
(end = `SUSPENDED + endDate = now` today), notification regressions.
**Callers of changed routes.** `GET /member/today-assignment`, `/confirm`, `/decline`, `GET /member/calendar` —
guest-member-pwa `main.tsx`; e2e specs; regressions. `PATCH /member-group-assignments/:id` — admin-v2,
admin-web (retired), regressions.
**Precedent.** F-133 Slice D (suspend / endDate); F-276 sweep + notification dispatch with dedup; F-197 push;
F-229 for the owner-recorded refund shape; F-115 migration guard.
**Evidence.** Each state transition with DB read-back; month-boundary notice tests (the Q5 table as test
cases); a paused member excluded from the attendance denominator and from release eligibility; the owner /
manager both notified exactly once (dedup); refund recorded once under replay; manager cannot refund
(S0 matrix).
**Traps.** Time zones (branch-local last day); the notification **trigger** must not depend on the member
being online. Real push needs a real device (F-025 / F-003 history).

### S5 — Owner tools

**Scope.** **Attendance rules:** tenant default + per-batch override for cutoff and the low-attendance
threshold (`BookingRule.gracePeriodMinutes` is the existing pool-level home — extend, don't duplicate);
**member settings** (due window, default deposit, notice days, seat limits); **manager permission toggles**
(needs S0); **Managers screen** (list / add / assign / remove — new list and revoke routes, C-5 note).
**Blast radius.** slot-engine `BookingRule` routes (`POST /booking-rules`, `PUT /resource-pools/:id/booking-rule`
— **callers:** admin-v2 `CancellationPolicy.tsx`, `apps/admin-web/src/main.tsx` (retired),
guest-member-pwa `BranchBooking.tsx` (reads), `scripts/provision-tenant.mjs`, regressions), every place that
reads `gracePeriodMinutes` (`:1116 :1204 :2041 :6900 :6946`), tenant-management role routes, `claims.ts`.
**Precedent.** F-061 / F-068 validation of `gracePeriodMinutes`; F-224 owner-only server-gated settings;
the screen-002 provisioning pattern.
**Evidence.** Changing the cutoff changes the member confirm deadline **and** the displayed deadline (the
F-065 class: displayed vs enforced must agree) — read-back both; per-batch override beats default; manager
cannot edit; token-refresh effect of a permission grant.
**Traps.** The F-065 displayed-vs-enforced mismatch is the known failure shape here.

---

## 6. Cross-cutting blast radius (Chief's required list)

| Consumer | Where | Slices that touch it |
|---|---|---|
| `nav.ts` | `shell/nav.ts` → `AppShell.tsx`, `AppsOverflowScreen.tsx` | S1 (S5 adds destinations) |
| `useBranches` / branch state | 9 screens + `BranchSettingsScreen`'s own fetch (`branchSettings/queries.ts:36`) | S1 (all), S2, S3 |
| `WalkInBookingFlow` | `GuestSlotInventory`, `GuestOccupancyDashboard`, `ReservationsPanel` | S2 |
| Inventory + Dashboard screens | `GuestSlotInventory.tsx`, `GuestOccupancyDashboard.tsx`; routes `/inventory`, `/dashboard` in `App.tsx` | S1 (redirects), S2 |
| `membersManagement/*` | `CreateBatchForm`, `RosterPanel`, `RenewalPanel` via `MembersScreen` | S3, S4a |
| `MemberProvisioningPanel` | `GuestManagementScreen` Members tab | S3 |
| F-206 gating | `filterByEntitlement` (`nav.ts`), `MembersScreen` / `GuestManagementScreen` refusals, server `requireModuleEntitlement` | S1 (preserve), S3 |
| `AdminAuthContext` role claims | `lib/claims.ts` (+ test), 5 `isOwner` screens, `branchScopes` in `guestManagement/queries.ts` and `branchSettings/queries.ts` | S1, S0, S5 |
| guest-member-pwa | `main.tsx` (`today-assignment`, `confirm`, `decline`, `member/calendar`), `BookingPay.tsx`, `BranchBooking.tsx`, `CourtBooking.tsx` (availability, `remainingCapacity`, `next-available-date`, `POST /bookings`, `/booking-orders`) | **SB** (guest booking flow), S4a–S4c, S5 |
| `apps/admin-web` | retired surface, kept as code reference (F-302); still calls `member-group-assignments`, `booking-rule(s)`, `member-attendance` | list in every route table; **not** a live caller |

---

## 7. Evidence plan and traps (apply to every slice)

**Definition of done per slice** (root `CLAUDE.md`, "Before finishing any task"): typecheck clean; build
clean; full regression run **on the correct database**; register updated if applicable; `pnpm register:check`
green if the register is touched; diagram gate (`pnpm diagram:verify`) if a tagged finding is touched;
**pushed and independently verified on the remote** (SHA-pinned fetch) before a batch is called done; the
register row **and** the `docs/plans/batch-log.md` entry written **in the same close-out pass** (this has
failed three times); close the loop to Chief naming IDs, PR / commit and register status; archive the final
approved plan into `docs/plans/chief-archive/` in the PR that resolves the finding(s).

**Traps called out, with where they bite here:**
- **Rebuild before testing regression** (suites run from `dist`; F-085) — every backend slice; rebuild
  `@badminton/ui-shared` before a PWA (F-309 closeout).
- **DB target:** never run suites against `badminton_db`; use the documented `badminton_db_test` export.
  F-101's guard refuses otherwise; do not work around it. e2e uses `badminton_db_e2e` (auto-rewritten).
- **Port collisions 3001–3005:** stop manually started services first or the suite silently hits them.
- **`docker compose -f … -f …` without `docker-compose.override.yml`** silently reverts the DB port
  (65432 vs 65500) — include the override.
- **A single suite failing is often environmental** — re-run in isolation, then the full set.
- **e2e is time-of-day dependent and has a known pre-existing failure profile** — do not read a red run as a
  regression without checking `apps/guest-member-pwa/CLAUDE.md`'s profile.
- **Radix `Presence`:** every new sheet / drawer / modal must be enter-only or carry a hard-timeout unmount
  fallback (hit twice already).
- **Frozen CSS transitions, gradient false passes, source-vs-built artifact, DOM-destroying error catchers:**
  verify against the **built** artifact with transitions disabled; check `background-image` separately;
  use a non-destructive overlay for debugging.
- **Tooling:** write Python helpers to a file (heredoc apostrophes); `docker exec -i` for stdin;
  escape `|` in register cells; no dated notes in a register's Impact / Action column.
- **Razorpay checkout cannot be tested locally** — only on the deployed VM with test keys; dev-mock is
  compiled out of production builds. **The deployed demo runs `NODE_ENV=development`** (OTP `123456`).
- **Process traps:** capture the failing "before" on the deployed stack before deploying a fix (provisional
  `GIT_SHA=<sha>-<slug>-preproof` image); a self-detected contradiction with an already-landed note is
  raised, not overridden — **this plan raises one: Q1 vs the signed F-207 collision rule (D1).**

---

## 8. Minimum-demo cut and rough order

**Rough order:** Spike → S1 → **SB** → S2 → S0 (may overlap S2) → S3 → S4a → S4b → S4c → S5.

**Minimum-demo cut (D10, 12 Oct: demo more than 4 weeks away) = Spike + S1 + SB + S2 + S0 (the part S3 needs)
+ S3 + S4a.** S4b, S4c and S5 follow the demo unless time allows. (The bullets below describe the S1–S3 part;
S4a adds the dues ledger, owner-recorded payments, overdue and the renewals review.)
- Demonstrates: role-aware navigation and the global branch / date bar (owner, one-branch manager,
  two-branch manager), the composed **Today** (guest + member activity, utilisation, attendance by batch,
  follow-ups for what exists), the grid and walk-ins on laptop and phone with **batches spanning 1–4
  courts**, the **low-attendance "Add guest slot"**, members and their profiles, **Create batch** (with
  courts-per-batch and the exact displacement preview + confirm), **Manage roster / Move**, batches by branch
  and time band, **unlimited attendance history** and per-member history, manager restrictions enforced by
  the server.
- **Cannot demonstrate** (labelled, not faked): the member Pay button (S4b), pause, cancellation requests,
  deposit and refund (S4c), manager-permission toggles, the Managers screen, configurable attendance rules
  (S5). **With S4a in the cut**, dues, overdue and the renewals review are demonstrable.
- **Honest caveats.** (1) The cut depends on the Spike: if P1 shows members refused at capacity, SB's
  capacity redesign is mandatory. (2) **SB is the largest non-money slice and touches the customer-facing
  guest booking flow**; if it cannot land before the demo, the **labelled pool-level interim** is the only
  alternative and the demo must say so. (3) Nothing is faked: a screen that has no backend is hidden, not
  mocked.
- **S4a is in the cut (D10).** S4b, then S4c and S5, are post-demo candidates that move forward only if time
  allows. S4a needs one real artefact per money rule from Bala **before it is planned**.

**Risky / backend-heavy, called out plainly:** **SB** (re-models what a batch occupies; guest booking flow on
the blast radius), **S4a** (a new money ledger — the slice most able to ship a wrong number), **S4c** (new
entities, two apps, notifications), **S0** (four services, every role-gated route).

---

## 9. Candidate findings (described — not numbered; Chief assigns IDs and decides what is bundled)

Evidence is code-read unless it says *probed*. Each is kept separate; none is folded into a slice's scope silently.

**Provisional finding IDs from Chief (12 Oct), subject to the register check.** The check is done:
**the highest F-number on `main` (`aa18866`) is F-339**, and F-340 to F-343 appear nowhere in `docs/`, so they
are free. They are provisional until Chief confirms them in `docs/plans/pending-findings.md`.

| ID (provisional) | = | Severity | Status of the evidence |
|---|---|---|---|
| **F-340** | C-4 — the walk-in route lacks a mandatory member-collision guard | Medium | **probed** (Spike P3) |
| **F-341** | C-5 — manager over-privilege on batch / member / release routes | Medium | **described, code-read, not probed** (P3 touches only the manual-booking route) |
| **F-342** | C-14 — collision preview and sweep blunter than the business rule (displaces everything; refunds everything in single-pool branches) | Medium | **probed** (Spike P5 / P6) |
| **F-343** | C-8 — `duesCollected` in the guest dashboard is guest revenue, misnamed | Low | **described, code-read, not probed** |

**Not findings:** C-1 / C-2 are covered by SB (probed: P1 / P1b / P2); **C-7 attaches to F-109** (probed: P4);
C-9 / C-12 are S3 scope; C-6 / C-10 / C-11 / C-13 are new capabilities, not defects; **C-3 is closed**. **C-15,
C-16 and C-17 below are new from the Spike and are described only, not numbered** — Chief assigns any ID.

The register rows for F-340 to F-343 go in as a **separate docs-only PR** for Chief to review before merge.

| Label | Candidate | Evidence | Slice it informs |
|---|---|---|---|
| **C-1** | Batches are **pool-level**: a member batch blocks every court of the pool for that hour; the business (**ruled 12 Oct: a mix of 1 to 4 courts per batch**) needs a per-batch court footprint. | slot-engine `:1246–1248` comment; `memberBlocked` applied `:1737`; `Group` / `MemberGroupAssignment` carry `resourcePoolId`, no court; JBC provisioning = one 4-court pool per branch | SB, S2, S3 (D3, D11, D12) |
| **C-2** | A confirmed member attendance **consumes window capacity per member**, not per batch or per court; JBC capacity 4 vs batches up to 8. **Probed (Spike P1 / P1b): members 5–8 of an 8-member batch are refused `409 MEMBER_SLOT_AT_CAPACITY`.** | `:2152`; regression fixtures use capacity 8 (`member-multi-batch-attendance.regression.ts:40`) | SB, S3 (D2, Spike P1 / P1b) |
| **C-3** | **Decision conflict — RESOLVED 12 Oct** (no longer a candidate): Q1 "honour" was withdrawn; the signed "member contracts always win" rule stands (D1). Kept here so the history is visible. | §1 dated note; Slice-2 discovery §Priority | S3 |
| **C-4** (F-340, provisional) | The walk-in route has **no mandatory member-collision guard**: an owner or scoped manager can place a guest onto any member window by omitting `releaseGroupId`. **Probed (Spike P3): `201 CONFIRMED` for a scoped manager.** | payment `:1236`; slot-engine `:4914`; Spike P3 | S2 (D4) |
| **C-5** (F-341, provisional) | **Manager over-privilege:** every batch / member / assignment / release / manual-booking route admits the scoped manager; no capability matrix; no list / revoke role routes. | `requirePoolScope` + `getInternalOrAdminAuth` on those routes; only patterns / court-eligibility use `requireOwnerOrInternal` | S0, S5 |
| **C-6** | **Seat limits unenforced** (new capability, not a defect): no min / max anywhere; max must be a server refusal. | negative grep | S3 |
| **C-7** (attaches to F-109) | **Attendance confirmation depends on a `Subscription` row nothing in-app creates**; an added member may be unable to confirm; conflicts with B6. **Probed (Spike P4).** Production practice unverified. | `getActiveSubscription` (`:1986`) used at `:5574 / :5632`; payment `POST /subscriptions` internal-key only, no caller (F-293) | S3, S4a (D7) |
| **C-8** (F-343, provisional) | `duesCollected` in the guest dashboard is **guest booking revenue** (misnamed) — will mislead once member dues exist. | `:1534–1541`, `:1661` | S2 |
| **C-9** | **Roster and attendance reads return phone only, no names** — the members UI needs names. | `computeGroupRoster` selects `{ id, phone }` (`:6320`) | S3 |
| **C-10** | **No effective-dated rates:** `Group.customRate` is mutable with no history, so "new rate from next month" has no home until a ledger exists. | schema `Group` | S4a |
| **C-11** | **No scheduled end date:** "end" = `SUSPENDED` + `endDate = now`; the 30-day notice needs a future last day. | F-133 Slice D | S4c |
| **C-12** | **No route creates a member account from Gmail + phone** (promote needs an existing account; walk-in creates a phone-only guest). | identity-auth `:130 :222 :1458` | S3 |
| **C-14** (F-342, provisional) | **The collision preview and the sweep are blunter than the business rule needs:** the preview returns a count only; the sweep displaces **every** active booking in a colliding window (not just the overflow) and, in a single-pool branch, can **never relocate**, so every confirmed booking is refunded. | `scanCollidingBookings` (`:5934`), `runMemberCollisionSweep` (`:5975`), `tryRelocateBooking` (`siblings.length === 0 → false`); `scripts/tenants/jbc.json` one pool per branch. **Probed (Spike P5 / P6).** | SB, S3 (D13) |
| **C-13** | **Renewal presets are code fixtures** and batch assignments reject `termPreset` — conflicts with B3 and with quarterly / yearly members in batches. | `:5843`, `:6676` | S4a |
| **C-15** (new, not numbered) | **A batch queued for next month already withholds today's slot from guests.** `fetchMemberExclusionContext` selects ACTIVE assignments by pool, weekday and time only; it ignores `startDate` / `endDate`. **Probed (Spike P7(ii)):** a batch created on 12 Oct is queued to 1 Nov, its assignment is `ACTIVE` with `startDate 2026-11-01`, and the 12 Oct slot at that hour is missing from guest availability. Member attendance confirm has the same blind spot (`resolveOneTodayMemberAssignment` also checks status only). Bears on D7 ("active = ACTIVE and within term"). | `index.ts:3681–3698`, `:2081–2092`; Spike P7 | SB, S3 (D7) |
| **C-16** (new, not numbered) | **A member cannot belong to two batches in one pool** (`@@unique([userId, resourcePoolId])` → `409 ASSIGNMENT_ALREADY_EXISTS`, probed P7(i)). Batches are pool-level and JBC has one pool per branch, so a member could not be in both a morning and an evening batch at the same branch. Whether the business wants that is a question for Bala; the schema comment ("a member may hold concurrent ACTIVE assignments across different pools") assumes more pools than JBC has. | schema `MemberGroupAssignment`; `index.ts:6531` error mapping; Spike P7 | SB, S3 (D3) |
| **C-17** (new, not numbered) | **Displaced guests are not notified, and a `Refund` row is bookkeeping only.** The sweep cancels and records a refund with no notification (probed: P5 / P6 produced no send), and `POST /refunds` writes `processed` with no gateway call (code read). Real customers lose a booking without being told. | `cancelBookingCore` `:5334–5427`; payment `:732–739`; notification log in the Spike archive | SB, S3 (D13) |

Already in the register and relevant: **F-108** (payment service exposes no readable data, Open), **F-109**
(`Subscription` cannot express when money is due, Open — **Bala's billing-model answers decide its open
question**), **F-141** (Resolved), **F-293** (internal-key `POST /subscriptions`), **F-302** (admin-web
retired). Whether S4a closes F-108 / F-109 or supersedes them is Chief's call.

---

## 10. Mockup archive and parity

The mockup is archived at `docs/plans/chief-archive/admin-v2-combined-mockup.html` (precedent:
`f333-card-mockup.html`). It was reviewed **before** the 12 Oct rulings, so it is the **acceptance reference
with stated deviations**, not the final design:
- it draws a **single-court** member lock — the ruling is **1–4 courts per batch** (SB / S2.1);
- its Create-batch form has **no courts-per-batch field**, and its amber note describes the *old* "honour"
  wording — the ruling is the **exact displacement preview + owner confirm** (S3);
- the plan-amount default discounts and the fixed due window / deposit / notice figures are placeholders;
- its fake data stays in that file only; nothing in these docs depends on it.
**Required step (12 Oct ruling):** an **updated mockup** — the multi-court grid (batches spanning 1–4 courts)
and the Create-batch form with courts-per-batch and the exact displacement preview — must be produced and
reviewed **before S2 and S3 are signed off**. It is a separate file; the archived one is left untouched. It
also needs the notification line from D13 (what a displaced guest is told).

---

## 11. What is needed next

1. **Chief:** read the Spike archive (`docs/plans/chief-archive/admin-v2-spike/`) and rule at the **decision
   gate**: confirm the D2 / D12 target model, the D8 money-route re-check (§5 S0), and what to do with C-15 /
   C-16 / C-17. **Review the register PR** (F-340 to F-343) before merge.
2. **Bala — read-only VM query (D9).** Run on the VM from the repo checkout (precedent:
   `scripts/f328/RUNBOOK.md`, preflight step). It is a **read-only transaction**:

   ```bash
   docker compose -f deploy/gcp-vm/docker-compose.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X' <<'SQL'
   BEGIN READ ONLY;
   SELECT 'Group' AS tbl, count(*) AS n FROM "Group"
   UNION ALL SELECT 'MemberGroupAssignment', count(*) FROM "MemberGroupAssignment"
   UNION ALL SELECT 'MemberGroupAssignment ACTIVE', count(*) FROM "MemberGroupAssignment" WHERE status = 'ACTIVE'
   UNION ALL SELECT 'Subscription', count(*) FROM "Subscription"
   UNION ALL SELECT 'Subscription active', count(*) FROM "Subscription" WHERE status = 'active';
   ROLLBACK;
   SQL
   ```

   Expected from the 1 Oct dump: `Group` 0, `MemberGroupAssignment` 0, `Subscription` 1. Anything else changes D9 and
   SB's back-fill assumption — report the output as printed.
3. **Next slices, in order, once Chief has read the Spike:** **S1 kickoff** (frontend, low risk) may start in
   parallel with **SB design**; the tracker refresh and the F-336 / F-338 plans are queued behind. **SB design
   is not final until Chief rules.**
4. **Bala — still open, not blocking now (blocking when S4a is planned):** **one real artefact per money rule**
   (a receipt, a dues note or a WhatsApp message); how the one existing `Subscription` row was created;
   whether a member should be able to belong to two batches at one branch (C-16).
5. **Nothing beyond these documents, the Spike archive and the register PR is built.**

**Documents only. No product code. Register rows only in the separate docs-only PR, with Chief's provisional IDs.**
