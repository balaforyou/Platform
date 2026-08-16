import crypto from 'crypto';
import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS, signJwt, assertDisposableDatabase } from '@badminton/test-harness';

export const db = new PrismaClient();

export const identityUrl = SERVICE_URLS.identityAuth;
export const slotEngineUrl = SERVICE_URLS.slotEngine;
export const paymentUrl = SERVICE_URLS.payment;
export const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
export const webhookSecret = 'test-webhook-secret';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const BRANCH_ID = '22222222-2222-2222-2222-222222222222';
export const USER_ID = '33333333-3333-3333-3333-333333333333';

/**
 * Shared, mutable context for the payment sections.
 * The webhook section confirms a booking that the refund section then cancels
 * and refunds — the same chain the original single-function test relied on.
 */
export interface PaymentContext {
  pool: any;
  window: any;
  /** Set by the webhook-signature section, reused by the idempotency section. */
  validSig?: string;
  payloadStr?: string;
  /** Set by the webhook→confirm section, consumed by the refund section. */
  bookingConfirmed?: any;
  /** Set by the duplicate-intent section, consumed by the F-045 identity sections. */
  dupIntentBookingId?: string;
  /** Set by the negotiated-link section, consumed by the F-049 negotiated-price section. */
  negotiatedBookingId?: string;
}

/**
 * A user's own bearer token.
 *
 * F-045: POST /bookings derives identity from the JWT, and both payment
 * endpoints now cross-check the caller against the booking's owner — so tests
 * must actually hold the token of whoever they claim to be.
 */
export function userToken(userId: string = USER_ID, tenantId: string = TENANT_ID): string {
  return signJwt({ userId, tenantId, userType: 'GUEST', roles: [] });
}

/** Headers for a self-service booking POST as `userId`. */
export function bookingHeaders(userId: string, idempotencyKey: string) {
  return {
    'Content-Type': 'application/json',
    'idempotency-key': idempotencyKey,
    Authorization: `Bearer ${userToken(userId)}`,
  };
}

/** Headers for an authenticated payment call as `userId`. */
export function paymentHeaders(userId: string = USER_ID) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken(userId)}`,
  };
}

/** Produces a valid Razorpay HMAC signature for a raw payload string. */
export function generateRazorpaySignature(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

export function futureAlignedHour(hoursFromNow: number): Date {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  // F-066/F-073: setUTCMinutes, not setMinutes. Availability-window alignment is now
  // judged on the branch's clock (UTC for these fixtures); zeroing LOCAL minutes on a
  // half-hour-offset zone such as IST lands the instant on :30 UTC, which is genuinely
  // unaligned and is correctly rejected with UNALIGNED_TIME_BOUNDARY.
  date.setUTCMinutes(0, 0, 0);
  return date;
}

export async function cleanDatabase() {
  // F-101: fail closed before any unscoped delete. Everything below runs without a WHERE
  // clause, so pointing DATABASE_URL at a database holding real data destroys it.
  assertDisposableDatabase('cleanDatabase()');
  await db.webhookEvent.deleteMany();
  await db.refund.deleteMany();
  await db.paymentIntent.deleteMany();
  await db.subscription.deleteMany();

  await db.bookingPlayer.deleteMany();
  await db.booking.deleteMany();
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
 * Seeds the priced pool (basePrice 125.00), its tiered cancellation rule, and a
 * bookable window 48h out — far enough ahead to earn a 100% refund tier.
 */
export async function setupBaseFixtures(): Promise<PaymentContext> {
  await cleanDatabase();

  // F-091: POST /resource-pools now verifies that the branch exists and belongs to the tenant.
  // These suites have always built pools against TENANT_ID and BRANCH_ID without ever creating
  // those rows, so every fixture pool pointed at a tenant and branch that did not exist. The
  // guard surfaced that; seeding them here makes the fixtures represent real data rather than
  // dangling ids.
  // upsert, not create: these suites share the same TENANT_ID and none of their cleanDatabase()
  // helpers delete tenants, so the row survives from one suite into the next when the whole
  // repo's regression runs in sequence.
  await db.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: 'Payment Regression Tenant', subdomain: 'regr-payment' },
  });
  await db.branch.upsert({
    where: { id: BRANCH_ID },
    update: {},
    create: { id: BRANCH_ID, tenantId: TENANT_ID, name: 'Regression Branch', status: 'ACTIVE', timezone: 'UTC' },
  });

  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    // F-091: these routes now authenticate; the suite takes the internal-key path.
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: 'Priced Pool',
      allocationMode: 'POOLED',
      basePrice: 125.0,
      defaultRate: 125.0,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  await fetch(`${slotEngineUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      memberWindowDays: 30,
      guestOpenWindowDays: 7,
      gracePeriodMinutes: 30,
      prepaymentRequired: true,
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

  const windowRes = await fetch(`${slotEngineUrl}/resource-pools/${pool.id}/availability-windows`, {
    method: 'POST',
    // F-091: these routes now authenticate; the suite takes the internal-key path.
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      startTime: futureAlignedHour(48).toISOString(),
      endTime: futureAlignedHour(49).toISOString(),
      capacity: 5,
    }),
  });
  const window = ((await windowRes.json()) as any).data;

  return { pool, window };
}
