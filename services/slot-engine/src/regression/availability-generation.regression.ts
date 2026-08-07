import { Section } from '@badminton/test-harness';
import { AllocationMode, BookingStatus, Prisma, PricingMode } from '@badminton/database';
import { ensureAvailabilityWindowsForDate } from '../availabilityGeneration.js';
import { db, SlotEngineContext } from './_fixtures';

/**
 * F-043 PHASE A — availability generation at the FUNCTION level (no HTTP).
 * Migrated verbatim from availabilityGeneration.phaseA.test.ts.
 *
 * Uses its own tenant id so its pools never collide with the base fixtures.
 */
const tenantId = 'phase-a-tenant';
const branchId = 'phase-a-branch';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function normalizeDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoWeekdayCsv(date: string) {
  const day = normalizeDate(date).getUTCDay();
  return String(day === 0 ? 7 : day);
}

async function cleanup() {
  const pools = await db.resourcePool.findMany({ where: { tenantId }, select: { id: true } });
  const poolIds = pools.map((pool) => pool.id);
  if (poolIds.length === 0) return;

  await db.bookingPlayer.deleteMany({ where: { booking: { resourcePoolId: { in: poolIds } } } });
  await db.booking.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.availabilityWindow.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.availabilityOverride.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.availabilityPattern.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.generationLock.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.bookingRule.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.resource.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await db.resourcePool.deleteMany({ where: { id: { in: poolIds } } });
}

async function createPool(name: string) {
  return db.resourcePool.create({
    data: {
      tenantId,
      branchId,
      name,
      allocationMode: AllocationMode.POOLED,
      capacity: 10,
      minOccupancy: 1,
      minBookingDurationMinutes: 60,
      pricingMode: PricingMode.FLAT,
      defaultRate: new Prisma.Decimal(100),
      basePrice: new Prisma.Decimal(100),
    },
  });
}

async function countWindows(resourcePoolId: string, date: string) {
  const start = normalizeDate(date);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return db.availabilityWindow.count({
    where: { resourcePoolId, startTime: { gte: start }, endTime: { lte: end } },
  });
}

async function windowsForDate(resourcePoolId: string, date: string) {
  const start = normalizeDate(date);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return db.availabilityWindow.findMany({
    where: { resourcePoolId, startTime: { gte: start }, endTime: { lte: end } },
    orderBy: { startTime: 'asc' },
  });
}

const patternDate = '2026-08-11';
const closedDate = '2026-08-12';
const modifiedDate = '2026-08-13';
const raceDate = '2026-08-14';
const stableDate = '2026-08-15';
const emptyDate = '2026-08-16';

export const availabilityGenerationSections: Section<SlotEngineContext>[] = [
  {
    name: 'Pattern-based generation creates hourly windows with provenance and price',
    async run() {
      await cleanup();

      const patternPool = await createPool('Phase A Pattern Pool');
      const pattern = await db.availabilityPattern.create({
        data: {
          resourcePoolId: patternPool.id,
          daysOfWeek: isoWeekdayCsv(patternDate),
          startTime: '18:00',
          endTime: '21:00',
          slotDurationMinutes: 60,
          capacity: 4,
          pricingMode: PricingMode.PER_PERSON,
          price: new Prisma.Decimal(150),
        },
      });

      const beforePattern = await countWindows(patternPool.id, patternDate);
      const patternResult = await ensureAvailabilityWindowsForDate(patternPool.id, patternDate);
      const patternWindows = await windowsForDate(patternPool.id, patternDate);
      assert(beforePattern === 0, 'pattern before-count must be zero');
      assert(patternResult.createdCount === 3, 'pattern helper must create three hourly windows');
      assert(patternWindows.length === 3, 'pattern DB count must be three');
      assert(
        patternWindows.every((window) => window.generatedFromPatternId === pattern.id),
        'pattern windows must carry provenance',
      );
      assert(
        patternWindows.every((window) => Number(window.price) === 150),
        'pattern windows must carry pattern price',
      );
      console.log('PATTERN_BEFORE_AFTER', {
        before: beforePattern,
        result: patternResult,
        after: patternWindows.map((window) => ({
          startTime: window.startTime.toISOString(),
          endTime: window.endTime.toISOString(),
          capacity: window.capacity,
          pricingMode: window.pricingMode,
          price: Number(window.price),
          generatedFromPatternId: window.generatedFromPatternId,
          generationDate: window.generationDate?.toISOString(),
        })),
      });
    },
  },

  {
    name: 'CLOSED override takes precedence over pattern (zero windows)',
    async run() {
      const closedPool = await createPool('Phase A Closed Pool');
      await db.availabilityPattern.create({
        data: {
          resourcePoolId: closedPool.id,
          daysOfWeek: isoWeekdayCsv(closedDate),
          startTime: '10:00',
          endTime: '12:00',
          slotDurationMinutes: 60,
          capacity: 2,
        },
      });
      await db.availabilityOverride.create({
        data: {
          resourcePoolId: closedPool.id,
          date: normalizeDate(closedDate),
          type: 'CLOSED',
          reason: 'Phase A closure',
        },
      });
      const closedResult = await ensureAvailabilityWindowsForDate(closedPool.id, closedDate);
      const closedCount = await countWindows(closedPool.id, closedDate);
      assert(closedResult.source === 'CLOSED_OVERRIDE', 'closed override must take precedence');
      assert(closedCount === 0, 'closed override must create zero windows');
      console.log('CLOSED_OVERRIDE', { result: closedResult, afterCount: closedCount });
    },
  },

  {
    name: 'MODIFIED override takes precedence (override capacity/price/duration, no pattern provenance)',
    async run() {
      const modifiedPool = await createPool('Phase A Modified Pool');
      await db.availabilityPattern.create({
        data: {
          resourcePoolId: modifiedPool.id,
          daysOfWeek: isoWeekdayCsv(modifiedDate),
          startTime: '09:00',
          endTime: '12:00',
          slotDurationMinutes: 60,
          capacity: 2,
          pricingMode: PricingMode.FLAT,
          price: new Prisma.Decimal(90),
        },
      });
      await db.availabilityOverride.create({
        data: {
          resourcePoolId: modifiedPool.id,
          date: normalizeDate(modifiedDate),
          type: 'MODIFIED',
          startTime: '14:00',
          endTime: '16:00',
          slotDurationMinutes: 30,
          capacity: 5,
          pricingMode: PricingMode.PER_PERSON,
          price: new Prisma.Decimal(175),
          reason: 'Phase A modified hours',
        },
      });
      const modifiedResult = await ensureAvailabilityWindowsForDate(modifiedPool.id, modifiedDate);
      const modifiedWindows = await windowsForDate(modifiedPool.id, modifiedDate);
      assert(modifiedResult.source === 'MODIFIED_OVERRIDE', 'modified override must take precedence');
      assert(modifiedWindows.length === 4, 'modified override must create four 30-minute windows');
      assert(
        modifiedWindows[0].startTime.toISOString().includes('14:00:00.000Z'),
        'modified windows must start at override start',
      );
      assert(modifiedWindows.every((window) => window.capacity === 5), 'modified windows must use override capacity');
      assert(
        modifiedWindows.every((window) => window.generatedFromPatternId === null),
        'modified windows must not claim pattern provenance',
      );
      console.log('MODIFIED_OVERRIDE', {
        result: modifiedResult,
        after: modifiedWindows.map((window) => ({
          startTime: window.startTime.toISOString(),
          endTime: window.endTime.toISOString(),
          capacity: window.capacity,
          pricingMode: window.pricingMode,
          price: Number(window.price),
          generatedFromPatternId: window.generatedFromPatternId,
        })),
      });
    },
  },

  {
    name: 'Generation-lock concurrency proof (two concurrent calls → exactly one generated set, one lock row)',
    async run() {
      const racePool = await createPool('Phase A Race Pool');
      await db.availabilityPattern.create({
        data: {
          resourcePoolId: racePool.id,
          daysOfWeek: isoWeekdayCsv(raceDate),
          startTime: '08:00',
          endTime: '11:00',
          slotDurationMinutes: 60,
          capacity: 3,
        },
      });
      const raceBefore = await countWindows(racePool.id, raceDate);
      const raceResults = await Promise.all([
        ensureAvailabilityWindowsForDate(racePool.id, raceDate),
        ensureAvailabilityWindowsForDate(racePool.id, raceDate),
      ]);
      const raceAfter = await countWindows(racePool.id, raceDate);
      const raceLockCount = await db.generationLock.count({
        where: { resourcePoolId: racePool.id, date: normalizeDate(raceDate) },
      });
      assert(raceBefore === 0, 'race before-count must be zero');
      assert(raceAfter === 3, 'race must leave exactly one generated set');
      assert(raceLockCount === 1, 'race must use exactly one lock row for pool/date');
      assert(
        raceResults.reduce((sum, result) => sum + result.createdCount, 0) === 3,
        'only one concurrent call may create windows',
      );
      console.log('CONCURRENCY_PROOF', {
        before: raceBefore,
        results: raceResults,
        after: raceAfter,
        generationLockRows: raceLockCount,
      });
    },
  },

  {
    name: 'Booking stability — editing a pattern must not mutate existing windows or bookings',
    async run() {
      const stablePool = await createPool('Phase A Stable Booking Pool');
      const stablePattern = await db.availabilityPattern.create({
        data: {
          resourcePoolId: stablePool.id,
          daysOfWeek: isoWeekdayCsv(stableDate),
          startTime: '19:00',
          endTime: '20:00',
          slotDurationMinutes: 60,
          capacity: 6,
          pricingMode: PricingMode.FLAT,
          price: new Prisma.Decimal(220),
        },
      });
      await ensureAvailabilityWindowsForDate(stablePool.id, stableDate);
      const [stableWindow] = await windowsForDate(stablePool.id, stableDate);
      const booking = await db.booking.create({
        data: {
          tenantId,
          branchId,
          resourcePoolId: stablePool.id,
          resourceId: null,
          windowId: stableWindow.id,
          userId: 'phase-a-user',
          status: BookingStatus.CONFIRMED,
          heldAt: new Date('2026-08-06T00:00:00.000Z'),
          heldUntil: new Date('2026-08-06T00:05:00.000Z'),
          idempotencyKey: 'phase-a-stable-booking',
          isMemberBooking: false,
          price: new Prisma.Decimal(220),
        },
      });
      const stableWindowBefore = await db.availabilityWindow.findUniqueOrThrow({ where: { id: stableWindow.id } });
      const bookingBefore = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });

      // Edit the pattern out from under the already-generated window.
      await db.availabilityPattern.update({
        where: { id: stablePattern.id },
        data: {
          startTime: '07:00',
          endTime: '08:00',
          capacity: 1,
          price: new Prisma.Decimal(50),
          status: 'SUSPENDED',
        },
      });

      const stableWindowAfter = await db.availabilityWindow.findUniqueOrThrow({ where: { id: stableWindow.id } });
      const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      assert(
        stableWindowAfter.startTime.getTime() === stableWindowBefore.startTime.getTime(),
        'pattern edit must not change existing window start',
      );
      assert(
        stableWindowAfter.endTime.getTime() === stableWindowBefore.endTime.getTime(),
        'pattern edit must not change existing window end',
      );
      assert(
        stableWindowAfter.capacity === stableWindowBefore.capacity,
        'pattern edit must not change existing window capacity',
      );
      assert(
        Number(stableWindowAfter.price) === Number(stableWindowBefore.price),
        'pattern edit must not change existing window price',
      );
      assert(bookingAfter.windowId === bookingBefore.windowId, 'pattern edit must not change booking windowId');
      assert(bookingAfter.status === bookingBefore.status, 'pattern edit must not change booking status');
      assert(
        Number(bookingAfter.price) === Number(bookingBefore.price),
        'pattern edit must not change booking price',
      );
      console.log('BOOKING_STABILITY_AFTER_PATTERN_EDIT', {
        windowBefore: {
          id: stableWindowBefore.id,
          startTime: stableWindowBefore.startTime.toISOString(),
          endTime: stableWindowBefore.endTime.toISOString(),
          capacity: stableWindowBefore.capacity,
          price: Number(stableWindowBefore.price),
          generatedFromPatternId: stableWindowBefore.generatedFromPatternId,
        },
        windowAfter: {
          id: stableWindowAfter.id,
          startTime: stableWindowAfter.startTime.toISOString(),
          endTime: stableWindowAfter.endTime.toISOString(),
          capacity: stableWindowAfter.capacity,
          price: Number(stableWindowAfter.price),
          generatedFromPatternId: stableWindowAfter.generatedFromPatternId,
        },
        bookingBefore: {
          id: bookingBefore.id,
          windowId: bookingBefore.windowId,
          status: bookingBefore.status,
          price: Number(bookingBefore.price),
        },
        bookingAfter: {
          id: bookingAfter.id,
          windowId: bookingAfter.windowId,
          status: bookingAfter.status,
          price: Number(bookingAfter.price),
        },
      });
    },
  },

  {
    name: 'No pattern and no override → source NONE, nothing created',
    async run() {
      const emptyPool = await createPool('Phase A Empty Pool');
      const emptyResult = await ensureAvailabilityWindowsForDate(emptyPool.id, emptyDate);
      const emptyCount = await countWindows(emptyPool.id, emptyDate);
      assert(emptyResult.source === 'NONE', 'empty pool must report no generation source');
      assert(emptyResult.createdCount === 0, 'empty pool must create nothing');
      assert(emptyCount === 0, 'empty pool must remain untouched');
      console.log('NO_PATTERN_NO_OVERRIDE', { result: emptyResult, afterCount: emptyCount });
    },
  },
];
