# Pending Findings — awaiting Chief confirmation

Added Batch 8, as the structural enforcement for the ID-assignment rule in root `CLAUDE.md`'s
"Source of truth" section. That rule ("new findings get described, not numbered, until Chief
confirms") has failed twice despite being written down — F-173 (Batch 5/6), then F-174–F-178
(Batch 7) — both times because an implementing thread assigned and committed an ID before Chief
actually saw the content. Restating the rule again wasn't the fix; this file plus
`scripts/check-register.mjs`'s pending-findings check is.

## How this works

1. Whichever thread surfaces a new finding appends it below, under "Awaiting confirmation" —
   **described, not numbered.** No ID column exists here for a reason: there is nothing to
   self-assign.
2. Chief reviews (relayed by Bala) and confirms by adding `Confirmed-ID: F-NNN` and
   `Confirmed: <date>` directly onto that entry. This is the only edit Chief-side makes to this
   file, and it's what turns "Chief reviewed it" from an in-conversation exchange into a durable,
   checkable artifact.
3. Only once `Confirmed-ID:` exists does the implementing thread write the register row for that
   ID, then move the entry below into "Promoted" (kept for audit, not deleted).
4. `pnpm register:check` enforces this mechanically for every register ID at or above **F-179**
   (the first ID this mechanism governs — the existing 174 findings predate it and are not
   retroactively checked): that ID must have a matching `Confirmed-ID:` line somewhere in this
   file's "Promoted" section, or the check fails. See `scripts/CLAUDE.md` for the check's own
   internals.

Entry template:

```
### <short slug>
Batch: <N>
Surfaced: <date>
Description: <full finding text — context, description, impact>
Confirmed-ID: <blank until Chief fills this in>
Confirmed: <blank until Chief fills this in>
```

## Awaiting confirmation

### booking-branchid-unvalidated-client-scalar
Batch: 19
Surfaced: 26 Aug 2026
Description: `Booking.branchId` (services/slot-engine/src/index.ts:2277, :2584, :2616) is a bare
scalar destructured directly from POST /bookings' and POST /bookings/negotiated's request bodies
and written to the Booking row with no cross-check against the resourcePool it actually belongs
to (pool.branchId). Pre-existing, not introduced or touched by F-183 or F-184. Surfaced during
F-184's investigation because its own cross-pool daily-cap query deliberately avoids this column,
joining Booking → AvailabilityWindow → ResourcePool.branchId instead — the untrusted column is
why that join path is correct, not incidental. Not fixed here — scope discipline (rule 9).
Confirmed-ID:
Confirmed:

## Promoted (audit trail)

### daily-booking-cap-guest-per-branch
Batch: 19
Surfaced: 26 Aug 2026
Description: New capability, not a bug — supersedes the original multi-court group booking
discovery, which would have required linked-booking atomicity and a real pricing-model fork.
Reframed after investigation showed nothing currently prevents a guest from booking multiple
courts sequentially today; the actual gap was an upper bound, not a missing capability. Guest-only
cap of maxDailyBookingsPerGuest (Int, default 3, admin-configurable per BookingRule, same
per-pool-not-per-branch precedent as F-183's maxAdditionalWindows) on active (HELD + CONFIRMED)
Booking rows per guest per branch-local calendar day, counted across every pool in the branch via
Booking → AvailabilityWindow → ResourcePool.branchId (not the untrusted Booking.branchId scalar —
see the separate candidate finding filed alongside this one). Enforced inside POST /bookings'
existing transaction, gating on HELD + CONFIRMED (not CONFIRMED-only) specifically to prevent a
guest holding several bookings in parallel and getting them all confirmed independently via
separate payment webhooks after the cap should have blocked the later ones. F-183 parent/child
rows count as one reservation toward the cap (parentBookingId: null filter), matching the
GET /bookings/admin and GET /bookings/my precedent — a guest's extended-duration booking isn't
penalized relative to the same guest making several short separate bookings. POST /bookings/negotiated
deliberately left unguarded — staff retain override capacity, and the row-count approach still
correctly caps a guest's own next self-service attempt even against a mix of negotiated and
self-service bookings. Real corrections during investigation, preserved: an initial insertion-point
proposal referenced a variable (horizonTimeZone) before it was actually in scope at that point in
the transaction — caught before implementation, moved to the correct location. Original evidence
anchor for the superseded multi-court discovery (Playo comparison, 10-player scenario) carries
forward as this feature's anchor too — founder judgment and market comparison, not an observed JBC
complaint.
Confirmed-ID: F-184
Confirmed: 26 Aug 2026

### multi-slot-time-booking-phase1-contiguous-extension
Batch: 18
Surfaced: 26 Aug 2026
Description: New capability, not a bug — single-court contiguous booking extension (base 1 hour,
extendable in fixed 60-minute increments up to an admin-configurable `maxAdditionalWindows` cap
on `BookingRule`). Evidence anchor: market comparison (Playo and other EU booking platforms
support 2-hour+ bookings) plus founder judgment that additional duration options help the
business — explicitly not a direct JBC guest request or an observed booking failure, built ahead
of confirmed demand deliberately. Design: hybrid parent/child `Booking` rows — one billable
parent (real price, idempotencyKey, existing HELD→CONFIRMED lifecycle, one PaymentIntent) plus
N-1 lightweight child rows (new nullable `parentBookingId` self-relation, price/idempotencyKey
null) occupying the remaining windows so every existing windowId-keyed availability/capacity
query stays correct unmodified. New `$transaction` wrappers added to /confirm, /cancel, /check-in
(none existed previously) to cascade parent→children atomically, each also gaining a guard that
rejects a direct call on a child booking id (`400 CHILD_BOOKING_NOT_MUTABLE`) — added after
catching that a guest could otherwise call `/cancel` directly on their own child row's id (passes
the existing ownership check, since they do own it) and free that court's capacity while the
parent booking silently kept the full paid price with no refund computed. `GET /bookings/admin`
and `GET /bookings/my` both filter out `parentBookingId`-carrying rows; `cancel-preview` rejects
child rows with 400. All N AvailabilityWindow rows locked FOR UPDATE in startTime ASC order in
one transaction at booking creation — all-or-nothing. Cancellation is whole-booking-only in Phase
1 (parent + all children together), no partial refund logic needed. `FIXED_INSTANCE`
resourceId-continuity guard included per Chief decision (both real JBC pools are POOLED with null
resourceId today — guard is dormant but scoped for correctness on any future FIXED_INSTANCE
tenant). Non-contiguous multi-select explicitly deferred to a possible Phase 2, not built now.
Confirmed-ID: F-183
Confirmed: 26 Aug 2026

### dateOnly-silent-calendar-overflow
Batch: F-176/F-173 fix pass
Surfaced: 22 Aug 2026
Description: `dateOnly()` (`services/slot-engine/src/index.ts:303`) has the same vulnerability class
as F-176: it parses a date-only string via `new Date(`${value}T00:00:00.000Z`)` and only checks for
`NaN`, with no calendar-range validation, so an invalid day-of-month silently normalizes to a
different real date rather than being rejected. Live-fire confirmed directly: `dateOnly("2026-02-30")`
returns `2026-03-02T00:00:00.000Z`; `dateOnly("2026-04-31")` returns `2026-05-01T00:00:00.000Z`.
Callers: `datesInRange` (`index.ts:320-321`), used by `fromDate`/`toDate` on both
`POST /resource-pools/:id/availability-overrides` and its `GET` counterpart's query filter
(`index.ts:1477-1478`) — both admin-scoped, gated by `requirePoolScope`. Unlike F-176's own two
endpoints, `availability-overrides` is genuinely wired into the live `/scheduling` admin-web page
today. Real-world exposure is softened because a native `<input type="date">` element normally cannot
produce an invalid calendar date, so the realistic trigger is direct API access rather than a UI typo
— the same caveat F-176 itself carries. Two other call sites of `dateOnly()` (`index.ts:2106`, passing
a `Date` object; `index.ts:2136`, also a `Date` object by that point) go through the safe
object-input branch and are not affected. Surfaced during F-176/F-173's blast-radius investigation;
deliberately not fixed as part of that pass — described here for Chief to assign an ID and prioritize
separately.
Confirmed-ID: F-179
Confirmed: 22 Aug 2026

### production-db-credential-exposure-two-mechanisms
Batch: 13-15 close-out
Surfaced: 22 Aug 2026
Description: Production DB credential exposure via two independent mechanisms during a
deployment close-out. A `sed` mask searching for `postgres://` against the real
`postgresql://` scheme silently failed to match, allowing plaintext passthrough; separately,
`sudo`'s command-line audit logging to `/var/log/auth.log` captured inline secrets regardless
of the command's own output — two distinct leak vectors, not one. Resolved via a third
rotation using heredoc/stdin exclusively, confirmed clean end-to-end across sed-mask,
sudo-log, and session-transcript surfaces by tracing the real log/transcript data directly.
Tracing itself surfaced a third incident (`sed -i` orphaning `rsyslogd`'s open file
descriptor, recovered via `/proc/<pid>/fd/` and a `SIGHUP`). Two `deploy/gcp-vm/CLAUDE.md`
traps added for the original vectors (7, 8), a third (9) for the `sed -i`/rsyslog incident.
Residual: two dead passwords remain in the local session transcript and the systemd journal,
both inert and accepted as reasonable residual risk given genuine technical constraints
against safe per-entry scrubbing.
Confirmed-ID: F-180
Confirmed: 22 Aug 2026

### health-endpoint-liveness-not-readiness
Batch: 17
Surfaced: 22 Aug 2026
Description: `/health` on all 7 components reports `{status:"ok"}` while database
authentication is actively failing platform-wide. Discovered during the 22 Aug 2026
`jbc.elitecourts.duckdns.org` outage: for roughly 2 hours, every DB-backed request on
`tenant-management` (and, by the same mechanism, the other 4 `DATABASE_URL`-consuming
services) failed with Prisma `P1000` — a stale credential left in the running containers'
environment after Batch 15's third Postgres rotation updated `.env` without recreating
them (exact repeat of `deploy/gcp-vm/CLAUDE.md` trap 10). `/health` on every affected
service kept returning `200 {"status":"ok"}` throughout, confirmed live at the same moment
`/api/tenant/tenants/by-subdomain/jbc` was returning `500` with the raw Prisma auth-failure
message. The check verifies the service process is running and answering HTTP, not that
its actual dependencies — here, database authentication — are functional, so it masked a
platform-wide P0 for its full duration; discovery was a user report, not the health check
that should have caught it first. Fix direction: `/health` (or a companion readiness check)
should exercise a real DB query, not just process liveness.
Confirmed-ID: F-181
Confirmed: 22 Aug 2026

### branch-schedule-schema-weak-client-regex
Batch: 16
Surfaced: 22 Aug 2026
Description: `branchScheduleSchema`'s `workingHoursStart`/`workingHoursEnd`
(`apps/admin-web/src/main.tsx:193-196`) validate with the same digit-count-only regex
(`/^\d{2}:\d{2}$/`) F-174 fixed on `patternSchema`/`overrideSchema` — accepts out-of-range values
like `25:99` client-side. Same file, immediately adjacent to F-174's two schemas, single consumer
(`main.tsx:817`, `PATCH /tenant/branches/:id` via `saveBranch`). Now correctly backstopped
server-side by `tenant-management`'s `WORKING_HOURS_RE` (`services/tenant-management/src/index.ts:219`,
added under F-175/F-177 in Batch 11) — `/^([01]\d|2[0-3]):([0-5]\d)$/`, explicitly commented as
mirroring `slot-engine`'s `validateTimeString`. Natural continuation of the domain sweep's own
pattern: F-175 tightened the server side of this exact field back in Batch 11, but the client-side
regex was never revisited to match — same class of cosmetic papercut as F-174 itself, just surfacing
on a field that only recently got its own server-side backstop. Surfaced during F-174's investigation
(Batch 16), deliberately not folded into that fix or self-numbered — described for Chief to assign an
ID separately.
Confirmed-ID: F-182
Confirmed: 22 Aug 2026
