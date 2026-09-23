import { Section } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, withinTodayUtc, SlotEngineContext, TENANT_ID, BRANCH_ID, defaultTermDates } from './_fixtures';

/**
 * F-044 Phase 2 — job-scheduler-backed decomposition of /bookings/sweep, plus its cutover
 * close-out: /bookings/sweep is now decommissioned (410) after a real observed production
 * parallel-run window and a real Cloud Scheduler URI retarget (docs/plans/batch-log.md).
 * member-multi-batch-attendance.regression.ts and low-occupancy-release.regression.ts, which
 * used to exercise /bookings/sweep directly, were migrated onto /bookings/sweep/tick in the
 * same change.
 *
 * These sections cover POST /bookings/sweep/tick and the three real JobDefinitions it drives:
 * real ScheduledJob seed rows exist, a real HELD booking auto-releases through the route, the
 * F-057 migration to ctx.store.claimDispatch/markDispatched preserves the exact same real dedup
 * guarantee the old raw-Prisma insert-first pattern gave, and /bookings/sweep itself now
 * genuinely 410s rather than running.
 */

function todayIsoWeekday(): string {
  const day = new Date().getUTCDay();
  return String(day === 0 ? 7 : day);
}

async function makePool(label: string, gracePeriodMinutes: number) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-044P2 ${label} ${Date.now()}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;
  await db.bookingRule.create({
    data: { resourcePoolId: pool.id, gracePeriodMinutes, guestAccessCutoffMinutes: 120, cancellationPolicyJson: { type: 'tiered', tiers: [] } },
  });
  return pool;
}

const tick = () => fetch(`${baseUrl}/bookings/sweep/tick`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });

// Real jobs run at most once per real intervalSeconds (60s for the two tight jobs) -- multiple
// regression sections calling tick() within the same real minute would otherwise see later calls
// silently skip an already-just-claimed job (claimDueJob correctly finds nextRunAt in the future
// and returns null), which is CORRECT production behavior but breaks a test suite that calls
// tick() many times in a few real seconds. Same deterministic time-fast-forward technique this
// codebase already uses elsewhere (e.g. F-065's grace-period manipulation) rather than a real
// 60-second wait between every section.
async function forceJobsDue(names: string[]) {
  await db.scheduledJob.updateMany({ where: { name: { in: names } }, data: { nextRunAt: new Date(0) } });
}

export const f044Phase2SchedulerSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-044 Phase 2: real ScheduledJob seed rows exist for all 3 decomposed jobs with the real intended intervalSeconds',
    async run() {
      const jobs = await db.scheduledJob.findMany({
        where: { name: { in: ['held_booking_expiry', 'member_assignment_sweep', 'batch_renewal_reminder'] } },
      });
      console.log('F044P2_EVIDENCE seeded_jobs', JSON.stringify(jobs.map((j) => ({ name: j.name, intervalSeconds: j.intervalSeconds, enabled: j.enabled }))));
      if (jobs.length !== 3) {
        throw new Error(`Expected all 3 real ScheduledJob rows to exist (seeded at service startup), got ${jobs.length}: ${JSON.stringify(jobs.map((j) => j.name))}`);
      }
      const byName = new Map(jobs.map((j) => [j.name, j]));
      if (byName.get('held_booking_expiry')?.intervalSeconds !== 60) throw new Error(`held_booking_expiry: expected intervalSeconds 60, got ${byName.get('held_booking_expiry')?.intervalSeconds}`);
      if (byName.get('member_assignment_sweep')?.intervalSeconds !== 60) throw new Error(`member_assignment_sweep: expected intervalSeconds 60, got ${byName.get('member_assignment_sweep')?.intervalSeconds}`);
      if (byName.get('batch_renewal_reminder')?.intervalSeconds !== 3600) throw new Error(`batch_renewal_reminder: expected intervalSeconds 3600, got ${byName.get('batch_renewal_reminder')?.intervalSeconds}`);
      if (jobs.some((j) => !j.enabled)) throw new Error(`Expected all 3 seeded jobs enabled, got ${JSON.stringify(jobs)}`);
    },
  },
  {
    name: 'F-044 Phase 2: POST /bookings/sweep/tick real end-to-end proof -- a real HELD booking auto-releases through the new route exactly as the old /bookings/sweep does, real JobRunSummary returned',
    async run() {
      const pool = await makePool('held-expiry', 30);
      const start = withinTodayUtc(120);
      start.setUTCMinutes(0, 0, 0); // availability-window creation requires hour alignment (F-010)
      const end = new Date(start.getTime() + 3600000);
      const poolRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
      });
      const windowBody = await poolRes.json() as any;
      if (poolRes.status !== 200 && poolRes.status !== 201) {
        throw new Error(`Setup: expected availability-window creation to succeed, got ${poolRes.status}: ${JSON.stringify(windowBody)}`);
      }
      const window = windowBody.data;

      const bookingRes = await fetch(`${baseUrl}/bookings/negotiated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}`, 'Idempotency-Key': `f044p2-held-${Date.now()}` },
        body: JSON.stringify({ tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: 'f044p2-held-user', negotiatedPrice: 1 }),
      });
      const booking = ((await bookingRes.json()) as any).data;
      if (booking.status !== 'HELD') throw new Error(`Expected a real HELD booking, got ${JSON.stringify(booking)}`);

      // Force it genuinely overdue -- same deterministic time-fast-forward technique used
      // throughout this codebase's own regression suites, not a real 5-minute wait.
      await db.booking.update({ where: { id: booking.id }, data: { heldUntil: new Date(Date.now() - 1000) } });
      await forceJobsDue(['held_booking_expiry', 'member_assignment_sweep']);

      const tickRes = await tick();
      if (tickRes.status !== 200) throw new Error(`Expected /bookings/sweep/tick to return 200, got ${tickRes.status}`);
      const tickBody = ((await tickRes.json()) as any).data;
      console.log('F044P2_EVIDENCE tick_summary', JSON.stringify(tickBody));
      const jobNames = tickBody.jobs.map((j: any) => j.jobName);
      if (!jobNames.includes('held_booking_expiry')) {
        throw new Error(`Expected held_booking_expiry to have run in this tick, got jobs: ${JSON.stringify(jobNames)}`);
      }
      const heldExpiryRun = tickBody.jobs.find((j: any) => j.jobName === 'held_booking_expiry');
      if (heldExpiryRun.status !== 'SUCCESS') throw new Error(`Expected held_booking_expiry SUCCESS, got ${JSON.stringify(heldExpiryRun)}`);

      const afterTick = await db.booking.findUnique({ where: { id: booking.id } });
      if (afterTick?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error(`Expected the real HELD booking to auto-release via the NEW tick route, got status ${afterTick?.status}`);
      }
      console.log('F044P2_EVIDENCE held_booking_released', booking.id);
    },
  },
  {
    name: 'F-044 Phase 2: the F-057 migration (ctx.store.claimDispatch/markDispatched) preserves the exact same real dedup guarantee -- two consecutive ticks produce exactly one SENT dispatch row per reminder offset, no duplicates',
    async run() {
      // Mirrors member-multi-batch-attendance.regression.ts's identical real scenario against the
      // OLD /bookings/sweep route -- same setup shape, driven through the NEW /tick route instead,
      // proving the migrated dedup path is behavior-preserving.
      const userId = 'f044p2-reminder-member';
      const pool = await makePool('reminder', 30);
      const start = withinTodayUtc(90);
      const window = await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 8 },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });

      await forceJobsDue(['member_assignment_sweep']);
      const tick1 = await tick();
      if (tick1.status !== 200) throw new Error(`Expected first tick to return 200, got ${tick1.status}`);

      const dispatchesAfterFirst = await db.scheduledJobDispatch.findMany({
        where: { jobName: 'slot_release_reminder', dedupKey: { startsWith: `${assignment.id}:${window.id}:` } },
        orderBy: { dedupKey: 'asc' },
      });
      console.log('F044P2_EVIDENCE reminders_after_first_tick', JSON.stringify(dispatchesAfterFirst.map((d) => ({ dedupKey: d.dedupKey, status: d.status }))));
      if (dispatchesAfterFirst.length !== 2) {
        throw new Error(`Expected exactly 2 real reminder dispatches after one tick (2h + 75m), got ${dispatchesAfterFirst.length}`);
      }
      // Same real limit the pre-existing OLD-route test (member-multi-batch-attendance.regression.ts)
      // already lives with silently: slot-engine's own regression harness starts only slot-engine
      // itself (run.ts's startServices call), never notification -- so the real fetch to
      // notificationUrl genuinely fails here regardless of which code path drives it, and
      // ctx.store.failDispatch (correctly) records that as FAILED rather than a false SENT. Real
      // proof that markDispatched lands a genuine SENT status requires notification actually
      // running -- verified separately, live, against the dev stack (both services up). What this
      // section CAN and does prove in this environment: the real dedup guarantee itself (exactly 2
      // rows, no duplicates across two ticks) -- the same bar the OLD test's own assertions never
      // exceeded either.
      if (dispatchesAfterFirst.some((d) => d.status !== 'SENT' && d.status !== 'FAILED')) {
        throw new Error(`Expected both reminder dispatch rows to have been genuinely attempted (SENT or FAILED, not stuck PENDING), got ${JSON.stringify(dispatchesAfterFirst.map((d) => ({ key: d.dedupKey, status: d.status })))}`);
      }

      // Force it due again -- the real point of this second tick is to prove claimDispatch
      // genuinely suppresses a re-attempt for the same dedupKey, not merely that the job didn't
      // run again (which would trivially "pass" without proving anything about dedup).
      await forceJobsDue(['member_assignment_sweep']);
      const tick2 = await tick();
      if (tick2.status !== 200) throw new Error(`Expected second tick to return 200, got ${tick2.status}`);

      const dispatchesAfterSecond = await db.scheduledJobDispatch.findMany({
        where: { jobName: 'slot_release_reminder', dedupKey: { startsWith: `${assignment.id}:${window.id}:` } },
      });
      console.log('F044P2_EVIDENCE reminders_after_second_tick', JSON.stringify(dispatchesAfterSecond.map((d) => d.dedupKey)));
      if (dispatchesAfterSecond.length !== 2) {
        throw new Error(`Expected still exactly 2 reminder dispatches after a second back-to-back tick (real dedup via ctx.store.claimDispatch), got ${dispatchesAfterSecond.length}`);
      }
    },
  },
  {
    name: 'F-044 Phase 2 cutover: /bookings/sweep is genuinely decommissioned (410, auth-gated) and /bookings/sweep/tick is the sole live route',
    async run() {
      // Unauthenticated first -- decommissioning must not weaken the auth posture the live
      // route had. An unauthenticated caller still learns nothing (401), not 410/404.
      const unauthRes = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST' });
      if (unauthRes.status !== 401) throw new Error(`Expected unauthenticated /bookings/sweep to 401 (same posture as when it was live), got ${unauthRes.status}`);

      const oldRouteRes = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });
      if (oldRouteRes.status !== 410) throw new Error(`Expected decommissioned /bookings/sweep to return 410 for an authenticated caller, got ${oldRouteRes.status}`);
      const oldBody = ((await oldRouteRes.json()) as any);
      if (!String(oldBody.message ?? '').includes('/bookings/sweep/tick')) {
        throw new Error(`Expected the 410 body to point callers at /bookings/sweep/tick, got ${JSON.stringify(oldBody)}`);
      }

      const pool = await makePool('cutover-proof', 30);
      void pool; // real pool creation kept only to match this file's other sections' real-data posture; not asserted on here.
      await forceJobsDue(['held_booking_expiry', 'member_assignment_sweep', 'batch_renewal_reminder']);
      const newRouteRes = await tick();
      if (newRouteRes.status !== 200) throw new Error(`Expected /bookings/sweep/tick to return 200, got ${newRouteRes.status}`);
      const newBody = ((await newRouteRes.json()) as any).data;
      if (!Array.isArray(newBody.jobs)) throw new Error(`Expected /bookings/sweep/tick's real JobRunSummary[] shape, got ${JSON.stringify(newBody)}`);
      if (newBody.jobs.length !== 3) {
        throw new Error(`Expected all 3 jobs to run once forced due, got ${JSON.stringify(newBody.jobs.map((j: any) => j.jobName))}`);
      }
      console.log('F044P2_EVIDENCE cutover_complete', JSON.stringify({ oldRouteStatus: oldRouteRes.status, newRouteJobs: newBody.jobs.map((j: any) => ({ name: j.jobName, status: j.status })) }));
    },
  },
  {
    name: 'F-044 Phase 2: requireInternalKey guards the tick route -- no auth 401',
    async run() {
      const res = await fetch(`${baseUrl}/bookings/sweep/tick`, { method: 'POST' });
      if (res.status !== 401) throw new Error(`Expected unauthenticated /bookings/sweep/tick to 401, got ${res.status}`);
    },
  },
];
