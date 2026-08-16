import { Section, signJwt } from '@badminton/test-harness';
import { AllocationMode, Prisma, PricingMode } from '@badminton/database';
import { db, baseUrl, SlotEngineContext } from './_fixtures';

/**
 * F-043 PHASE B — availability generation through the REAL HTTP API (lazy
 * generation on read). Migrated from availabilityGeneration.phaseB.test.ts.
 *
 * The trust-boundary section of that file has been RELOCATED to
 * admin-operations.regression.ts, so every "can this admin touch another
 * branch" check lives together. Everything else moves here unchanged.
 */
const tenantId = 'phase-b-tenant';
const branchId = 'phase-b-branch';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body: body as any, data: (body as any).data as T };
}

function dateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoWeekdayCsv(date: string) {
  const day = dateOnly(date).getUTCDay();
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

async function createPool(name: string, branch = branchId, guestOpenWindowDays = 30) {
  const pool = await db.resourcePool.create({
    data: {
      tenantId,
      branchId: branch,
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
  await db.bookingRule.create({
    data: {
      resourcePoolId: pool.id,
      guestOpenWindowDays,
      memberWindowDays: 30,
      gracePeriodMinutes: 30,
      guestAccessCutoffMinutes: 120,
      lowOccupancyThresholdPct: 50,
      prepaymentRequired: true,
      cancellationPolicyJson: {
        type: 'tiered',
        tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }],
      },
    },
  });
  return pool;
}

async function addPattern(
  resourcePoolId: string,
  date: string,
  startTime = '10:00',
  endTime = '12:00',
  capacity = 4,
) {
  return db.availabilityPattern.create({
    data: {
      resourcePoolId,
      daysOfWeek: isoWeekdayCsv(date),
      startTime,
      endTime,
      slotDurationMinutes: 60,
      capacity,
      pricingMode: PricingMode.FLAT,
      price: new Prisma.Decimal(125),
    },
  });
}

async function windowsForDate(resourcePoolId: string, date: string) {
  const start = dateOnly(date);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return db.availabilityWindow.findMany({
    where: { resourcePoolId, startTime: { gte: start }, endTime: { lte: end } },
    orderBy: { startTime: 'asc' },
  });
}

/** Shared across sections in this file, mirroring the original single-run flow. */
let occupancyPoolId: string;

export const availabilityGenerationApiSections: Section<SlotEngineContext>[] = [
  {
    name: 'Lazy generation triggered by guest GET /availability',
    async run() {
      await cleanup();

      const guestPool = await createPool('Phase B Guest Trigger Pool');
      const guestPattern = await addPattern(guestPool.id, '2026-08-07', '09:00', '11:00', 4);
      const guestBefore = await windowsForDate(guestPool.id, '2026-08-07');
      const guestAvailability = await api<any[]>(`/resource-pools/${guestPool.id}/availability?date=2026-08-07`);
      const guestAfter = await windowsForDate(guestPool.id, '2026-08-07');
      assert(guestAvailability.response.ok, 'guest availability request must succeed');
      assert(guestBefore.length === 0, 'guest trigger must start with zero windows');
      assert(guestAfter.length === 2, 'guest trigger must create windows');
      assert(
        guestAfter.every((window) => window.generatedFromPatternId === guestPattern.id),
        'guest trigger windows must have pattern provenance',
      );
      console.log('GUEST_AVAILABILITY_TRIGGER', {
        status: guestAvailability.response.status,
        before: guestBefore.length,
        returned: guestAvailability.data.length,
        after: guestAfter.map((window) => ({
          startTime: window.startTime.toISOString(),
          generatedFromPatternId: window.generatedFromPatternId,
        })),
      });
    },
  },

  {
    name: 'Lazy generation triggered by admin GET /availability on a different date',
    async run() {
      const ownerJwt = signJwt({ userId: 'phase-b-owner', roles: ['owner'] });
      const adminPool = await createPool('Phase B Admin Trigger Pool');
      const adminPattern = await addPattern(adminPool.id, '2026-08-08', '12:00', '14:00', 3);
      const adminBefore = await windowsForDate(adminPool.id, '2026-08-08');
      const adminAvailability = await api<any[]>(`/resource-pools/${adminPool.id}/availability?date=2026-08-08`, {
        headers: { Authorization: `Bearer ${ownerJwt}` },
      });
      const adminAfter = await windowsForDate(adminPool.id, '2026-08-08');
      assert(adminAvailability.response.ok, 'admin availability request must succeed');
      assert(adminBefore.length === 0, 'admin trigger must start with zero windows');
      assert(adminAfter.length === 2, 'admin trigger must create windows on a different date');
      assert(
        adminAfter.every((window) => window.generatedFromPatternId === adminPattern.id),
        'admin trigger windows must have pattern provenance',
      );
      console.log('ADMIN_AVAILABILITY_TRIGGER', {
        status: adminAvailability.response.status,
        before: adminBefore.length,
        returned: adminAvailability.data.length,
        after: adminAfter.map((window) => ({
          startTime: window.startTime.toISOString(),
          generatedFromPatternId: window.generatedFromPatternId,
        })),
      });
    },
  },

  {
    name: 'Occupancy endpoints (pool + branch) trigger generation before counting capacity',
    async run() {
      const ownerJwt = signJwt({ userId: 'phase-b-owner', roles: ['owner'] });
      const occupancyPool = await createPool('Phase B Occupancy Trigger Pool');
      occupancyPoolId = occupancyPool.id;
      await addPattern(occupancyPool.id, '2026-08-09', '15:00', '17:00', 6);
      const occupancyBefore = await windowsForDate(occupancyPool.id, '2026-08-09');
      // F-091: pool occupancy is now admin-scoped, matching the branch-level call below.
      const poolOccupancy = await api<any>(
        `/resource-pools/${occupancyPool.id}/occupancy?date=2026-08-09`,
        { headers: { Authorization: `Bearer ${ownerJwt}` } },
      );

      const branchOccupancyDate = '2026-08-10';
      await addPattern(occupancyPool.id, branchOccupancyDate, '18:00', '20:00', 7);
      const branchBefore = await windowsForDate(occupancyPool.id, branchOccupancyDate);
      const branchOccupancy = await api<any[]>(
        `/branches/${branchId}/guest-occupancy?date=${branchOccupancyDate}`,
        { headers: { Authorization: `Bearer ${ownerJwt}` } },
      );
      const occupancyAfter = await windowsForDate(occupancyPool.id, '2026-08-09');
      const branchAfter = await windowsForDate(occupancyPool.id, branchOccupancyDate);

      assert(poolOccupancy.response.ok, 'pool occupancy request must succeed');
      assert(branchOccupancy.response.ok, 'branch occupancy request must succeed');
      assert(
        occupancyBefore.length === 0 && occupancyAfter.length === 2,
        'pool occupancy must trigger generation before counting',
      );
      assert(
        branchBefore.length === 0 && branchAfter.length === 2,
        'branch occupancy must trigger generation before counting',
      );
      assert(poolOccupancy.data.totalCapacity === 12, 'pool occupancy must count generated capacity');
      const occupancyRow = branchOccupancy.data.find((row: any) => row.resourcePoolId === occupancyPoolId);
      assert(occupancyRow?.totalCapacity === 14, 'branch occupancy must count generated capacity');
      console.log('OCCUPANCY_TRIGGERS', {
        poolEndpoint: { before: occupancyBefore.length, after: occupancyAfter.length, response: poolOccupancy.data },
        branchEndpoint: { before: branchBefore.length, after: branchAfter.length, matchingRow: occupancyRow },
      });
    },
  },

  {
    name: 'Browse-ahead limit — requesting beyond guestOpenWindowDays returns 400',
    async run() {
      const limitPool = await createPool('Phase B Limit Pool', branchId, 2);
      await addPattern(limitPool.id, '2026-08-20', '09:00', '10:00', 1);
      const limitResponse = await api<any>(`/resource-pools/${limitPool.id}/availability?date=2026-08-20`);
      assert(limitResponse.response.status === 400, 'browse-ahead limit must return 400');
      console.log('BROWSE_AHEAD_LIMIT', { status: limitResponse.response.status, body: limitResponse.body });
    },
  },

  {
    name: 'Override precedence via live API (CLOSED → empty, MODIFIED → override-shaped windows only)',
    async run() {
      const closedPool = await createPool('Phase B Closed Override Pool');
      await addPattern(closedPool.id, '2026-08-11', '10:00', '12:00', 4);
      await db.availabilityOverride.create({
        data: {
          resourcePoolId: closedPool.id,
          date: dateOnly('2026-08-11'),
          type: 'CLOSED',
          reason: 'Phase B closed',
        },
      });
      const closedAvailability = await api<any[]>(`/resource-pools/${closedPool.id}/availability?date=2026-08-11`);
      const closedWindows = await windowsForDate(closedPool.id, '2026-08-11');
      assert(closedAvailability.response.ok, 'closed override availability request must succeed');
      assert(
        closedAvailability.data.length === 0 && closedWindows.length === 0,
        'closed override must return no availability and create no windows',
      );

      const modifiedPool = await createPool('Phase B Modified Override Pool');
      await addPattern(modifiedPool.id, '2026-08-12', '08:00', '11:00', 2);
      await db.availabilityOverride.create({
        data: {
          resourcePoolId: modifiedPool.id,
          date: dateOnly('2026-08-12'),
          type: 'MODIFIED',
          startTime: '14:00',
          endTime: '15:00',
          slotDurationMinutes: 30,
          capacity: 5,
          pricingMode: PricingMode.PER_PERSON,
          price: new Prisma.Decimal(175),
          reason: 'Phase B modified',
        },
      });
      const modifiedAvailability = await api<any[]>(`/resource-pools/${modifiedPool.id}/availability?date=2026-08-12`);
      const modifiedWindows = await windowsForDate(modifiedPool.id, '2026-08-12');
      assert(modifiedAvailability.response.ok, 'modified override availability request must succeed');
      assert(modifiedWindows.length === 2, 'modified override must generate override windows only');
      assert(
        modifiedWindows.every((window) => window.capacity === 5 && Number(window.price) === 175),
        'modified override must use override values',
      );
      console.log('OVERRIDE_PRECEDENCE_API', {
        closed: { returned: closedAvailability.data.length, dbWindows: closedWindows.length },
        modified: modifiedWindows.map((window) => ({
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
    name: 'Range-override expansion (fromDate/toDate → one AvailabilityOverride row per date)',
    async run() {
      const ownerJwt = signJwt({ userId: 'phase-b-owner', roles: ['owner'] });
      const rangePool = await createPool('Phase B Range Override Pool');
      const rangeResponse = await api<any[]>(`/resource-pools/${rangePool.id}/availability-overrides`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({
          fromDate: '2026-08-13',
          toDate: '2026-08-15',
          type: 'CLOSED',
          reason: 'Phase B range closure',
        }),
      });
      const rangeRows = await db.availabilityOverride.findMany({
        where: { resourcePoolId: rangePool.id },
        orderBy: { date: 'asc' },
      });
      assert(rangeResponse.response.status === 201, 'range override API must create rows');
      assert(rangeRows.length === 3, 'range override must expand to one row per date');
      console.log('RANGE_OVERRIDE_EXPANSION', {
        status: rangeResponse.response.status,
        returned: rangeResponse.data.length,
        dbRows: rangeRows.map((row) => ({
          date: row.date.toISOString(),
          type: row.type,
          reason: row.reason,
        })),
      });
    },
  },
];
