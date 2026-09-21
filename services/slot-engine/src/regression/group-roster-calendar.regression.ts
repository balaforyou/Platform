import { Section, signJwt, expectForbidden, inspect } from '@badminton/test-harness';
import { BookingStatus, Prisma, AllocationMode, PricingMode } from '@badminton/database';
import { daysInMonth } from '../branchTime.js';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID, defaultTermDates } from './_fixtures';

/**
 * F-133 Slice C — roster (GET /groups/:id/roster) and the member-facing calendar
 * (GET /member/calendar), plus the real missing membership link (POST /member-group-assignments
 * now accepting groupId) neither Slice A nor B ever built -- without it no assignment could ever
 * join a batch, so roster/calendar would have no real data to show.
 *
 * Attendance derivation, decided this round (chief-decision-f133-attendance-metric.md):
 * memberAttendanceConfirmedAt/DeclinedAt, never CHECKED_IN. Four states, purely derived from
 * Booking's existing fields, no new schema:
 *   CONFIRMED + confirmedAt set              -> ATTENDED
 *   RELEASED_NO_SHOW + declinedAt set        -> DECLINED (explicit, pre-cutoff)
 *   RELEASED_NO_SHOW, declinedAt null        -> NO_RESPONSE (sweep-released, no action taken)
 *   no booking for that date                 -> NO_DATA
 */

async function makePool(label: string, tenantId: string = TENANT_ID, branchId: string = BRANCH_ID) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: `F-133C ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  return ((await poolRes.json()) as any).data;
}

async function makeGroupViaApi(pool: any, overrides: Partial<{ daysOfWeek: string; startTime: string }> = {}) {
  // F-169 precedent (same as member-collision-sweep.regression.ts's own makePool): POST /groups
  // reuses validateAssignmentSchedule, which requires a real ACTIVE AvailabilityPattern covering
  // the declared day/time -- broad enough (every day, 00:00-23:00, 60-min slots) to cover
  // whatever daysOfWeek/startTime a given section's group declares.
  await db.availabilityPattern.create({
    data: { resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '00:00', endTime: '23:00', slotDurationMinutes: 60, capacity: 8, status: 'ACTIVE', ...defaultTermDates() },
  });
  const res = await fetch(`${baseUrl}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      name: `F-133C Batch ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      resourcePoolId: pool.id,
      daysOfWeek: overrides.daysOfWeek ?? '1,2,3,4,5,6,7',
      startTime: overrides.startTime ?? '10:00',
      isPeak: false,
      customRate: 500,
    }),
  });
  if (res.status !== 201) throw new Error(`F-133C group create: expected 201, got ${res.status}: ${JSON.stringify(await res.json())}`);
  return ((await res.json()) as any).data;
}

function todayIsoWeekday(): string {
  const day = new Date().getUTCDay();
  return String(day === 0 ? 7 : day);
}

/** The real previous full UTC calendar month -- every date in it is unambiguously in the past
 *  regardless of what time the suite runs, so the calendar section needs no time-of-day margin. */
function previousUtcMonth(now: Date): { year: number; month: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const total = y * 12 + (m - 1) - 1;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export const groupRosterCalendarSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-133C: POST /member-group-assignments with groupId derives resourcePoolId/daysOfWeek/startTime from the group, ignoring conflicting body values',
    async run() {
      const pool = await makePool('membership-link');
      const group = await makeGroupViaApi(pool, { daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00' });

      const otherPool = await makePool('decoy-pool');
      const res = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        // Deliberately conflicting values -- the group's own schedule must win.
        body: JSON.stringify({ userId: 'f133c-member-link', groupId: group.id, resourcePoolId: otherPool.id, daysOfWeek: '3', startTime: '15:00' }),
      });
      if (res.status !== 201) throw new Error(`F-133C membership link: expected 201, got ${res.status}: ${JSON.stringify(await res.json())}`);
      const assignment = ((await res.json()) as any).data;
      console.log('F133C_EVIDENCE membership_link', JSON.stringify({ groupId: assignment.groupId, resourcePoolId: assignment.resourcePoolId, daysOfWeek: assignment.daysOfWeek, startTime: assignment.startTime }));
      if (assignment.groupId !== group.id || assignment.resourcePoolId !== pool.id || assignment.daysOfWeek !== '1,2,3,4,5,6,7' || assignment.startTime !== '10:00') {
        throw new Error(`F-133C membership link: expected the group's own schedule to win, got ${JSON.stringify(assignment)}`);
      }

      const unknownRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f133c-member-unknown-group', groupId: 'not-a-real-group-id' }),
      });
      if (unknownRes.status !== 404) throw new Error(`F-133C membership link: expected 404 for an unknown groupId, got ${unknownRes.status}`);
    },
  },

  {
    name: 'F-133C: GET /groups/:id/roster -- a real mix of ATTENDED/DECLINED/NO_RESPONSE/NO_DATA, live DB reads',
    async run() {
      const pool = await makePool('roster-mix');
      const group = await makeGroupViaApi(pool, { daysOfWeek: todayIsoWeekday(), startTime: '09:00' });

      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
      const window = await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: windowStart, endTime: new Date(windowStart.getTime() + 3600000), capacity: 8 },
      });

      const attended = 'f133c-roster-attended';
      const declined = 'f133c-roster-declined';
      const noResponse = 'f133c-roster-noresponse';
      const noData = 'f133c-roster-nodata';
      for (const userId of [attended, declined, noResponse, noData]) {
        await db.memberGroupAssignment.create({
          data: { userId, groupId: group.id, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: '09:00', status: 'ACTIVE', ...defaultTermDates() },
        });
      }
      await db.booking.create({
        data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: attended, status: BookingStatus.CONFIRMED, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-att-${Date.now()}`, memberAttendanceConfirmedAt: new Date() },
      });
      await db.booking.create({
        data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: declined, status: BookingStatus.RELEASED_NO_SHOW, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-dec-${Date.now()}`, memberAttendanceDeclinedAt: new Date() },
      });
      await db.booking.create({
        data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: noResponse, status: BookingStatus.RELEASED_NO_SHOW, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-nr-${Date.now()}` },
      });
      // noData: deliberately no booking row at all.

      const res = await fetch(`${baseUrl}/groups/${group.id}/roster`, { headers: { Authorization: `Bearer ${internalKey}` } });
      if (res.status !== 200) throw new Error(`F-133C roster: expected 200, got ${res.status}`);
      const rows = ((await res.json()) as any).data as any[];
      console.log('F133C_EVIDENCE roster_mix', JSON.stringify(rows.map((r) => ({ userId: r.userId, state: r.state }))));
      const stateByUser = new Map(rows.map((r) => [r.userId, r.state]));
      if (stateByUser.get(attended) !== 'ATTENDED') throw new Error(`Expected ATTENDED, got ${stateByUser.get(attended)}`);
      if (stateByUser.get(declined) !== 'DECLINED') throw new Error(`Expected DECLINED, got ${stateByUser.get(declined)}`);
      if (stateByUser.get(noResponse) !== 'NO_RESPONSE') throw new Error(`Expected NO_RESPONSE, got ${stateByUser.get(noResponse)}`);
      if (stateByUser.get(noData) !== 'NO_DATA') throw new Error(`Expected NO_DATA, got ${stateByUser.get(noData)}`);
      if (rows.length !== 4) throw new Error(`Expected exactly 4 roster rows, got ${rows.length}`);
    },
  },

  {
    name: 'F-133C: GET /groups/:id/roster -- a batch with zero ACTIVE members returns [], the real empty state',
    async run() {
      const pool = await makePool('roster-empty');
      const group = await makeGroupViaApi(pool);
      const res = await fetch(`${baseUrl}/groups/${group.id}/roster`, { headers: { Authorization: `Bearer ${internalKey}` } });
      if (res.status !== 200) throw new Error(`F-133C empty roster: expected 200, got ${res.status}`);
      const rows = ((await res.json()) as any).data;
      console.log('F133C_EVIDENCE roster_empty', JSON.stringify(rows));
      if (!Array.isArray(rows) || rows.length !== 0) throw new Error(`Expected [], got ${JSON.stringify(rows)}`);
    },
  },

  {
    name: 'F-133C: GET /groups/:id/roster -- unknown group 404s, and a branch_manager scoped to a different branch is rejected 403',
    async run() {
      const notFoundRes = await fetch(`${baseUrl}/groups/not-a-real-group/roster`, { headers: { Authorization: `Bearer ${internalKey}` } });
      if (notFoundRes.status !== 404) throw new Error(`Expected 404 for an unknown group, got ${notFoundRes.status}`);

      // Real requirePoolScope trust-boundary check, same pattern as admin-operations.regression.ts's
      // own wrong-branch test: a pool in a genuinely different branch, a branch_manager JWT scoped
      // only to BRANCH_ID.
      const otherBranchId = 'f133c-other-branch';
      await db.branch.upsert({
        where: { id: otherBranchId },
        update: {},
        create: { id: otherBranchId, tenantId: TENANT_ID, name: 'F-133C other branch', status: 'ACTIVE', timezone: 'UTC' },
      });
      const otherPool = await db.resourcePool.create({
        data: {
          tenantId: TENANT_ID, branchId: otherBranchId, name: 'F-133C wrong-branch pool',
          allocationMode: AllocationMode.POOLED, capacity: 8, minOccupancy: 1, minBookingDurationMinutes: 60,
          pricingMode: PricingMode.FLAT, defaultRate: new Prisma.Decimal(100), basePrice: new Prisma.Decimal(100),
        },
      });
      const otherGroup = await db.group.create({
        data: { tenantId: TENANT_ID, name: 'F-133C wrong-branch batch', resourcePoolId: otherPool.id, daysOfWeek: '1', startTime: '09:00', startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000) },
      });
      const branchManagerJwt = signJwt({ userId: 'f133c-wrong-branch-manager', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });
      const forbidden = await inspect(
        await fetch(`${baseUrl}/groups/${otherGroup.id}/roster`, { headers: { Authorization: `Bearer ${branchManagerJwt}` } }),
      );
      console.log('F133C_EVIDENCE roster_wrong_branch', JSON.stringify({ status: forbidden.status }));
      await expectForbidden(forbidden, 'branch_manager reading another branch\'s roster');
    },
  },

  {
    name: 'F-133C: GET /member/calendar -- a real past month with all four states renders correctly',
    async run() {
      const pool = await makePool('calendar-mix');
      const { year, month } = previousUtcMonth(new Date());
      const totalDays = daysInMonth(year, month);
      const userId = 'f133c-calendar-member';
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId, resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.UTC(year, month - 1, 1)),
          endDate: new Date(Date.UTC(year, month - 1, totalDays, 23, 59, 59, 999)),
        },
      });

      const dateAt = (day: number) => new Date(Date.UTC(year, month - 1, day, 10, 0, 0));
      const attendedDay = 5;
      const declinedDay = 10;
      const noResponseDay = 15;
      const noDataDay = 20; // deliberately no window created at all

      for (const day of [attendedDay, declinedDay, noResponseDay]) {
        const start = dateAt(day);
        const window = await db.availabilityWindow.create({
          data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 8 },
        });
        if (day === attendedDay) {
          await db.booking.create({ data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId, status: BookingStatus.CONFIRMED, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-cal-att-${Date.now()}`, memberAttendanceConfirmedAt: start } });
        } else if (day === declinedDay) {
          await db.booking.create({ data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId, status: BookingStatus.RELEASED_NO_SHOW, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-cal-dec-${Date.now()}`, memberAttendanceDeclinedAt: start } });
        } else {
          await db.booking.create({ data: { tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId, status: BookingStatus.RELEASED_NO_SHOW, isMemberBooking: true, heldUntil: new Date(), idempotencyKey: `f133c-cal-nr-${Date.now()}` } });
        }
      }

      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const res = await fetch(`${baseUrl}/member/calendar?assignmentId=${assignment.id}&month=${monthStr}`, { headers: { Authorization: `Bearer ${memberJwt}` } });
      if (res.status !== 200) throw new Error(`F-133C calendar: expected 200, got ${res.status}: ${JSON.stringify(await res.json())}`);
      const body = ((await res.json()) as any).data;
      console.log('F133C_EVIDENCE calendar_mix', JSON.stringify({ monthStr, hasEnoughHistory: body.hasEnoughHistory, totalDays: body.days.length }));
      if (body.days.length !== totalDays) throw new Error(`Expected ${totalDays} days, got ${body.days.length}`);
      if (body.hasEnoughHistory !== true) throw new Error(`Expected hasEnoughHistory true for a real past month, got ${body.hasEnoughHistory}`);

      const byDay = new Map(body.days.map((d: any) => [Number(d.date.slice(8, 10)), d.state]));
      if (byDay.get(attendedDay) !== 'ATTENDED') throw new Error(`day ${attendedDay}: expected ATTENDED, got ${byDay.get(attendedDay)}`);
      if (byDay.get(declinedDay) !== 'DECLINED') throw new Error(`day ${declinedDay}: expected DECLINED, got ${byDay.get(declinedDay)}`);
      if (byDay.get(noResponseDay) !== 'NO_RESPONSE') throw new Error(`day ${noResponseDay}: expected NO_RESPONSE, got ${byDay.get(noResponseDay)}`);
      if (byDay.get(noDataDay) !== 'NO_DATA') throw new Error(`day ${noDataDay}: expected NO_DATA, got ${byDay.get(noDataDay)}`);
    },
  },

  {
    name: 'F-133C: GET /member/calendar -- a genuinely brand-new member gets hasEnoughHistory: false, no seeded data',
    async run() {
      const pool = await makePool('calendar-new-member');
      const userId = 'f133c-calendar-brand-new';
      // startDate = right now, endDate far in the future -- no session has had a chance to occur.
      const now = new Date();
      const assignment = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE', startDate: now, endDate: new Date(now.getTime() + 30 * 86400000) },
      });
      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const res = await fetch(`${baseUrl}/member/calendar?assignmentId=${assignment.id}&month=${monthStr}`, { headers: { Authorization: `Bearer ${memberJwt}` } });
      if (res.status !== 200) throw new Error(`F-133C new-member calendar: expected 200, got ${res.status}`);
      const body = ((await res.json()) as any).data;
      console.log('F133C_EVIDENCE calendar_brand_new', JSON.stringify({ hasEnoughHistory: body.hasEnoughHistory }));
      if (body.hasEnoughHistory !== false) throw new Error(`Expected hasEnoughHistory false for a brand-new member, got ${body.hasEnoughHistory}`);
      if (!(body.days as any[]).every((d: any) => d.state === 'NO_DATA')) throw new Error('Expected every day NO_DATA for a brand-new member with zero real history');
    },
  },

  {
    name: 'F-133C: GET /member/calendar -- ownership check rejects a foreign assignmentId (404, no leak)',
    async run() {
      const pool = await makePool('calendar-ownership');
      const realOwnerAssignment = await db.memberGroupAssignment.create({
        data: { userId: 'f133c-cal-real-owner', resourcePoolId: pool.id, daysOfWeek: '1', startTime: '10:00', status: 'ACTIVE', ...defaultTermDates() },
      });
      const otherJwt = signJwt({ userId: 'f133c-cal-other-user', tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const res = await fetch(`${baseUrl}/member/calendar?assignmentId=${realOwnerAssignment.id}`, { headers: { Authorization: `Bearer ${otherJwt}` } });
      console.log('F133C_EVIDENCE calendar_foreign_assignment', JSON.stringify({ status: res.status }));
      if (res.status !== 404) throw new Error(`Expected 404 for a foreign assignmentId, got ${res.status}`);
    },
  },
];
