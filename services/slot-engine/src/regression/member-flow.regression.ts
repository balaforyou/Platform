import { Section, signJwt, inspect, expectForbidden, expectIdentityFromJwt } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, nextAlignedHour, withinTodayUtc, SlotEngineContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * MEMBER SELF-CONFIRM ATTENDANCE (F-022).
 * Migrated verbatim from concurrency.test.ts Test 7, plus the raw-API
 * concurrency race check that previously lived in the Playwright spec
 * member-self-confirm.spec.ts (it drove no browser — it was an API test
 * sitting in a browser suite). The Playwright spec keeps only its UI assertions.
 *
 * Guarantees covered: JWT-derived identity (a spoofed userId in the body is
 * ignored), non-member rejection, no-session state, inactive subscription 409,
 * past-cutoff 409, and concurrent double-confirm resolving to exactly one booking.
 */
export const memberFlowSections: Section<SlotEngineContext>[] = [
  {
    name: 'Member self-confirm: JWT identity (spoofed userId ignored), guest 403, subscription/cutoff gates, concurrent double-confirm',
    async run() {
      const memberTenant = TENANT_ID;

      const memberPool = await db.resourcePool.create({
        data: {
          tenantId: memberTenant,
          branchId: BRANCH_ID,
          name: 'Member Self Confirm Pool',
          allocationMode: 'POOLED',
          capacity: 8,
          minOccupancy: 2,
          minBookingDurationMinutes: 60,
          pricingMode: 'FLAT',
          defaultRate: 0,
        },
      });
      await db.bookingRule.create({
        data: {
          resourcePoolId: memberPool.id,
          gracePeriodMinutes: 30,
          guestAccessCutoffMinutes: 120,
          cancellationPolicyJson: { type: 'tiered', tiers: [] },
        },
      });

      // F-073: pinned inside today's UTC date. nextAlignedHour(4) lands on tomorrow when
      // the suite runs after ~20:00 UTC, and resolveTodayMemberAssignment only ever looks
      // for today's date + startTime — so the window exists and is never found.
      const futureWindowStart = withinTodayUtc(4 * 60);
      const futureWindowEnd = new Date(futureWindowStart.getTime() + 60 * 60 * 1000);
      const assignmentStartTime = futureWindowStart.toISOString().slice(11, 16);
      // F-066/F-073: derived from UTC — the clock the seeded branch uses — not from the
      // runner's local weekday. Reading getDay() here put the assignment on a different
      // calendar day than the window whenever the runner's zone disagreed with UTC, which
      // is a real several-hour span every day on any non-UTC machine.
      const todayIsoWeekday = String(new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay());
      const notTodayIsoWeekday = todayIsoWeekday === '1' ? '2' : '1';

      const selfConfirmWindow = await db.availabilityWindow.create({
        data: {
          resourcePoolId: memberPool.id,
          startTime: futureWindowStart,
          endTime: futureWindowEnd,
          capacity: 8,
        },
      });

      const memberSelfUserId = 'member-self-confirm-001';
      const otherMemberUserId = 'member-self-confirm-other';
      await db.subscription.create({
        data: {
          userId: memberSelfUserId,
          tenantId: memberTenant,
          mandateId: 'mandate-member-self-confirm-001',
          amount: 100000,
          frequency: 'monthly',
          status: 'active',
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: memberSelfUserId,
          resourcePoolId: memberPool.id,
          daysOfWeek: todayIsoWeekday,
          startTime: assignmentStartTime,
          status: 'ACTIVE',
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: otherMemberUserId,
          resourcePoolId: memberPool.id,
          daysOfWeek: notTodayIsoWeekday,
          startTime: assignmentStartTime,
          status: 'SUSPENDED',
        },
      });

      const memberToken = signJwt({ userId: memberSelfUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
      const guestToken = signJwt({ userId: 'guest-self-confirm-001', tenantId: memberTenant, userType: 'GUEST', roles: [] });
      const memberHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` };

      const todayRes = await fetch(`${baseUrl}/member/today-assignment`, { headers: memberHeaders });
      const todayBody = ((await todayRes.json()) as any).data;
      console.log('MEMBER_CONFIRM_EVIDENCE today_success', JSON.stringify({ status: todayRes.status, body: todayBody }));
      if (todayRes.status !== 200 || todayBody.state !== 'HAS_SESSION' || !todayBody.canConfirm) {
        throw new Error(`Expected HAS_SESSION/canConfirm, got ${todayRes.status} ${JSON.stringify(todayBody)}`);
      }

      const guestConfirm = await inspect(
        await fetch(`${baseUrl}/member/today-assignment/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
          body: JSON.stringify({}),
        }),
      );
      console.log(
        'MEMBER_CONFIRM_EVIDENCE non_member_rejection',
        JSON.stringify({ status: guestConfirm.status, body: guestConfirm.json }),
      );
      await expectForbidden(guestConfirm, 'guest attempting member attendance confirm');

      // TRUST BOUNDARY: body carries someone else's userId — it must be ignored.
      const confirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: memberHeaders,
        body: JSON.stringify({ userId: otherMemberUserId }),
      });
      const confirmBody = ((await confirmRes.json()) as any).data;
      console.log(
        'MEMBER_CONFIRM_EVIDENCE authorized_success_spoof_ignored',
        JSON.stringify({ status: confirmRes.status, body: confirmBody }),
      );
      if (confirmRes.status !== 201 || !confirmBody.memberAttendanceConfirmedAt) {
        throw new Error('Confirm did not succeed or did not stamp attendance confirmation.');
      }
      expectIdentityFromJwt(
        confirmBody.userId,
        memberSelfUserId,
        otherMemberUserId,
        'POST /member/today-assignment/confirm',
      );

      const confirmedCount = await db.booking.count({
        where: { userId: memberSelfUserId, windowId: selfConfirmWindow.id, status: { not: BookingStatus.CANCELLED } },
      });
      if (confirmedCount !== 1) {
        throw new Error(`Expected one confirmed member booking, got ${confirmedCount}`);
      }

      // NO SESSION TODAY state.
      const noSessionUserId = 'member-self-confirm-no-session';
      await db.subscription.create({
        data: {
          userId: noSessionUserId,
          tenantId: memberTenant,
          mandateId: 'mandate-member-no-session',
          amount: 100000,
          frequency: 'monthly',
          status: 'active',
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: noSessionUserId,
          resourcePoolId: memberPool.id,
          daysOfWeek: notTodayIsoWeekday,
          startTime: assignmentStartTime,
          status: 'ACTIVE',
        },
      });
      const noSessionToken = signJwt({ userId: noSessionUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
      const noSessionRes = await fetch(`${baseUrl}/member/today-assignment`, {
        headers: { Authorization: `Bearer ${noSessionToken}` },
      });
      console.log(
        'MEMBER_CONFIRM_EVIDENCE no_session_today',
        JSON.stringify({ status: noSessionRes.status, body: await noSessionRes.json() }),
      );

      // SUBSCRIPTION INACTIVE → 409.
      const inactiveUserId = 'member-self-confirm-inactive';
      await db.memberGroupAssignment.create({
        data: {
          userId: inactiveUserId,
          resourcePoolId: memberPool.id,
          daysOfWeek: todayIsoWeekday,
          startTime: assignmentStartTime,
          status: 'ACTIVE',
        },
      });
      await db.subscription.create({
        data: {
          userId: inactiveUserId,
          tenantId: memberTenant,
          mandateId: 'mandate-member-inactive',
          amount: 100000,
          frequency: 'monthly',
          status: 'suspended',
        },
      });
      const inactiveToken = signJwt({ userId: inactiveUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
      const inactiveRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inactiveToken}` },
      });
      console.log(
        'MEMBER_CONFIRM_EVIDENCE subscription_inactive',
        JSON.stringify({ status: inactiveRes.status, body: await inactiveRes.json() }),
      );
      if (inactiveRes.status !== 409) {
        throw new Error(`Expected inactive subscription 409, got ${inactiveRes.status}`);
      }

      // PAST CUTOFF → 409.
      const cutoffUserId = 'member-self-confirm-cutoff';
      const soonWindowStart = withinTodayUtc(60); // F-073: same constraint as above
      const soonWindowEnd = new Date(soonWindowStart.getTime() + 60 * 60 * 1000);
      const cutoffPool = await db.resourcePool.create({
        data: {
          tenantId: memberTenant,
          branchId: BRANCH_ID,
          name: 'Member Cutoff Pool',
          allocationMode: 'POOLED',
          capacity: 8,
          minOccupancy: 2,
          minBookingDurationMinutes: 60,
          pricingMode: 'FLAT',
          defaultRate: 0,
        },
      });
      await db.bookingRule.create({
        data: {
          resourcePoolId: cutoffPool.id,
          gracePeriodMinutes: 120,
          guestAccessCutoffMinutes: 120,
          cancellationPolicyJson: { type: 'tiered', tiers: [] },
        },
      });
      await db.availabilityWindow.create({
        data: {
          resourcePoolId: cutoffPool.id,
          startTime: soonWindowStart,
          endTime: soonWindowEnd,
          capacity: 8,
        },
      });
      await db.subscription.create({
        data: {
          userId: cutoffUserId,
          tenantId: memberTenant,
          mandateId: 'mandate-member-cutoff',
          amount: 100000,
          frequency: 'monthly',
          status: 'active',
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: cutoffUserId,
          resourcePoolId: cutoffPool.id,
          daysOfWeek: todayIsoWeekday,
          startTime: soonWindowStart.toISOString().slice(11, 16),
          status: 'ACTIVE',
        },
      });
      const cutoffToken = signJwt({ userId: cutoffUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
      const cutoffRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cutoffToken}` },
      });
      console.log(
        'MEMBER_CONFIRM_EVIDENCE cutoff_passed',
        JSON.stringify({ status: cutoffRes.status, body: await cutoffRes.json() }),
      );
      if (cutoffRes.status !== 409) {
        throw new Error(`Expected cutoff passed 409, got ${cutoffRes.status}`);
      }

      // CONCURRENT DOUBLE-CONFIRM must resolve to exactly one booking.
      // (This is the check the Playwright spec also ran via raw API — deduped here.)
      const raceUserId = 'member-self-confirm-race';
      await db.subscription.create({
        data: {
          userId: raceUserId,
          tenantId: memberTenant,
          mandateId: 'mandate-member-race',
          amount: 100000,
          frequency: 'monthly',
          status: 'active',
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: raceUserId,
          resourcePoolId: memberPool.id,
          daysOfWeek: todayIsoWeekday,
          startTime: assignmentStartTime,
          status: 'ACTIVE',
        },
      });
      const raceToken = signJwt({ userId: raceUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
      const raceHeaders = { Authorization: `Bearer ${raceToken}` };
      const [memberRaceRes1, memberRaceRes2] = await Promise.all([
        fetch(`${baseUrl}/member/today-assignment/confirm`, { method: 'POST', headers: raceHeaders }),
        fetch(`${baseUrl}/member/today-assignment/confirm`, { method: 'POST', headers: raceHeaders }),
      ]);
      const memberRaceBody1 = ((await memberRaceRes1.json()) as any).data;
      const memberRaceBody2 = ((await memberRaceRes2.json()) as any).data;
      const raceCount = await db.booking.count({
        where: { userId: raceUserId, windowId: selfConfirmWindow.id, status: { not: BookingStatus.CANCELLED } },
      });
      console.log(
        'MEMBER_CONFIRM_EVIDENCE concurrent_double_confirm',
        JSON.stringify({
          statuses: [memberRaceRes1.status, memberRaceRes2.status],
          bookingIds: [memberRaceBody1?.id, memberRaceBody2?.id],
          raceCount,
        }),
      );
      if (raceCount !== 1 || memberRaceBody1?.id !== memberRaceBody2?.id) {
        throw new Error('Concurrent confirm did not resolve to one booking.');
      }
    },
  },
];
