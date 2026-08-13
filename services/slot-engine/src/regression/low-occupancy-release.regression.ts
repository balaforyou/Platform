import { Section, signJwt } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID, USER_ID_1, USER_ID_2 } from './_fixtures';

/**
 * SWEEP / RELEASE MECHANICS.
 * Migrated verbatim from concurrency.test.ts Tests 5-6.
 */
export const lowOccupancyReleaseSections: Section<SlotEngineContext>[] = [
  {
    name: 'Held-booking expiry sweep (expired HELD → RELEASED_NO_SHOW)',
    async run(ctx) {
      await db.booking.deleteMany();

      const expiredHold = await db.booking.create({
        data: {
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pooledPool.id,
          windowId: ctx.pooledWindow.id,
          userId: USER_ID_1,
          status: BookingStatus.HELD,
          heldAt: new Date(Date.now() - 10 * 60 * 1000),
          heldUntil: new Date(Date.now() - 5 * 60 * 1000),
          idempotencyKey: 'expired-hold-key',
        },
      });
      console.log(`Expired HELD booking created with ID: ${expiredHold.id}`);

      const sweepRes = await fetch(`${baseUrl}/bookings/sweep`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      const sweepData = ((await sweepRes.json()) as any).data;
      console.log('Sweep result:', sweepData);

      if (sweepData.expiredHoldsCount === 0) {
        throw new Error('Expected at least 1 expired hold to be swept.');
      }

      const updatedHold = await db.booking.findUnique({ where: { id: expiredHold.id } });
      if (updatedHold?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error(`Expected status to be RELEASED_NO_SHOW, got ${updatedHold?.status}`);
      }
    },
  },

  {
    // F-065: the member's displayed deadline and the sweep's release must be ONE value,
    // and the admin's low-occupancy alert must keep its own, earlier one.
    //
    // The clock is never faked. The window is pinned a few minutes ahead and the RULE moves
    // around it: a grace period shorter than that gap leaves the member un-released while the
    // alert's much longer cutoff has already passed, and a grace period longer than the gap
    // releases them. That is the 90-minute disagreement F-065 records, expressed in a way
    // that does not depend on the wall-clock hour.
    //
    // WHY THE RULE MOVES AND NOT THE WINDOW (F-073): the service resolves the window as
    // today's branch date plus the assignment's startTime, so a window pushed far enough
    // ahead to cross UTC midnight lands on a date the lookup will never search. Seeding
    // relative offsets of an hour or more is exactly the flaw F-073 records, and it makes
    // the suite fail near midnight. Keeping the offset to minutes and varying the rule
    // instead removes that dependency.
    name: 'F-065: member release uses gracePeriodMinutes while the low-occupancy alert keeps guestAccessCutoffMinutes',
    async run() {
      const POOL = 'f065-reg-pool';
      const USER = 'f065-reg-user';

      const cleanup = async () => {
        await db.booking.deleteMany({ where: { resourcePoolId: POOL } });
        await db.memberGroupAssignment.deleteMany({ where: { resourcePoolId: POOL } });
        await db.availabilityWindow.deleteMany({ where: { resourcePoolId: POOL } });
        await db.bookingRule.deleteMany({ where: { resourcePoolId: POOL } });
        await db.resource.deleteMany({ where: { resourcePoolId: POOL } });
        await db.resourcePool.deleteMany({ where: { id: POOL } });
        await db.subscription.deleteMany({ where: { userId: USER } });
        await db.user.deleteMany({ where: { id: USER } });
        await db.scheduledJobDispatch.deleteMany({ where: { jobName: 'low_occupancy_alert' } });
      };

      // Minutes from now to the window, clamped so it always stays inside today's UTC date.
      const now = new Date();
      const minutesLeftToday = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 60000);
      const gap = Math.min(10, minutesLeftToday - 1);
      if (gap < 3) {
        throw new Error(`Cannot construct this scenario within ${minutesLeftToday} minutes of UTC midnight (needs 3).`);
      }

      // graceShort leaves the member inside their deadline; graceLong puts them past it.
      const graceShort = 1;
      const graceLong = gap + 5;

      const seed = async (gracePeriodMinutes: number) => {
        await cleanup();
        const windowStart = new Date(Date.now() + gap * 60 * 1000);
        windowStart.setUTCSeconds(0, 0);
        const startTime = `${String(windowStart.getUTCHours()).padStart(2, '0')}:${String(windowStart.getUTCMinutes()).padStart(2, '0')}`;
        // Derived from NOW, the same clock the service uses to pick today's weekday.
        const day = new Date().getUTCDay();

        await db.resourcePool.create({
          data: { id: POOL, tenantId: TENANT_ID, branchId: BRANCH_ID, name: 'F065 Pool', allocationMode: 'POOLED', capacity: 4 },
        });
        await db.resource.create({ data: { id: `${POOL}-res`, resourcePoolId: POOL, name: 'Court F065' } });
        await db.availabilityWindow.create({
          data: {
            resourcePoolId: POOL, resourceId: `${POOL}-res`,
            startTime: windowStart, endTime: new Date(windowStart.getTime() + 60 * 60 * 1000), capacity: 4,
          },
        });
        await db.bookingRule.create({
          data: {
            resourcePoolId: POOL,
            gracePeriodMinutes,             // the member deadline: displayed, enforced, released
            guestAccessCutoffMinutes: 120,  // the admin alert's own, much earlier trigger
            lowOccupancyThresholdPct: 50,
            cancellationPolicyJson: { type: 'tiered', tiers: [] },
          },
        });
        await db.user.create({ data: { id: USER, tenantId: TENANT_ID, phone: '+919000065065', userType: 'MEMBER', isPhoneVerified: true } });
        await db.subscription.create({
          data: { userId: USER, tenantId: TENANT_ID, mandateId: `f065-${Date.now()}`, amount: 100000, frequency: 'monthly', status: 'active' },
        });
        await db.memberGroupAssignment.create({
          data: { userId: USER, resourcePoolId: POOL, daysOfWeek: String(day === 0 ? 7 : day), startTime, status: 'ACTIVE' },
        });
      };

      const sweep = async () => {
        const res = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });
        if (!res.ok) throw new Error(`Sweep failed with ${res.status}`);
        return ((await res.json()) as any).data;
      };
      const memberBooking = async () => db.booking.findFirst({ where: { resourcePoolId: POOL } });
      // Counts the DEDUPE RECORD, not the notification row. This suite spawns slot-engine
      // ALONE, so the outbound notification fetch fails and is swallowed by design (that
      // dispatch is explicitly non-blocking) and no NotificationRequest is ever written —
      // asserting on that here would read 0 regardless of behaviour. The ScheduledJobDispatch
      // row is written by slot-engine itself and IS the mechanism under test. Evidence that a
      // real NotificationRequest results was captured separately against a live notification
      // service, which this suite deliberately does not run.
      const alertCount = async () => db.scheduledJobDispatch.count({ where: { jobName: 'low_occupancy_alert' } });

      // --- Inside the member's deadline: the alert fires, the member is NOT released. ---
      await seed(graceShort);
      const inside = await sweep();
      if (await memberBooking()) {
        throw new Error('A member still inside their own confirmation deadline must not be released.');
      }
      if (inside.releasedMembersCount !== 0) {
        throw new Error(`Expected releasedMembersCount 0 inside the deadline, got ${inside.releasedMembersCount}`);
      }
      if (inside.lowOccupancyAlertsDispatched !== 1) {
        throw new Error(`The alert must fire on its own guestAccessCutoffMinutes schedule, got ${inside.lowOccupancyAlertsDispatched}`);
      }

      // --- The alert must not repeat across runs. Pre-dedupe this produced one per sweep. ---
      for (let i = 0; i < 4; i++) await sweep();
      const afterRepeats = await alertCount();
      if (afterRepeats !== 1) {
        throw new Error(`Alert must dispatch once per pool+window across runs, got ${afterRepeats} after 5 sweeps`);
      }
      if (await memberBooking()) {
        throw new Error('Repeated sweeps must still not release a member inside their deadline.');
      }

      // --- Nor duplicate under genuine concurrency: sequential re-runs prove persistence,
      //     only simultaneity proves atomicity. ---
      await seed(graceShort);
      const concurrent = await Promise.all([sweep(), sweep(), sweep(), sweep()]);
      const dispatchedTotal = concurrent.reduce((n, r) => n + r.lowOccupancyAlertsDispatched, 0);
      const concurrentAlerts = await alertCount();
      if (concurrentAlerts !== 1 || dispatchedTotal !== 1) {
        throw new Error(`Concurrent sweeps must yield exactly one alert, got ${concurrentAlerts} rows / ${dispatchedTotal} dispatched`);
      }

      // --- Past the member's deadline: release fires, on the SAME value the UI shows. ---
      await seed(graceLong);
      const past = await sweep();
      const released = await memberBooking();
      if (released?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error(`Expected RELEASED_NO_SHOW past the displayed deadline, got ${released?.status ?? 'no booking'}`);
      }
      if (past.releasedMembersCount !== 1) {
        throw new Error(`Expected releasedMembersCount 1 past the deadline, got ${past.releasedMembersCount}`);
      }

      console.log('F065_EVIDENCE', {
        windowGapMinutes: gap,
        insideDeadline: { grace: graceShort, released: inside.releasedMembersCount, alerts: inside.lowOccupancyAlertsDispatched },
        alertsAfter5Sweeps: afterRepeats,
        alertsAfter4ConcurrentSweeps: concurrentAlerts,
        pastDeadline: { grace: graceLong, released: past.releasedMembersCount, status: released.status },
      });

      await cleanup();
    },
  },

  {
    // REWRITTEN for F-065. The previous version built its subject with a direct
    // db.booking.create — status CONFIRMED, isMemberBooking true, memberAttendanceConfirmedAt
    // null — and asserted the sweep released it. No application path can produce that state:
    // ensureTodayMemberBooking is the only writer of isMemberBooking: true, and it either sets
    // memberAttendanceConfirmedAt (member confirm) or writes RELEASED_NO_SHOW (the sweep). So
    // the test proved a behaviour of code that could never run against real data, and both of
    // its preservation assertions would have kept passing while proving nothing once that code
    // was removed.
    //
    // It now drives a REAL member through the real confirm endpoint and asserts preservation
    // against the state the application actually reaches. A second member with an identical
    // assignment who never confirms is swept in the SAME run, which is what keeps the
    // preservation assertions honest: if the sweep were inert, that member would survive too
    // and this test would fail.
    name: 'F-022: a member who really confirmed is preserved by a sweep that demonstrably releases one who did not',
    async run() {
      const POOL = 'f022-reg-pool';
      const CONFIRMED_USER = 'f022-confirmed-member';
      const SILENT_USER = 'f022-silent-member';
      const GUEST_USER = 'f022-guest';

      const cleanup = async () => {
        await db.booking.deleteMany({ where: { resourcePoolId: POOL } });
        await db.memberGroupAssignment.deleteMany({ where: { resourcePoolId: POOL } });
        await db.availabilityWindow.deleteMany({ where: { resourcePoolId: POOL } });
        await db.bookingRule.deleteMany({ where: { resourcePoolId: POOL } });
        await db.resource.deleteMany({ where: { resourcePoolId: POOL } });
        await db.resourcePool.deleteMany({ where: { id: POOL } });
        await db.subscription.deleteMany({ where: { userId: { in: [CONFIRMED_USER, SILENT_USER] } } });
        await db.user.deleteMany({ where: { id: { in: [CONFIRMED_USER, SILENT_USER, GUEST_USER] } } });
        await db.scheduledJobDispatch.deleteMany({ where: { jobName: 'low_occupancy_alert' } });
      };
      await cleanup();

      // Same F-073 constraint as above: keep the window inside today's UTC date.
      const now = new Date();
      const minutesLeftToday = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 60000);
      const gap = Math.min(10, minutesLeftToday - 1);
      if (gap < 3) {
        throw new Error(`Cannot construct this scenario within ${minutesLeftToday} minutes of UTC midnight (needs 3).`);
      }

      const windowStart = new Date(Date.now() + gap * 60 * 1000);
      windowStart.setUTCSeconds(0, 0);
      const startTime = `${String(windowStart.getUTCHours()).padStart(2, '0')}:${String(windowStart.getUTCMinutes()).padStart(2, '0')}`;
      const day = new Date().getUTCDay();
      const isoWeekday = String(day === 0 ? 7 : day);

      await db.resourcePool.create({
        data: { id: POOL, tenantId: TENANT_ID, branchId: BRANCH_ID, name: 'F022 Pool', allocationMode: 'POOLED', capacity: 6 },
      });
      await db.resource.create({ data: { id: `${POOL}-res`, resourcePoolId: POOL, name: 'Court F022' } });
      const window = await db.availabilityWindow.create({
        data: {
          resourcePoolId: POOL, resourceId: `${POOL}-res`,
          startTime: windowStart, endTime: new Date(windowStart.getTime() + 60 * 60 * 1000), capacity: 6,
        },
      });
      // grace of 1 minute leaves the confirmation window genuinely open right now.
      const rule = await db.bookingRule.create({
        data: {
          resourcePoolId: POOL, gracePeriodMinutes: 1, guestAccessCutoffMinutes: 120,
          lowOccupancyThresholdPct: 50, cancellationPolicyJson: { type: 'tiered', tiers: [] },
        },
      });

      for (const userId of [CONFIRMED_USER, SILENT_USER]) {
        await db.user.create({
          data: {
            id: userId, tenantId: TENANT_ID,
            phone: userId === CONFIRMED_USER ? '+919000022001' : '+919000022002',
            userType: 'MEMBER', isPhoneVerified: true,
          },
        });
        await db.subscription.create({
          data: { userId, tenantId: TENANT_ID, mandateId: `f022-${userId}`, amount: 100000, frequency: 'monthly', status: 'active' },
        });
        await db.memberGroupAssignment.create({
          data: { userId, resourcePoolId: POOL, daysOfWeek: isoWeekday, startTime, status: 'ACTIVE' },
        });
      }

      // A paid guest on the same window — must survive regardless.
      await db.user.create({ data: { id: GUEST_USER, tenantId: TENANT_ID, phone: '+919000022003', userType: 'GUEST', isPhoneVerified: true } });
      const guestBooking = await db.booking.create({
        data: {
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: POOL, windowId: window.id,
          userId: GUEST_USER, status: BookingStatus.CONFIRMED, isMemberBooking: false,
          heldUntil: new Date(), idempotencyKey: `f022-guest-${Date.now()}`,
        },
      });

      // --- The real confirm, through the real endpoint with a real member JWT.
      //     No Content-Type header: this endpoint takes no body, and declaring JSON with an
      //     empty body is rejected by Fastify before the handler is ever reached. ---
      const confirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${signJwt({ userId: CONFIRMED_USER, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] })}` },
      });
      if (confirmRes.status !== 200 && confirmRes.status !== 201) {
        throw new Error(`Member confirm must succeed before the cutoff, got ${confirmRes.status} ${await confirmRes.text()}`);
      }
      const confirmedBooking = await db.booking.findFirst({ where: { resourcePoolId: POOL, userId: CONFIRMED_USER } });
      if (confirmedBooking?.status !== BookingStatus.CONFIRMED || !confirmedBooking.memberAttendanceConfirmedAt) {
        throw new Error(`Expected a genuinely confirmed member booking, got ${JSON.stringify(confirmedBooking)}`);
      }

      // --- Move the release trigger into the past so the sweep is demonstrably ACTIVE. ---
      await db.bookingRule.update({ where: { id: rule.id }, data: { gracePeriodMinutes: gap + 5 } });

      const sweepRes = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });
      if (!sweepRes.ok) throw new Error(`Sweep failed with ${sweepRes.status}`);
      const sweepData = ((await sweepRes.json()) as any).data;

      const afterConfirmed = await db.booking.findUnique({ where: { id: confirmedBooking.id } });
      const afterSilent = await db.booking.findFirst({ where: { resourcePoolId: POOL, userId: SILENT_USER } });
      const afterGuest = await db.booking.findUnique({ where: { id: guestBooking.id } });

      // The sweep must actually have done something, or preservation proves nothing.
      if (afterSilent?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error(
          `The non-confirming member must be released, otherwise this test cannot distinguish ` +
          `preservation from an inert sweep. Got ${afterSilent?.status ?? 'no booking'}`,
        );
      }
      if (afterConfirmed?.status !== BookingStatus.CONFIRMED || !afterConfirmed.memberAttendanceConfirmedAt) {
        throw new Error(`F-022: a confirmed member must survive the sweep, got ${JSON.stringify(afterConfirmed)}`);
      }
      if (afterGuest?.status !== BookingStatus.CONFIRMED) {
        throw new Error(`A paid guest must survive the sweep, got ${afterGuest?.status}`);
      }

      console.log('F022_EVIDENCE', {
        sweep: sweepData,
        confirmedMember: { status: afterConfirmed.status, attendanceConfirmed: afterConfirmed.memberAttendanceConfirmedAt !== null },
        nonConfirmingMember: { status: afterSilent.status },
        paidGuest: { status: afterGuest.status },
      });

      await cleanup();
    },
  },
];
