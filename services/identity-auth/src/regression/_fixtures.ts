import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS, signJwt } from '@badminton/test-harness';

export const db = new PrismaClient();

export const identityUrl = SERVICE_URLS.identityAuth;
export const slotEngineUrl = SERVICE_URLS.slotEngine;
export const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const BRANCH_ID = '22222222-2222-2222-2222-222222222222';
export const PHONE = '9999999999';
export const NORMALIZED_PHONE = '+919999999999';

/**
 * Shared, mutable context threaded through the identity-auth sections in order.
 *
 * WHY MUTABLE: registration (otp-flow) produces the user + refresh cookie that
 * the jwt-session sections then rotate and log in with. The pre-consolidation
 * identity.test.ts held these in local variables of a single 500-line function;
 * splitting into sections requires them to live somewhere explicit.
 */
export interface IdentityContext {
  bookingId: string;
  /** Set by otp-flow's registration section. */
  user?: any;
  /** Set by otp-flow's registration section — raw Set-Cookie header value. */
  cookieHeader?: string;
}

function futureAlignedHour(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  // F-066/F-073: setUTCMinutes, not setMinutes. Availability-window alignment is now
  // judged on the branch's clock (UTC for these fixtures); zeroing LOCAL minutes on a
  // half-hour-offset zone such as IST lands the instant on :30 UTC, which is genuinely
  // unaligned and is correctly rejected with UNALIGNED_TIME_BOUNDARY.
  date.setUTCMinutes(0, 0, 0);
  return date;
}

/** Wipes every table these sections touch, so each run is deterministic. */
export async function cleanDatabase() {
  await db.bookingPlayer.deleteMany();
  await db.booking.deleteMany();
  await db.availabilityWindow.deleteMany();
  await db.resource.deleteMany();
  await db.blockedWindow.deleteMany();
  await db.bookingRule.deleteMany();
  await db.resourcePool.deleteMany();

  await db.authSession.deleteMany();
  await db.otpRequest.deleteMany();
  await db.pendingInvite.deleteMany();
  await db.user.deleteMany();
  console.log('Database cleaned successfully.');
}

/**
 * Seeds the Slot Engine pool/window/group-booking and the matching PendingInvite,
 * so the invite-resolution section has a real co-player row to be linked to.
 */
export async function setupBaseFixtures(): Promise<IdentityContext> {
  await cleanDatabase();

  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Badminton Pool',
      allocationMode: 'POOLED',
      capacity: 5,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  const start = futureAlignedHour(2);
  const end = futureAlignedHour(3);
  const windowRes = await fetch(`${slotEngineUrl}/resource-pools/${pool.id}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      capacity: 5,
    }),
  });
  const window = ((await windowRes.json()) as any).data;

  // F-045: POST /bookings derives the booker's identity from the JWT, so the
  // seed must hold the booker's own token rather than naming them in the body.
  const bookerToken = signJwt({
    userId: 'booker-user-id',
    tenantId: TENANT_ID,
    userType: 'GUEST',
    roles: [],
  });
  const bookingRes = await fetch(`${slotEngineUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': 'invite-booking-key-t3',
      Authorization: `Bearer ${bookerToken}`,
    },
    body: JSON.stringify({
      branchId: BRANCH_ID,
      resourcePoolId: pool.id,
      windowId: window.id,
      coPlayers: [PHONE],
    }),
  });
  const booking = ((await bookingRes.json()) as any).data;
  console.log(`Seeded group booking: ${booking.id} with invited co-player phone: ${PHONE}`);

  await fetch(`${identityUrl}/users/resolve-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_ID, phone: PHONE }),
  });

  return { bookingId: booking.id };
}
