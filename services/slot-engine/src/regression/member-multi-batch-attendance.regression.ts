import { Section, signJwt } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, withinTodayUtc, SlotEngineContext, TENANT_ID, BRANCH_ID, defaultTermDates } from './_fixtures';

/**
 * F-133 Slice B — multi-batch member experience.
 *
 * §3: a member may hold more than one ACTIVE MemberGroupAssignment concurrently now that
 * Slice A dropped the one-active-per-member partial index. GET /member/today-assignment
 * returns an array, one entry per assignment; POST .../confirm and .../decline now take an
 * explicit assignmentId and act on exactly that one, ownership-checked server-side.
 *
 * §6: the real explicit decline action (POST /member/today-assignment/decline), the
 * RELEASED_NO_SHOW pre-cutoff bug fix (a decline followed by a change-of-mind confirm, both
 * before cutoff, must both succeed -- not 409 the way a sweep-released booking correctly does
 * post-cutoff), and the two slot_release_reminder dispatches with real dedup across repeated
 * sweep runs.
 */

function alignedHourWithinToday(minutesAhead: number): Date {
  const date = withinTodayUtc(minutesAhead);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

function todayIsoWeekday(): string {
  const day = new Date().getUTCDay();
  return String(day === 0 ? 7 : day);
}

async function makeMemberPool(label: string, gracePeriodMinutes: number) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-133B ${label} ${Date.now()}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;
  await db.bookingRule.create({
    data: {
      resourcePoolId: pool.id,
      gracePeriodMinutes,
      guestAccessCutoffMinutes: 120,
      cancellationPolicyJson: { type: 'tiered', tiers: [] },
    },
  });
  return pool;
}

export const memberMultiBatchAttendanceSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-133B §3: a member with two concurrent ACTIVE batches sees two independent today-assignment entries; confirming one never affects the other',
    async run() {
      const userId = 'f133b-multi-batch-member';
      const poolA = await makeMemberPool('multi-A', 30);
      const poolB = await makeMemberPool('multi-B', 30);

      const startA = alignedHourWithinToday(4 * 60);
      const startB = alignedHourWithinToday(5 * 60);
      const windowA = await db.availabilityWindow.create({
        data: { resourcePoolId: poolA.id, startTime: startA, endTime: new Date(startA.getTime() + 3600000), capacity: 8 },
      });
      const windowB = await db.availabilityWindow.create({
        data: { resourcePoolId: poolB.id, startTime: startB, endTime: new Date(startB.getTime() + 3600000), capacity: 8 },
      });

      await db.subscription.create({
        data: { userId, tenantId: TENANT_ID, mandateId: `f133b-multi-${Date.now()}`, amount: 100000, frequency: 'monthly', status: 'active' },
      });
      const assignmentA = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: poolA.id, daysOfWeek: todayIsoWeekday(), startTime: startA.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });
      const assignmentB = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: poolB.id, daysOfWeek: todayIsoWeekday(), startTime: startB.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });

      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${memberJwt}` };

      const todayRes = await fetch(`${baseUrl}/member/today-assignment`, { headers });
      const todayList = ((await todayRes.json()) as any).data;
      console.log('F133B_EVIDENCE two_batches_today', JSON.stringify({ status: todayRes.status, count: todayList?.length, ids: todayList?.map((s: any) => s.assignmentId) }));
      if (todayRes.status !== 200 || !Array.isArray(todayList) || todayList.length !== 2) {
        throw new Error(`Expected an array of 2 today-assignment entries, got ${todayRes.status} ${JSON.stringify(todayList)}`);
      }
      const entryA = todayList.find((s: any) => s.assignmentId === assignmentA.id);
      const entryB = todayList.find((s: any) => s.assignmentId === assignmentB.id);
      if (!entryA || !entryB || entryA.state !== 'HAS_SESSION' || entryB.state !== 'HAS_SESSION') {
        throw new Error(`Expected both assignments HAS_SESSION, got ${JSON.stringify(todayList)}`);
      }

      // Confirm ONLY assignment A.
      const confirmARes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assignmentId: assignmentA.id }),
      });
      if (confirmARes.status !== 201) {
        throw new Error(`Expected 201 confirming assignment A, got ${confirmARes.status}: ${JSON.stringify(await confirmARes.json())}`);
      }

      // Real DB read-back: A is CONFIRMED, B has no booking at all yet -- confirming A must
      // never touch B.
      const bookingA = await db.booking.findFirst({ where: { userId, windowId: windowA.id, status: { not: BookingStatus.CANCELLED } } });
      const bookingB = await db.booking.findFirst({ where: { userId, windowId: windowB.id, status: { not: BookingStatus.CANCELLED } } });
      console.log('F133B_EVIDENCE independence_after_confirm_a', JSON.stringify({
        bookingA: bookingA && { status: bookingA.status, confirmedAt: bookingA.memberAttendanceConfirmedAt },
        bookingB,
      }));
      if (!bookingA || bookingA.status !== BookingStatus.CONFIRMED || !bookingA.memberAttendanceConfirmedAt) {
        throw new Error('Assignment A booking did not confirm correctly.');
      }
      if (bookingB) {
        throw new Error('Confirming assignment A incorrectly created/affected a booking for assignment B.');
      }

      // Now decline B. A must remain untouched.
      const declineBRes = await fetch(`${baseUrl}/member/today-assignment/decline`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assignmentId: assignmentB.id }),
      });
      if (declineBRes.status !== 201) {
        throw new Error(`Expected 201 declining assignment B, got ${declineBRes.status}: ${JSON.stringify(await declineBRes.json())}`);
      }
      const bookingAAfter = await db.booking.findFirst({ where: { userId, windowId: windowA.id, status: { not: BookingStatus.CANCELLED } } });
      const bookingBAfter = await db.booking.findFirst({ where: { userId, windowId: windowB.id, status: { not: BookingStatus.CANCELLED } } });
      console.log('F133B_EVIDENCE independence_after_decline_b', JSON.stringify({
        bookingA: bookingAAfter && { status: bookingAAfter.status, confirmedAt: bookingAAfter.memberAttendanceConfirmedAt },
        bookingB: bookingBAfter && { status: bookingBAfter.status, declinedAt: bookingBAfter.memberAttendanceDeclinedAt },
      }));
      if (!bookingAAfter || bookingAAfter.status !== BookingStatus.CONFIRMED || !bookingAAfter.memberAttendanceConfirmedAt) {
        throw new Error('Declining assignment B incorrectly affected assignment A\'s confirmed booking.');
      }
      if (!bookingBAfter || bookingBAfter.status !== BookingStatus.RELEASED_NO_SHOW || !bookingBAfter.memberAttendanceDeclinedAt) {
        throw new Error('Assignment B booking did not decline correctly.');
      }

      // Ownership check: assignment B belongs to this user, but confirming it with SOMEONE
      // ELSE's JWT must 404, not succeed and not leak whether the id exists.
      const otherJwt = signJwt({ userId: 'f133b-other-member', tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const foreignRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherJwt}` },
        body: JSON.stringify({ assignmentId: assignmentB.id }),
      });
      console.log('F133B_EVIDENCE foreign_assignment_id_rejected', JSON.stringify({ status: foreignRes.status }));
      if (foreignRes.status !== 404) {
        throw new Error(`Expected 404 for a foreign assignmentId, got ${foreignRes.status}`);
      }
    },
  },

  {
    name: 'F-133B §6: RELEASED_NO_SHOW pre-cutoff bug fix -- decline then re-confirm before cutoff both succeed, neither wrongly 409s',
    async run() {
      const userId = 'f133b-bugfix-member';
      const pool = await makeMemberPool('bugfix', 120); // wide grace window so "now" stays pre-cutoff throughout
      const start = alignedHourWithinToday(4 * 60);
      const window = await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 8 },
      });
      await db.subscription.create({
        data: { userId, tenantId: TENANT_ID, mandateId: `f133b-bugfix-${Date.now()}`, amount: 100000, frequency: 'monthly', status: 'active' },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });
      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${memberJwt}` };
      const body = JSON.stringify({ assignmentId: assignment.id });

      // Decline first (creates a RELEASED_NO_SHOW booking with no prior confirm).
      const declineRes = await fetch(`${baseUrl}/member/today-assignment/decline`, { method: 'POST', headers, body });
      if (declineRes.status !== 201) {
        throw new Error(`Expected 201 on first decline, got ${declineRes.status}: ${JSON.stringify(await declineRes.json())}`);
      }
      const afterDecline = await db.booking.findFirst({ where: { userId, windowId: window.id, status: { not: BookingStatus.CANCELLED } } });
      console.log('F133B_EVIDENCE bugfix_after_decline', JSON.stringify({ status: afterDecline?.status, declinedAt: afterDecline?.memberAttendanceDeclinedAt }));
      if (afterDecline?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error('Decline did not produce a RELEASED_NO_SHOW booking.');
      }

      // THE REAL BUG FIX: confirm now, while still pre-cutoff, on a booking that IS
      // RELEASED_NO_SHOW. Pre-fix this unconditionally 409'd; it must now succeed.
      const reconfirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, { method: 'POST', headers, body });
      const reconfirmBody = (await reconfirmRes.json()) as any;
      console.log('F133B_EVIDENCE bugfix_reconfirm_after_decline', JSON.stringify({ status: reconfirmRes.status, body: reconfirmBody.data ?? reconfirmBody.error }));
      if (reconfirmRes.status !== 200) {
        throw new Error(`Expected 200 re-confirming a pre-cutoff decline, got ${reconfirmRes.status}: ${JSON.stringify(reconfirmBody)}`);
      }
      const afterReconfirm = await db.booking.findFirst({ where: { userId, windowId: window.id, status: { not: BookingStatus.CANCELLED } } });
      if (afterReconfirm?.status !== BookingStatus.CONFIRMED || !afterReconfirm.memberAttendanceConfirmedAt || afterReconfirm.memberAttendanceDeclinedAt) {
        throw new Error(`Re-confirm did not correctly flip the booking back to CONFIRMED and clear the decline stamp: ${JSON.stringify(afterReconfirm)}`);
      }

      // And the mirror: decline again after confirming -- must also succeed, clearing confirm.
      const redeclineRes = await fetch(`${baseUrl}/member/today-assignment/decline`, { method: 'POST', headers, body });
      if (redeclineRes.status !== 200) {
        throw new Error(`Expected 200 re-declining a confirmed pre-cutoff booking, got ${redeclineRes.status}`);
      }
      const afterRedecline = await db.booking.findFirst({ where: { userId, windowId: window.id, status: { not: BookingStatus.CANCELLED } } });
      console.log('F133B_EVIDENCE bugfix_redecline_after_confirm', JSON.stringify({ status: afterRedecline?.status, confirmedAt: afterRedecline?.memberAttendanceConfirmedAt, declinedAt: afterRedecline?.memberAttendanceDeclinedAt }));
      if (afterRedecline?.status !== BookingStatus.RELEASED_NO_SHOW || afterRedecline.memberAttendanceConfirmedAt) {
        throw new Error('Re-decline did not correctly flip back to RELEASED_NO_SHOW and clear the confirm stamp.');
      }
    },
  },

  {
    name: 'F-133B §6: decline is cutoff-gated exactly like confirm, and is not subscription-gated',
    async run() {
      // Cutoff case: gracePeriodMinutes=120 against a window an hour out means "now" is already
      // past cutoff -- decline must 409 the same way confirm already does.
      const userId = 'f133b-decline-cutoff-member';
      const pool = await makeMemberPool('decline-cutoff', 120);
      const start = alignedHourWithinToday(60);
      await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 8 },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });
      // Deliberately NO subscription row -- proves decline does not require one.
      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const declineRes = await fetch(`${baseUrl}/member/today-assignment/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberJwt}` },
        body: JSON.stringify({ assignmentId: assignment.id }),
      });
      console.log('F133B_EVIDENCE decline_cutoff_no_subscription', JSON.stringify({ status: declineRes.status }));
      if (declineRes.status !== 409) {
        throw new Error(`Expected decline to 409 past cutoff, got ${declineRes.status}`);
      }
    },
  },

  {
    name: 'F-133B §6: both slot_release_reminder offsets dispatch exactly once each across two consecutive sweep runs',
    async run() {
      const userId = 'f133b-reminder-member';
      // gracePeriodMinutes=30 against a window 90 minutes out puts cutoff (start - 30min) 60
      // minutes in the FUTURE -- both reminder windows (cutoff-120min and cutoff-75min) have
      // already opened (they're -60min and -15min from now respectively), but release
      // (now >= releaseTime, and releaseTime === cutoffTime by the same formula) has NOT --
      // deliberately keeping existingBooking null across both sweeps below, so this proves the
      // reminder step's OWN insert-first dedup, not an accidental skip from a release-created
      // booking. withinTodayUtc (not hour-aligned) is used deliberately -- this needs the exact
      // minute offset, not the nearest hour boundary.
      const pool = await makeMemberPool('reminder', 30);
      const start = withinTodayUtc(90);
      const window = await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 8 },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: { userId, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE', ...defaultTermDates() },
      });

      const sweep1 = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });
      if (sweep1.status !== 200) throw new Error(`Expected sweep 200, got ${sweep1.status}`);

      const dispatchesAfterFirst = await db.scheduledJobDispatch.findMany({
        where: { jobName: 'slot_release_reminder', dedupKey: { startsWith: `${assignment.id}:${window.id}:` } },
        orderBy: { dedupKey: 'asc' },
      });
      console.log('F133B_EVIDENCE reminders_after_first_sweep', JSON.stringify(dispatchesAfterFirst.map((d) => d.dedupKey)));
      if (dispatchesAfterFirst.length !== 2) {
        throw new Error(`Expected exactly 2 reminder dispatches after one sweep (2h + 75m), got ${dispatchesAfterFirst.length}: ${JSON.stringify(dispatchesAfterFirst.map((d) => d.dedupKey))}`);
      }
      const has2h = dispatchesAfterFirst.some((d) => d.dedupKey.endsWith(':2h'));
      const has75m = dispatchesAfterFirst.some((d) => d.dedupKey.endsWith(':75m'));
      if (!has2h || !has75m) {
        throw new Error(`Expected both :2h and :75m dedup keys, got ${JSON.stringify(dispatchesAfterFirst.map((d) => d.dedupKey))}`);
      }

      // Run the sweep again immediately -- real dedup proof: no duplicate dispatch rows.
      const sweep2 = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });
      if (sweep2.status !== 200) throw new Error(`Expected second sweep 200, got ${sweep2.status}`);

      const dispatchesAfterSecond = await db.scheduledJobDispatch.findMany({
        where: { jobName: 'slot_release_reminder', dedupKey: { startsWith: `${assignment.id}:${window.id}:` } },
      });
      console.log('F133B_EVIDENCE reminders_after_second_sweep', JSON.stringify(dispatchesAfterSecond.map((d) => d.dedupKey)));
      if (dispatchesAfterSecond.length !== 2) {
        throw new Error(`Expected still exactly 2 reminder dispatches after a second back-to-back sweep (real dedup), got ${dispatchesAfterSecond.length}`);
      }
    },
  },
];
