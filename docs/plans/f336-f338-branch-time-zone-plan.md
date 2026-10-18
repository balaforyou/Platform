# F-336 / F-338 plan — branch time zone arrives after the time renders (PLAN ONLY)

**Status:** PLAN ONLY, 18 Oct 2026. Nothing is implemented. Stops for Chief's review; nothing is built until Bala signs off.
**Findings (both Open, provisional):** **F-336** (Medium) — booking times in the guest PWA are formatted with a branch time
zone that arrives from `/branches/:id/about` after the content has rendered; until then `formatBranchTime` falls back to UTC
(a 6:00 AM IST booking reads 12:30 AM). **F-338** (Medium) — the receipt PDF is built from `branchAbout` as it is *at the
click*, so a receipt downloaded before the lookup returns bakes in the UTC time and `Venue —`. Same root cause, different
stage; **kept as two findings** (a document outlives the screen) but planned together because one design fixes both.
**Inputs:** the two register rows (live repros of 7–8 Oct, JBC at `Asia/Kolkata`, `/about` delayed 3.5–4.5 s), F-234 / F-335 /
F-339 as precedent, root `CLAUDE.md` and `apps/guest-member-pwa/CLAUDE.md`, and a fresh read of the code at `de74e17`.
**Out of scope (named so they are not absorbed):** F-339 (venue-switch date, already fixed), the admin-v2 audit (admin-v2
reads zones from its own branch list), the browser-local date initialiser noted in F-339's batch-log entry.

---

## 1. What is wrong, precisely (code read at `de74e17`; live repros are in the register rows)

**The pattern.** Every guest-PWA screen that shows a booking time keeps a local `branchAbout` (or a per-branch map), fetches
`/tenant/branches/:id/about` in an effect, and calls `formatBranchTime(iso, branchAbout?.timezone, opts)`.
`safeTimeZone(undefined)` returns `'UTC'` (`packages/ui-shared/src/lib/branchTime.ts:34-44`), so **before the lookup lands, or if it
fails, the time renders in UTC with no sign that it is wrong.**
**Why it is wrong and not just slow:** the booking payloads carry no zone. `GET /bookings/my` (`services/slot-engine/src/index.ts:7389`)
returns `window` → `resourcePool`, `players`, `resource`, `childBookings`; `ResourcePool.branchId` is "scalar UUID, no DB relation"
(schema), and no route returns the branch's zone or name with a booking.

| Site | File:line | Kind | Today |
|---|---|---|---|
| History cards | `BookingHistory.tsx:350-352` | booking time, per-branch map `branchAboutById` | UTC until `/about` lands |
| History receipt download | `BookingHistory.tsx:129-148` | **receipt (F-338)** reads the map at click time | bakes UTC + `Venue —` |
| Home: member-session card | `main.tsx:420, 481-482` | booking/assignment time | UTC then right (live-confirmed 8 Oct) |
| Home: upcoming slots | `main.tsx:666-714` | booking time, `branchAboutById` | UTC until each branch's `/about` lands |
| Confirmation | `BookingConfirmation.tsx:123, 132`, receipt `:235` | booking time + **receipt (F-338)** | UTC; receipt bakes UTC + `Venue —` |
| Pay | `BookingPay.tsx:429-441` | booking time | UTC then right (live-confirmed 8 Oct) |
| Cancel modal receipt | `CancelBookingModal.tsx:152-153` | **cancellation receipt (F-338, code read only)** | same History map |
| `/book` windows and counts | `BranchBooking.tsx:536-537`, `CourtBooking.tsx:335-336, 514-515` | window labels, period counts | counts moved 18/9/5 → 10/10/12 on landing (F-336 row) |
| "Next booking" bar | `BranchBooking.tsx:238-300` | already **fixed by F-335**: shows a time only for a known zone | reference pattern |

## 2. Requirements (testable)

| # | Requirement |
|---|---|
| **TZ-1** | A booking time is **never rendered in a zone the client does not know**. It is either correct or absent / a placeholder — never a silent UTC reading (the F-335 bar's rule, applied everywhere). |
| **TZ-2** | A booking's zone arrives **with the booking data**, so a failed or slow `/about` cannot change what time a booking shows. |
| **TZ-3** | A receipt (booking and cancellation) is built **only from data that already includes the venue name and zone**; there is no click-time race and no `Venue —` from a pending lookup. |
| **TZ-4** | A branch with a stored but invalid zone string degrades to an explicit "time unavailable", not UTC (`safeTimeZone`'s fallback is no longer reachable from a booking render). |
| **TZ-5** | `/book` period counts and window labels do not change meaning when `/about` lands. |
| **TZ-6** | Old clients keep working: every backend change is additive. |

## 3. Options (the fix shape is open in both register rows)

| Option | What | Fixes | Cost / risk |
|---|---|---|---|
| **A. The server sends the zone (and venue name) with each booking** | slot-engine adds `branch: { id, name, timezone }` to the top-level booking in `GET /bookings/my`, `GET /bookings/:id` and the booking-create/confirm responses the PWA renders, and a zone to `/member/today-assignment` and the branch pool list | TZ-1…TZ-6 for booking screens and receipts by construction; no client race left | backend + client; one extra batched branch lookup per response (same DB; precedent `getBranchTimeZones`, `index.ts:1969`) |
| **B. The client holds times until the zone is known** | a shared `useBranchZone(branchId)` and a placeholder in every site | TZ-1 only; a failed `/about` leaves times blank forever; receipts need a disabled button | client only; ~15 sites; the failure case is a permanent blank |
| **C. Cache the last known zone per branch (localStorage)** | remember zones across visits | repeat visits only; first visit still wrong; stale if a branch's zone changes | cheap, but does not meet TZ-1 |
| **D. A then B (recommended)** | A for everything booking-shaped, **plus** B's "no time without a known zone" as the guard for any path A does not cover (older cached payloads, availability labels) | all six | the largest, but each half is small and independently shippable |

**Recommendation: D, A first.** A removes the cause for the screens and both receipt kinds; B is a thin safety net that also
closes TZ-4. C is rejected (it hides the defect on repeat visits and adds a stale-data failure mode).

## 4. Design (Option D)

**Backend (slot-engine, additive).**
- A small helper `attachBranchInfo(bookings)` that collects the distinct `branchId`s of the returned bookings, does **one**
  `prisma.branch.findMany({ where: { id: { in } }, select: { id, name, timezone } })`, and adds `branch: { id, name, timezone }`
  to each top-level booking. An unknown branch yields `branch: null` (never a made-up UTC).
- Routes: `GET /bookings/my`, `GET /bookings/:id` (+ whatever the confirm / create responses hand to `BookingConfirmation` and
  `BookingPay`), `GET /member/today-assignment` (the assignment's pool already carries `branchId`; add the zone). The branch
  pool list used by `/book` gets a `timeZone` per pool so window labels and period counts have a zone on first paint (TZ-5);
  **to verify in step 1:** that the availability and pool responses are shaped to take an additive field.
- No schema change. `Branch.timezone` is "stored unvalidated" (see the guard comments): the helper returns the raw string and the
  **client** decides validity (TZ-4), exactly as `safeTimeZone` / F-335's `isKnownTimeZone` already do.

**Client (guest-member-pwa).**
- One shared helper `bookingZone(booking)` → `string | null` (the booking's own `branch.timezone`, validated), and one
  `formatBookingTime(booking, opts)` that returns a placeholder string when the zone is not known. Every site in §1 uses it;
  the F-335 bar's local `isKnownTimeZone` moves into the shared helper (reuse, not a third copy).
- **Receipts (F-338):** `downloadBookingReceipt(booking, tenantName)` and the cancellation variant read the venue name and zone
  from `booking.branch`; the `branchAbout` parameter and the History / Confirmation / Cancel-modal plumbing for it go away.
  If `booking.branch` is `null` the receipt button is disabled with a short reason (TZ-3) — never a PDF with `Venue —`.
- The `/about` fetches stay where they are needed for the venue's address, map link and rules (not for time).

## 5. Blast radius (every consumer, stated before implementation — root rule 3a)

- *slot-engine:* the routes above; `getBranchTimeZone(s)` (reused); the regression suites that assert these payloads
  (`guest-booking`, `booking-orders`, `member-flow`, `member-multi-batch-attendance`, `multi-slot-booking`, `guest-ledger`) — additive
  fields must not break exact-shape assertions; payment and notification read bookings internally and are unaffected by an added field.
- *guest-member-pwa:* the nine sites in §1, `lib/receipt.ts`, `BookingHistory`, `BookingConfirmation`, `BookingPay`,
  `CancelBookingModal`, `main.tsx` (Home), `BranchBooking`, `CourtBooking` (the dead, unrouted `CourtBooking.tsx` carries the same
  patterns — decision in §8).
- *packages/ui-shared:* `branchTime.ts` and `format.ts` (`formatWindowRangesLabel` takes a zone argument today).
- *admin-v2 / admin-web:* do not call `/bookings/my`; admin-web (retired) is code reference only. admin-v2 reads its own branch list.
- *e2e:* `apps/guest-member-pwa` Playwright specs that assert time text (time-of-day dependent already — see its `CLAUDE.md`).

## 6. Steps (small, independently shippable and revertible)

1. **Verify** the response shapes of the booking, pool and availability routes and the receipt call sites (read-only).
2. **Backend:** `attachBranchInfo` + the routes; regression asserts `branch` is present, correct and `null` for an unknown branch.
3. **Client helper + sites** one screen per commit (History, Home, Confirmation, Pay, `/book`, cancel modal), each proven by the live repro.
4. **Receipts** (booking, then cancellation) from `booking.branch`; disabled-with-reason when null.
5. **Remove** the now-dead `branchAbout` plumbing for time; keep the venue/address uses.

## 7. Evidence (the register rows' own repros, run before and after)

- **RED → GREEN, real Chromium and real services on a scratch database, JBC at `Asia/Kolkata`, a booking at 00:30Z (6:00 AM IST),
  every `/about` delayed 4.5 s** (the technique of the 7–8 Oct repros): History, Home, Confirmation, Pay, the member-session
  card and `/book` read **`06:00 AM` from first paint** and never the UTC value; receipts read with `pdftotext` show
  `Time 06:00 AM - 07:00 AM` and `Venue JBC New Court` when downloaded **before** `/about` returns (today `12:30 AM - 01:30 AM`,
  `Venue —`); the cancellation receipt is run live (it was code-read only).
- **Failure case:** `/about` returning 500 — times and receipts still correct (TZ-2); a branch with an invalid stored zone —
  "time unavailable", no UTC (TZ-4).
- **Old client:** a build without the change still renders against the new backend.
- Rebuild before regression; `badminton_db_test` only; stop manual services on 3001–3005; typecheck, build, lint clean; the full regression run.
- **Not provable locally:** a real device on a real network; the deployed VM (needs Bala's separate go).

## 8. Risks, traps and questions

- **Time-of-day trap:** these screens depend on "now"; tests must pin a window inside the branch day and not repeat F-337's late-UTC fragility.
- **Service-worker cache:** the shell is cached; a client change must tolerate a stale cached shell calling the new backend and vice versa (hence additive-only).
- **Receipts outlive the screen:** a regenerated receipt for an old booking uses the branch's *current* zone — fine unless a branch's zone is edited later (an owner can change `Branch.timezone`); noted, not solved here.
- **Questions for Chief / Bala:**
  1. Confirm **Option D, A first** (server sends zone + venue name) over client-only B.
  2. **Venue name on the booking** (needed by TZ-3) — confirm adding `branch.name` is acceptable on the guest payload.
  3. **Dead `CourtBooking.tsx`:** fix its copies in the same pass or leave it (it is unrouted)?
  4. **Cancellation receipt:** OK to prove it live as part of this work (it was code-read only)?
  5. **Order against S1/SB:** none of this touches admin-v2; confirm it may proceed independently once approved.

**Nothing is built until Bala signs off.**
