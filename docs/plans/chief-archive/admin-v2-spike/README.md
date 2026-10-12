# admin-v2 revamp — Spike (probes P1–P6, plus P1b and P7)

**Run:** 12 Oct 2026, 07:36 UTC, by Claude Code, on Bala's explicit go. **No product code was written.** The
probe scripts in `probes/` are throwaway harness code, archived here as evidence of *how* the output was
produced; they are not part of the product and not wired into any build or CI.

**Plan this belongs to:** `docs/plans/admin-v2-revamp-plan-mode.md` §5 "Spike" (revision 3 records the results).
**Raw output:** `spike-raw-output.txt` (unedited: every request, status, body and SQL read-back, as printed;
the only things suppressed *inside the log itself* are the bodies of the two big read-only GETs, which the probe
reduces to the cells it is asking about — marked `body suppressed`).

## What it ran against

| Item | Value |
|---|---|
| Database | `badminton_db_scratch_spike` on a **throwaway local PostgreSQL 16.15** (own data directory under `/var/tmp`, port 65500). **Not `badminton_db`, not `badminton_db_test`** — a fresh cluster with a fresh database whose name also satisfies the F-101 guard pattern (`scratch`). |
| Schema | `prisma migrate deploy` — all migrations through `20260927120000_booking_orders_f310`. |
| Code | the five services built from the working tree at `3e79083` (service code is identical on `main` `aa18866`; the later `main` commits touch only `guest-member-pwa`). Node v22.22.0, pnpm 11.17.0. |
| Services | `slot-engine` :3001, `identity-auth` :3002, `tenant-management` :3003, `payment` :3004, `notification` :3005 — the real built `dist/index.js`, `NODE_ENV=development`, `INTERNAL_SERVICE_KEY` left at its dev default. Ports 3001–3005 were free before and after (no manual services running). |
| Fixture | one tenant, one UTC branch, one **POOLED** pool of 4 courts (`capacity 4`, JBC's shape), `BookingRule.gracePeriodMinutes = 60` (JBC's value), `MEMBER_MANAGEMENT` + `GUEST_BOOKING` entitlements active, an ACTIVE all-days 06:00–22:00 `AvailabilityPattern`; windows generated lazily by the real `GET /availability` exactly as in production. Members get an `active` `Subscription` by direct insert (no route creates one — see P4). Guests' captured `PaymentIntent`s are seeded directly. Every probe calls `TRUNCATE … CASCADE` first, so probes do not contaminate one another. |
| Identity | tokens are real HS256 JWTs from the shared test harness (`signJwt`), the same claim shape the login route mints; "scoped manager" = `roles: ["branch_manager:<branchId>"]`, "owner" = `roles: ["owner"]`. |

## Commands (in order)

```bash
# 1. scratch Postgres (the postgres OS user cannot read /tmp/claude-0, so the data dir is under /var/tmp)
PGB=/usr/lib/postgresql/16/bin; D=/var/tmp/spike-pgdata
mkdir -p $D && chown postgres $D && chmod 700 $D
su postgres -c "$PGB/initdb -D $D -U postgres --auth=trust"
su postgres -c "$PGB/pg_ctl -D $D -o '-p 65500 -c listen_addresses=127.0.0.1' -l /var/tmp/spike-pg.log start"
$PGB/psql -h 127.0.0.1 -p 65500 -U postgres -c "create database badminton_db_scratch_spike"

# 2. schema + rebuild-before-test
export DATABASE_URL="postgresql://postgres@127.0.0.1:65500/badminton_db_scratch_spike?schema=public"
pnpm --filter @badminton/database exec prisma migrate deploy      # "All migrations have been successfully applied."
pnpm --filter @badminton/database exec prisma generate
pnpm -r --filter '!@badminton/admin-v2' --filter '!@badminton/guest-member-pwa' --filter '!@badminton/admin-web' run build   # all clean

# 3. services (probes/start-services.sh start) — health checked on 3001-3005, all "ok"
# 4. probes
SPIKE_OUT=<path>/spike-raw-output.txt node probes.mjs          # P1, P1b, P2, P3, P4, P5, P6, P7 in one pass
# 5. services stopped (probes/start-services.sh stop); ports 3001-3005 confirmed free
```

P1 was first run alone to validate the harness (it failed first on `NO_AVAILABILITY_PATTERN`, because the
fixture had no `AvailabilityPattern` — the route correctly refused; the fixture was fixed, nothing else was
changed). The archived output is the **single clean full pass** after that.

## Readout (Claude Code's reading; the raw output is the evidence)

| Probe | Prediction (plan rev 2, code-read) | Observed | Verdict |
|---|---|---|---|
| **P1** 8 members, capacity 4 | members 1–4 confirm, 5th `409 MEMBER_SLOT_AT_CAPACITY` | exactly that: **4 of 8 confirm; members 5–8 get `409 MEMBER_SLOT_AT_CAPACITY`**; 4 `Booking` rows, `isMemberBooking = t`, `resourceId` null | **Confirmed.** An 8-member batch cannot attend a capacity-4 pool today. |
| **P1b-a** 3-member batch | footprint = confirming members | 3 confirmed → `capacity_consumed 3 of 4`; a negotiated walk-in then **succeeds on the 4th unit** (`201`, court 1, `HELD`) | **Confirmed.** Footprint is the member count, not courts. |
| **P1b-b** two 3-member batches, same hour | second batch squeezed | 6 members, **4 confirm, 2 refused `409`** (members 5–6); both batches share one pool-hour | **Confirmed.** Two same-hour batches in one pool compete for the pool's capacity. |
| **P2** 1-member batch | all four courts locked | grid: **all four courts `member-blocked`** at that hour (control before: all four `guest-vacant`); availability: the hour **disappears** (remainingCapacity 4 → not returned); guest `POST /bookings` → `409 MEMBER_SLOT_RESERVED`. The member had **not even confirmed** | **Confirmed.** One member locks the whole pool-hour, from the moment the assignment exists. |
| **P3** manager walk-in onto member window | no guard without `releaseGroupId` | (a) scoped manager, no `releaseGroupId`: **`201 CONFIRMED`** — a paid guest booking placed on a member-reserved window, court 1, no check. (b) with `releaseGroupId` and the member CONFIRMED: **`409 RELEASE_NO_LONGER_ELIGIBLE`**. (c) control: after cutoff, nobody confirmed, with `releaseGroupId`: `201` | **Confirmed.** The guard is opt-in; the unguarded path is open to a scoped manager. |
| **P4** no `Subscription` | `409 SUBSCRIPTION_INACTIVE` | exactly that; `GET /member/today-assignment` returns `state: SUBSCRIPTION_INACTIVE`; 0 `Booking` rows | **Confirmed.** |
| **P5** single-pool branch collision | `relocated 0`, refunds | preview `{scanned: 3}`; creating the first assignment returned `collisionSweep {scanned 3, relocated 0, cancelled 3, failed []}`; both CONFIRMED bookings `CANCELLED` with `refundAmount 100.00` and **two `Refund` rows `processed`**; the HELD one cancelled | **Confirmed.** |
| **P6** partial overlap | everything displaced | capacity 4, **2** guest bookings, a 2-member batch: preview `{scanned: 2}`; the first assignment **cancelled and refunded both**; the second assignment found nothing | **Confirmed.** Two courts would have remained for guests under a 2-court batch; both guests were displaced and refunded anyway. |
| **P7** (extra, see below) | not predicted | (i) the **same member cannot join a second batch in the same pool** (`409 ASSIGNMENT_ALREADY_EXISTS`, `@@unique([userId, resourcePoolId])`); (ii) a batch created today (not the 1st) is **queued to 1 Nov**, its assignment is `ACTIVE` with `startDate 2026-11-01`, yet **today's 16:00 window is already withheld from guests** | **New observations, outside the brief.** |

**Guest notification (D13).** Across the whole run the notification service logged exactly two
`POST /notifications/send` calls, both at 07:36:41 UTC during P3 (the two `booking_confirmed` sends for the
two paid walk-ins). **P5 and P6 (07:36:42–43), where five guest bookings were cancelled and four refunded,
produced none.** The sweep path (`runMemberCollisionSweep` → `cancelBookingCore` → payment `POST /refunds`)
contains no notification call (code read: `cancelBookingCore`, `index.ts:5334–5427`, has no `fetch` or send;
slot-engine's only `/notifications/send` call sites are `slot_release_reminder`, `low_occupancy_alert`,
`batch_renewal_reminder`, `booking_confirmed` and `guest_booking_reminder`; payment's `POST /refunds` sends
nothing). **Displaced guests are not notified today.**

**What the Spike does not prove.** It ran against a fresh single-tenant fixture, not JBC's production data.
**A `Refund` row is bookkeeping only:** payment `POST /refunds` writes the row with `status: 'processed'`
(`services/payment/src/index.ts:732–739`) and I found **no gateway call** in that route or anywhere in the file (grep for a Razorpay refund call returned nothing; code read, and
consistent with the rows in P5 / P6). So "refunded" in a P5 / P6 sense means *recorded*; whether the money
actually goes back to the guest is a separate manual step. The seeded intents are `cash_` refs, so no gateway
path was exercised either way. P7(ii) was observed on availability only, not on the grid or a guest booking attempt.
