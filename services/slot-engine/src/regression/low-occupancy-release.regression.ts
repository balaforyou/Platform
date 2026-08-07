import { Section } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, SlotEngineContext, TENANT_ID, BRANCH_ID, USER_ID_1, USER_ID_2 } from './_fixtures';

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

      const sweepRes = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST' });
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
    name: 'Member auto-release vs guest preserve, and F-022 attendance-confirmed guard',
    async run(ctx) {
      await db.booking.deleteMany();

      // A window starting inside the 30-minute grace period.
      const windowStartT6 = new Date(Date.now() + 15 * 60 * 1000);
      const windowEndT6 = new Date(windowStartT6.getTime() + 1 * 60 * 60 * 1000);

      const windowT6 = await db.availabilityWindow.create({
        data: {
          resourcePoolId: ctx.pooledPool.id,
          startTime: windowStartT6,
          endTime: windowEndT6,
          capacity: 5,
        },
      });

      const memberBooking = await db.booking.create({
        data: {
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pooledPool.id,
          windowId: windowT6.id,
          userId: USER_ID_1,
          status: BookingStatus.CONFIRMED,
          isMemberBooking: true,
          heldUntil: new Date(),
          idempotencyKey: 'member-booking-t6',
        },
      });

      // F-022: a member who confirmed attendance must NOT be swept away.
      const attendanceConfirmedMember = await db.booking.create({
        data: {
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pooledPool.id,
          windowId: windowT6.id,
          userId: 'member-attendance-confirmed-t6',
          status: BookingStatus.CONFIRMED,
          isMemberBooking: true,
          memberAttendanceConfirmedAt: new Date(),
          heldUntil: new Date(),
          idempotencyKey: 'member-booking-confirmed-t6',
        },
      });

      // Guests paid — they keep their slot regardless of the grace period.
      const guestBooking = await db.booking.create({
        data: {
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pooledPool.id,
          windowId: windowT6.id,
          userId: USER_ID_2,
          status: BookingStatus.CONFIRMED,
          isMemberBooking: false,
          heldUntil: new Date(),
          idempotencyKey: 'guest-booking-t6',
        },
      });

      console.log(`Created member booking: ${memberBooking.id} and guest booking: ${guestBooking.id}`);

      const sweepRes2 = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST' });
      const sweepData2 = ((await sweepRes2.json()) as any).data;
      console.log('Sweep 2 result:', sweepData2);

      const updatedMember = await db.booking.findUnique({ where: { id: memberBooking.id } });
      const updatedAttendanceConfirmedMember = await db.booking.findUnique({
        where: { id: attendanceConfirmedMember.id },
      });
      const updatedGuest = await db.booking.findUnique({ where: { id: guestBooking.id } });

      if (updatedMember?.status !== BookingStatus.RELEASED_NO_SHOW) {
        throw new Error(`Expected member booking to be RELEASED_NO_SHOW, got ${updatedMember?.status}`);
      }
      if (updatedGuest?.status !== BookingStatus.CONFIRMED) {
        throw new Error(`Expected guest booking to remain CONFIRMED, got ${updatedGuest?.status}`);
      }
      if (updatedAttendanceConfirmedMember?.status !== BookingStatus.CONFIRMED) {
        throw new Error(
          `Expected attendance-confirmed member booking to remain CONFIRMED, got ${updatedAttendanceConfirmedMember?.status}`,
        );
      }
    },
  },
];
