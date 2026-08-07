import crypto from 'crypto';
import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS } from '@badminton/test-harness';

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
}

/** Produces a valid Razorpay HMAC signature for a raw payload string. */
export function generateRazorpaySignature(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

export function futureAlignedHour(hoursFromNow: number): Date {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date;
}

export async function cleanDatabase() {
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

  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: futureAlignedHour(48).toISOString(),
      endTime: futureAlignedHour(49).toISOString(),
      capacity: 5,
    }),
  });
  const window = ((await windowRes.json()) as any).data;

  return { pool, window };
}
