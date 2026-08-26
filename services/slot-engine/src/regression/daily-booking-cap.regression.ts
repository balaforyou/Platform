import { Section, inspect } from '@badminton/test-harness';
import {
  db,
  baseUrl,
  internalKey,
  bookingHeaders,
  TENANT_ID,
  BRANCH_ID,
  SlotEngineContext,
} from './_fixtures';
import { branchLocalToUtc, addBranchDays, branchDateString, DEFAULT_TIME_ZONE } from '../branchTime.js';

/**
 * F-184 — DAILY BOOKING CAP (GUEST-ONLY, PER BRANCH).
 *
 * A guest may hold at most `BookingRule.maxDailyBookingsPerGuest` active (HELD +
 * CONFIRMED) self-service Bookings per branch-local calendar day, counted across every
 * pool in the branch via Booking -> AvailabilityWindow -> ResourcePool.branchId (never
 * the untrusted Booking.branchId scalar — see the booking-branchid-unvalidated-client-
 * scalar candidate finding filed alongside F-184). POST /bookings/negotiated is
 * deliberately unguarded; the cap still correctly counts a negotiated row against the
 * same guest's own next self-service attempt.
 *
 * Self-contained: every pool/rule/window here is created fresh per section via the HTTP
 * API (or, for the midnight-boundary section, directly via Prisma for a second Branch
 * row — slot-engine's own API has no branch-creation endpoint), reusing TENANT_ID/
 * BRANCH_ID from _fixtures.ts (already seeded by setupBaseFixtures() before any section
 * runs).
 */

const REGRESSION_TIERED_POLICY = {
  type: 'tiered',
  tiers: [
    { min_hours_before_slot: 24, refund_percent: 100 },
    { min_hours_before_slot: 1, refund_percent: 50 },
    { min_hours_before_slot: 0, refund_percent: 0 },
  ],
};

/**
 * All windows this suite creates sit on a branch-local calendar day 2 days out from
 * "now" (well inside the default 7-day guestOpenWindowDays horizon), computed via the
 * SAME branchTime helpers production code uses (`branchLocalToUtc`/`addBranchDays`/
 * `branchDateString`) rather than a fixed hour offset from `Date.now()` — a fixed offset
 * can silently roll onto a different calendar day depending on what time the suite
 * happens to run (F-073), which would be a direct correctness problem for a suite
 * specifically about calendar-day boundaries.
 */
function localDateTwoDaysOut(timeZone: string): string {
  return branchDateString(addBranchDays(new Date(), 2, timeZone), timeZone);
}

async function createPoolWithRule(opts: {
  branchId?: string;
  maxDailyBookingsPerGuest?: number;
  maxAdditionalWindows?: number;
  capacity?: number;
}): Promise<{ pool: any }> {
  const branchId = opts.branchId ?? BRANCH_ID;
  const capacity = opts.capacity ?? 4;
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId,
      name: `F-184 Pool ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      allocationMode: 'POOLED',
      capacity,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      maxAdditionalWindows: opts.maxAdditionalWindows ?? 1,
      ...(opts.maxDailyBookingsPerGuest !== undefined ? { maxDailyBookingsPerGuest: opts.maxDailyBookingsPerGuest } : {}),
      cancellationPolicyJson: REGRESSION_TIERED_POLICY,
    }),
  });

  return { pool };
}

/** Creates one 1-hour AvailabilityWindow per entry in `localHours` (branch-local "HH:00"), all on `dateString`. */
async function createWindowsOnDate(
  poolId: string,
  dateString: string,
  timeZone: string,
  localHours: number[],
): Promise<any[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const windows: any[] = [];
  for (const hour of localHours) {
    const start: Date = branchLocalToUtc(dateString, `${pad(hour)}:00`, timeZone);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const res = await fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
      body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
    });
    windows.push(((await res.json()) as any).data);
  }
  return windows;
}

async function bookWindow(userId: string, idempotencyKey: string, body: Record<string, any>) {
  return inspect(
    await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: bookingHeaders(userId, idempotencyKey),
      body: JSON.stringify(body),
    }),
  );
}

async function confirmBooking(id: string) {
  const res = await inspect(
    await fetch(`${baseUrl}/bookings/${id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${internalKey}` },
    }),
  );
  if (res.status !== 200) {
    throw new Error(`Expected 200 confirming booking ${id}, got ${res.status}: ${res.raw}`);
  }
  return res;
}

export const dailyBookingCapSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-184: exactly at cap — 3rd booking succeeds, 4th is rejected 400 DAILY_BOOKING_LIMIT_REACHED before any hold row exists',
    async run() {
      const { pool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 3 });
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const windows = await createWindowsOnDate(pool.id, date, DEFAULT_TIME_ZONE, [2, 4, 6, 8]);
      const userId = 'f184-at-cap-user';

      for (let i = 0; i < 3; i++) {
        const res = await bookWindow(userId, `f184-at-cap-key-${i}`, {
          branchId: BRANCH_ID,
          resourcePoolId: pool.id,
          windowId: windows[i].id,
        });
        if (res.status !== 201) {
          throw new Error(`Expected 201 for booking #${i + 1} (within cap), got ${res.status}: ${res.raw}`);
        }
      }

      const beforeAttempt = await db.booking.count({ where: { windowId: windows[3].id } });

      const rejected = await bookWindow(userId, 'f184-at-cap-key-4th', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windows[3].id,
      });
      console.log(
        'F184_EVIDENCE at_cap_4th',
        JSON.stringify({ status: rejected.status, code: rejected.json?.error?.code }),
      );
      if (rejected.status !== 400 || rejected.json?.error?.code !== 'DAILY_BOOKING_LIMIT_REACHED') {
        throw new Error(`Expected 400 DAILY_BOOKING_LIMIT_REACHED for the 4th booking, got ${rejected.status}: ${rejected.raw}`);
      }

      const afterAttempt = await db.booking.count({ where: { windowId: windows[3].id } });
      if (beforeAttempt !== 0 || afterAttempt !== 0) {
        throw new Error(`Expected no Booking row ever created for the 4th window, before=${beforeAttempt} after=${afterAttempt}`);
      }
    },
  },

  {
    name: 'F-184: cross-pool — 2 confirmed bookings on one pool block a 3rd attempt on a different pool in the same branch/day',
    async run() {
      const { pool: poolA } = await createPoolWithRule({ maxDailyBookingsPerGuest: 2 });
      const { pool: poolB } = await createPoolWithRule({ maxDailyBookingsPerGuest: 2 });
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const [w1] = await createWindowsOnDate(poolA.id, date, DEFAULT_TIME_ZONE, [2]);
      const [w2] = await createWindowsOnDate(poolA.id, date, DEFAULT_TIME_ZONE, [4]);
      const [w3] = await createWindowsOnDate(poolB.id, date, DEFAULT_TIME_ZONE, [6]);
      const userId = 'f184-cross-pool-user';

      const b1 = await bookWindow(userId, 'f184-cross-pool-key-1', {
        branchId: BRANCH_ID, resourcePoolId: poolA.id, windowId: w1.id,
      });
      const b2 = await bookWindow(userId, 'f184-cross-pool-key-2', {
        branchId: BRANCH_ID, resourcePoolId: poolA.id, windowId: w2.id,
      });
      if (b1.status !== 201 || b2.status !== 201) {
        throw new Error(`Expected both pool-A bookings to succeed, got ${b1.status} / ${b2.status}`);
      }
      const booking1 = b1.json?.data ?? b1.json;
      const booking2 = b2.json?.data ?? b2.json;
      await confirmBooking(booking1.id);
      await confirmBooking(booking2.id);

      const attempt = await bookWindow(userId, 'f184-cross-pool-key-3', {
        branchId: BRANCH_ID, resourcePoolId: poolB.id, windowId: w3.id,
      });
      console.log(
        'F184_EVIDENCE cross_pool',
        JSON.stringify({ status: attempt.status, code: attempt.json?.error?.code }),
      );
      if (attempt.status !== 400 || attempt.json?.error?.code !== 'DAILY_BOOKING_LIMIT_REACHED') {
        throw new Error(`Expected 400 DAILY_BOOKING_LIMIT_REACHED on the 2nd pool, got ${attempt.status}: ${attempt.raw}`);
      }
    },
  },

  {
    name: 'F-184: race — 3 rapid concurrent HELD bookings all succeed, a 4th is rejected at creation',
    async run() {
      const { pool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 3 });
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const windows = await createWindowsOnDate(pool.id, date, DEFAULT_TIME_ZONE, [2, 4, 6, 8]);
      const userId = 'f184-race-user';

      const results = await Promise.all(
        [0, 1, 2].map((i) =>
          bookWindow(userId, `f184-race-key-${i}`, {
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[i].id,
          }),
        ),
      );
      const statuses = results.map((r) => r.status);
      console.log('F184_EVIDENCE race_concurrent', JSON.stringify({ statuses }));
      if (statuses.some((s) => s !== 201)) {
        throw new Error(`Expected all 3 concurrent bookings to succeed with 201, got ${JSON.stringify(statuses)}`);
      }
      const heldStatuses = await Promise.all(
        results.map(async (r) => {
          const b = r.json?.data ?? r.json;
          const row = await db.booking.findUnique({ where: { id: b.id } });
          return row?.status;
        }),
      );
      if (heldStatuses.some((s) => s !== 'HELD')) {
        throw new Error(`Expected all 3 to be HELD, got ${JSON.stringify(heldStatuses)}`);
      }

      const rejected = await bookWindow(userId, 'f184-race-key-4th', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windows[3].id,
      });
      console.log(
        'F184_EVIDENCE race_4th',
        JSON.stringify({ status: rejected.status, code: rejected.json?.error?.code }),
      );
      if (rejected.status !== 400 || rejected.json?.error?.code !== 'DAILY_BOOKING_LIMIT_REACHED') {
        throw new Error(`Expected 400 DAILY_BOOKING_LIMIT_REACHED for the 4th booking, got ${rejected.status}: ${rejected.raw}`);
      }
    },
  },

  {
    name: 'F-184: branch-local midnight boundary — same UTC calendar day, different branch-local days, are NOT the same cap-day',
    async run() {
      // Pacific/Kiritimati is UTC+14 with no DST — the largest positive real-world
      // offset, chosen specifically so branch-local date and UTC date diverge by a full
      // calendar day for a wide window, making the divergence easy to hit deterministically.
      const timeZone = 'Pacific/Kiritimati';
      const midnightBranchId = 'f184-midnight-branch-11111111';
      await db.branch.upsert({
        where: { id: midnightBranchId },
        update: { timezone: timeZone },
        create: { id: midnightBranchId, tenantId: TENANT_ID, name: 'F-184 Midnight Branch', status: 'ACTIVE', timezone: timeZone },
      });

      const { pool } = await createPoolWithRule({ branchId: midnightBranchId, maxDailyBookingsPerGuest: 1 });

      // dateA = branch-local day N, 2 days out. windowA sits at local 23:00 on day N.
      // windowB sits at local 00:00 on day N+1 -- only 1 hour later in UTC (23:00 - 14:00
      // offset vs 00:00 - 14:00 offset the next calendar day = same UTC date, 60 minutes
      // apart), but a DIFFERENT branch-local calendar day. Both stay hour-aligned (the
      // pool's default 60-minute slot boundary, F-010) -- :30 would be rejected 400
      // UNALIGNED_TIME_BOUNDARY before the daily-cap logic this section is testing ever runs.
      const dateA = localDateTwoDaysOut(timeZone);
      const dateAStartUtc: Date = branchLocalToUtc(dateA, '00:00', timeZone);
      const dateB: string = branchDateString(addBranchDays(dateAStartUtc, 1, timeZone), timeZone);

      const windowAStart: Date = branchLocalToUtc(dateA, '23:00', timeZone);
      const windowAEnd = new Date(windowAStart.getTime() + 60 * 60 * 1000);
      const windowBStart: Date = branchLocalToUtc(dateB, '00:00', timeZone);
      const windowBEnd = new Date(windowBStart.getTime() + 60 * 60 * 1000);
      const windowCStart: Date = branchLocalToUtc(dateB, '01:00', timeZone);
      const windowCEnd = new Date(windowCStart.getTime() + 60 * 60 * 1000);

      console.log(
        'F184_EVIDENCE midnight_boundary_setup',
        JSON.stringify({
          dateA, dateB,
          windowAStartUtc: windowAStart.toISOString(),
          windowBStartUtc: windowBStart.toISOString(),
          sameUtcDate: windowAStart.toISOString().slice(0, 10) === windowBStart.toISOString().slice(0, 10),
        }),
      );
      if (windowAStart.toISOString().slice(0, 10) !== windowBStart.toISOString().slice(0, 10)) {
        throw new Error('Test setup invariant broken: windowA and windowB were expected to share the same UTC calendar date');
      }

      const makeWindow = async (start: Date, end: Date) => {
        const res = await inspect(
          await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
            body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
          }),
        );
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`Expected success creating a window at ${start.toISOString()}, got ${res.status}: ${res.raw}`);
        }
        return res.json?.data ?? res.json;
      };
      const windowA = await makeWindow(windowAStart, windowAEnd);
      const windowB = await makeWindow(windowBStart, windowBEnd);
      const windowC = await makeWindow(windowCStart, windowCEnd);

      const userId = 'f184-midnight-user';

      const bookA = await bookWindow(userId, 'f184-midnight-key-a', {
        branchId: midnightBranchId, resourcePoolId: pool.id, windowId: windowA.id,
      });
      if (bookA.status !== 201) {
        throw new Error(`Expected 201 booking windowA (day N, cap 1), got ${bookA.status}: ${bookA.raw}`);
      }

      // windowB shares windowA's UTC calendar date but sits on branch-local day N+1 --
      // if the cap were (wrongly) computed on UTC date, this would be rejected. It must
      // succeed, because branch-local day N+1's quota is untouched.
      const bookB = await bookWindow(userId, 'f184-midnight-key-b', {
        branchId: midnightBranchId, resourcePoolId: pool.id, windowId: windowB.id,
      });
      console.log('F184_EVIDENCE midnight_boundary_b', JSON.stringify({ status: bookB.status, code: bookB.json?.error?.code }));
      if (bookB.status !== 201) {
        throw new Error(`Expected 201 booking windowB (different branch-local day despite same UTC date), got ${bookB.status}: ${bookB.raw}`);
      }

      // windowC is also on branch-local day N+1, whose quota (cap 1) windowB already used.
      const bookC = await bookWindow(userId, 'f184-midnight-key-c', {
        branchId: midnightBranchId, resourcePoolId: pool.id, windowId: windowC.id,
      });
      console.log('F184_EVIDENCE midnight_boundary_c', JSON.stringify({ status: bookC.status, code: bookC.json?.error?.code }));
      if (bookC.status !== 400 || bookC.json?.error?.code !== 'DAILY_BOOKING_LIMIT_REACHED') {
        throw new Error(`Expected 400 DAILY_BOOKING_LIMIT_REACHED for windowC (day N+1's quota already used by windowB), got ${bookC.status}: ${bookC.raw}`);
      }
    },
  },

  {
    name: 'F-184: F-183 interaction — a 3-hour parent+child booking counts as 1 reservation toward the cap',
    async run() {
      const { pool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 3, maxAdditionalWindows: 2 });
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const windows = await createWindowsOnDate(pool.id, date, DEFAULT_TIME_ZONE, [2, 3, 4, 6, 8]);
      const userId = 'f184-f183-interaction-user';

      // windows[0..2] are contiguous hours -- a 3-hour multi-window booking (1 parent + 2 children).
      const multi = await bookWindow(userId, 'f184-f183-key-multi', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windows[0].id,
        additionalWindowIds: [windows[1].id, windows[2].id],
      });
      if (multi.status !== 201) {
        throw new Error(`Expected 201 for the 3-hour multi-window booking, got ${multi.status}: ${multi.raw}`);
      }
      const parent = multi.json?.data ?? multi.json;
      if (!Array.isArray(parent.childBookings) || parent.childBookings.length !== 2) {
        throw new Error(`Expected 2 child bookings on the parent, got ${JSON.stringify(parent.childBookings)}`);
      }

      // The guest can still make a 2nd and a 3rd single-hour booking the same day -- the
      // multi-window booking above must count as exactly 1 reservation, not 3.
      const second = await bookWindow(userId, 'f184-f183-key-second', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: windows[3].id,
      });
      console.log('F184_EVIDENCE f183_interaction_second', JSON.stringify({ status: second.status }));
      if (second.status !== 201) {
        throw new Error(`Expected 201 for the 2nd single-hour booking (multi-window booking should count as 1), got ${second.status}: ${second.raw}`);
      }

      const third = await bookWindow(userId, 'f184-f183-key-third', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: windows[4].id,
      });
      console.log('F184_EVIDENCE f183_interaction_third', JSON.stringify({ status: third.status }));
      if (third.status !== 201) {
        throw new Error(`Expected 201 for the 3rd single-hour booking, got ${third.status}: ${third.raw}`);
      }
    },
  },

  {
    name: 'F-184: negotiated-bypass — a guest at cap via /bookings/negotiated is still correctly rejected on their own POST /bookings attempt',
    async run() {
      const { pool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 1 });
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const [w1, w2] = await createWindowsOnDate(pool.id, date, DEFAULT_TIME_ZONE, [2, 4]);
      const userId = 'f184-negotiated-bypass-user';

      const negotiatedRes = await inspect(
        await fetch(`${baseUrl}/bookings/negotiated`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalKey}`,
            'idempotency-key': 'f184-negotiated-key',
          },
          body: JSON.stringify({
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: w1.id,
            userId,
            negotiatedPrice: 150,
          }),
        }),
      );
      if (negotiatedRes.status !== 201) {
        throw new Error(`Expected 201 creating the negotiated booking, got ${negotiatedRes.status}: ${negotiatedRes.raw}`);
      }

      const selfServiceAttempt = await bookWindow(userId, 'f184-negotiated-self-service-key', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: w2.id,
      });
      console.log(
        'F184_EVIDENCE negotiated_bypass',
        JSON.stringify({ status: selfServiceAttempt.status, code: selfServiceAttempt.json?.error?.code }),
      );
      if (selfServiceAttempt.status !== 400 || selfServiceAttempt.json?.error?.code !== 'DAILY_BOOKING_LIMIT_REACHED') {
        throw new Error(
          `Expected the guest's own self-service attempt to be rejected 400 DAILY_BOOKING_LIMIT_REACHED (cap already used by the negotiated row), got ${selfServiceAttempt.status}: ${selfServiceAttempt.raw}`,
        );
      }
    },
  },

  {
    name: 'F-184: regression — 0 to 2 bookings/day for a guest under the default cap are entirely unaffected',
    async run() {
      const { pool } = await createPoolWithRule({});
      const date = localDateTwoDaysOut(DEFAULT_TIME_ZONE);
      const windows = await createWindowsOnDate(pool.id, date, DEFAULT_TIME_ZONE, [2, 4]);
      const userId = 'f184-regression-user';

      const first = await bookWindow(userId, 'f184-regression-key-1', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: windows[0].id,
      });
      if (first.status !== 201) {
        throw new Error(`Expected 201 for the 1st booking of the day (well under the default cap of 3), got ${first.status}: ${first.raw}`);
      }

      const second = await bookWindow(userId, 'f184-regression-key-2', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: windows[1].id,
      });
      console.log('F184_EVIDENCE regression_unaffected', JSON.stringify({ firstStatus: first.status, secondStatus: second.status }));
      if (second.status !== 201) {
        throw new Error(`Expected 201 for the 2nd booking of the day (still under the default cap of 3), got ${second.status}: ${second.raw}`);
      }
    },
  },
];
