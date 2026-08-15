import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS, signJwt, assertDisposableDatabase } from '@badminton/test-harness';

export const db = new PrismaClient();
export const baseUrl = SERVICE_URLS.slotEngine;
export const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const BRANCH_ID = '22222222-2222-2222-2222-222222222222';
export const USER_ID_1 = '33333333-3333-3333-3333-333333333333';
export const USER_ID_2 = '44444444-4444-4444-4444-444444444444';

/**
 * Shared, mutable context for the slot-engine sections.
 *
 * WHY THIS EXISTS: concurrency.test.ts created its pools/resource/windows once at
 * the top of a single 800-line function, and Tests 0-7 all reused that same state.
 * Splitting into sections requires that setup to be explicit and threaded through.
 */
export interface SlotEngineContext {
  fixedPool: any;
  resource: any;
  window: any;
  pooledPool: any;
  pooledWindow: any;
}

/**
 * A guest's own bearer token.
 *
 * F-045: POST /bookings now derives userId AND tenantId from the verified JWT,
 * so a test acting as a given user must actually hold that user's token — the
 * body no longer decides who books.
 */
export function guestToken(userId: string, tenantId: string = TENANT_ID): string {
  return signJwt({ userId, tenantId, userType: 'GUEST', roles: [] });
}

/** Standard headers for a self-service booking POST as `userId`. */
export function bookingHeaders(userId: string, idempotencyKey: string) {
  return {
    'Content-Type': 'application/json',
    'idempotency-key': idempotencyKey,
    Authorization: `Bearer ${guestToken(userId)}`,
  };
}

// F-066/F-073: aligns on UTC, the clock the seeded fixtures' branch uses. `setMinutes`
// zeroes LOCAL minutes, which on a half-hour-offset zone such as IST leaves the instant at
// :30 UTC — an "aligned hour" that is not aligned, and which drifts away from the weekday
// derived elsewhere in the same fixture.
export function nextAlignedHour(hoursFromNow: number): Date {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

/**
 * F-073: a future instant guaranteed to fall inside TODAY's UTC date.
 *
 * A fixed relative offset such as `nextAlignedHour(4)` silently lands on tomorrow when the
 * suite runs late in the UTC day, and several things then look for it on today's date:
 * `resolveTodayMemberAssignment` builds its lookup from today's branch date plus the
 * assignment's `startTime`, and `/occupancy` counts bookings within today's UTC bounds.
 * The window exists, nothing errors, and the section fails with WINDOW_NOT_FOUND or a zero
 * seat count — which is exactly F-073, and it is genuinely time-of-day dependent: these
 * sections passed all day and failed after 22:00 UTC.
 *
 * Requesting the offset you want and taking whatever remains of the day keeps the intent
 * ("a window a few hours out") while removing the dependency on the wall-clock hour.
 */
export function withinTodayUtc(minutesAhead: number): Date {
  const now = new Date();
  const endOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutesLeft = Math.floor((endOfUtcDay - now.getTime()) / 60000);
  const offset = Math.min(minutesAhead, minutesLeft - 2);
  if (offset < 2) {
    throw new Error(
      `withinTodayUtc: only ${minutesLeft} minutes remain in the UTC day; this fixture needs at least 2. ` +
        'Re-run outside the final two minutes before UTC midnight.',
    );
  }
  const date = new Date(now.getTime() + offset * 60 * 1000);
  date.setUTCSeconds(0, 0);
  return date;
}

/**
 * Wipes every table these sections touch.
 *
 * NOTE (consolidation-specific): availabilityPattern / availabilityOverride /
 * generationLock are cleared here even though the pre-consolidation
 * concurrency.test.ts did not clear them. They must be, because the availability
 * generation sections now run in the SAME process afterwards and leave pattern
 * rows behind — a later `resourcePool.deleteMany()` would otherwise fail on a
 * foreign-key constraint. This is required infrastructure for the split, not a
 * change to what any test asserts.
 */
export async function cleanDatabase() {
  // F-101: fail closed before any unscoped delete. Everything below runs without a WHERE
  // clause, so pointing DATABASE_URL at a database holding real data destroys it.
  assertDisposableDatabase('cleanDatabase()');
  await db.bookingPlayer.deleteMany();
  await db.booking.deleteMany();
  await db.memberGroupAssignment.deleteMany();
  await db.subscription.deleteMany();
  await db.availabilityWindow.deleteMany();
  await db.availabilityOverride.deleteMany();
  await db.availabilityPattern.deleteMany();
  await db.generationLock.deleteMany();
  await db.resource.deleteMany();
  await db.blockedWindow.deleteMany();
  await db.bookingRule.deleteMany();
  await db.resourcePool.deleteMany();
  console.log('Database cleaned successfully.');
}

/**
 * Seeds the FIXED_INSTANCE pool (+ court resource + window) and the POOLED pool
 * (+ capacity-2 window) that the admin/guest/sweep sections all operate on.
 */
export async function setupBaseFixtures(): Promise<SlotEngineContext> {
  await cleanDatabase();

  // FIXED_INSTANCE pool — one court, one bookable instance at a time.
  const fixedPoolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Badminton Court Pool',
      allocationMode: 'FIXED_INSTANCE',
    }),
  });
  const fixedPool = ((await fixedPoolRes.json()) as any).data;

  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: fixedPool.id,
      gracePeriodMinutes: 30,
      cancellationPolicyJson: {
        type: 'tiered',
        tiers: [
          { min_hours_before_slot: 24, refund_percent: 100 },
          { min_hours_before_slot: 6, refund_percent: 50 },
          { min_hours_before_slot: 0, refund_percent: 0 },
        ],
      },
    }),
  });

  const resourceRes = await fetch(`${baseUrl}/resource-pools/${fixedPool.id}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Court_1' }),
  });
  const resource = ((await resourceRes.json()) as any).data;

  const startTime = nextAlignedHour(2);
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);

  const windowRes = await fetch(`${baseUrl}/resource-pools/${fixedPool.id}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceId: resource.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    }),
  });
  const window = ((await windowRes.json()) as any).data;

  // POOLED pool — capacity 2, so the third concurrent hold must be rejected.
  const pooledPoolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Driver Pool',
      allocationMode: 'POOLED',
      capacity: 2,
    }),
  });
  const pooledPool = ((await pooledPoolRes.json()) as any).data;

  const pooledWindowRes = await fetch(`${baseUrl}/resource-pools/${pooledPool.id}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      capacity: 2,
    }),
  });
  const pooledWindow = ((await pooledWindowRes.json()) as any).data;

  console.log('Seeded database entries successfully. Beginning sections...');

  return { fixedPool, resource, window, pooledPool, pooledWindow };
}
