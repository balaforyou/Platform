import crypto from 'crypto';
import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS, assertDisposableDatabase } from '@badminton/test-harness';

export const db = new PrismaClient();

export const notificationUrl = SERVICE_URLS.notification;
export const paymentUrl = SERVICE_URLS.payment;
export const identityUrl = SERVICE_URLS.identityAuth;
export const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
export const webhookSecret = 'test-webhook-secret';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const USER_ID = '33333333-3333-3333-3333-333333333333';

export interface NotificationContext {
  userId: string;
  tenantId: string;
}

export function generateRazorpaySignature(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

export async function cleanDatabase() {
  // F-101: fail closed before any unscoped delete. Everything below runs without a WHERE
  // clause, so pointing DATABASE_URL at a database holding real data destroys it.
  assertDisposableDatabase('cleanDatabase()');
  await db.webhookEvent.deleteMany();
  await db.refund.deleteMany();
  await db.paymentIntent.deleteMany();
  await db.subscription.deleteMany();
  await db.deviceToken.deleteMany();
  await db.notificationRequest.deleteMany();
  await db.notificationTemplate.deleteMany();
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

/** Seeds the user Identity lookups resolve to (needed for SMS destination). */
export async function setupBaseFixtures(): Promise<NotificationContext> {
  await cleanDatabase();

  await db.user.upsert({
    where: { id: USER_ID },
    update: {
      phone: '+919999999999',
      email: 'test@example.com',
      isPhoneVerified: true,
      userType: 'MEMBER',
    },
    create: {
      id: USER_ID,
      tenantId: TENANT_ID,
      phone: '+919999999999',
      email: 'test@example.com',
      isPhoneVerified: true,
      userType: 'MEMBER',
    },
  });
  console.log('Test user seeded in DB');

  return { userId: USER_ID, tenantId: TENANT_ID };
}
