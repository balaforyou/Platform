import { PrismaClient } from '@badminton/database';
import { SERVICE_URLS, assertDisposableDatabase } from '@badminton/test-harness';

export const db = new PrismaClient();

export const identityUrl = SERVICE_URLS.identityAuth;
export const slotEngineUrl = SERVICE_URLS.slotEngine;
export const tenantUrl = SERVICE_URLS.tenantManagement;
export const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

/** Auth header for the platform-internal endpoints that require the service key. */
export const internalHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${internalKey}`,
};

/**
 * Shared, mutable context threaded through the tenant-management sections.
 * Branch A is created by the draft-gate section and reused by the role-scoping
 * and JWT-embedding sections, exactly as the original single-function test did.
 */
export interface TenantContext {
  tenant: any;
  branchA?: any;
  branchB?: any;
}

/** Decodes a JWT payload without third-party libraries. */
export function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
}

export async function cleanDatabase() {
  // F-101: fail closed before any unscoped delete. Everything below runs without a WHERE
  // clause, so pointing DATABASE_URL at a database holding real data destroys it.
  assertDisposableDatabase('cleanDatabase()');
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
  await db.roleAssignment.deleteMany();
  await db.branch.deleteMany();
  await db.tenant.deleteMany();
  await db.user.deleteMany();
  console.log('Database cleaned successfully.');
}

/** Seeds the tenant every section operates within. */
export async function setupBaseFixtures(): Promise<TenantContext> {
  await cleanDatabase();

  const tenantRes = await fetch(`${tenantUrl}/tenants`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({
      name: 'Badminton Club',
      subdomain: 'club1',
      appName: 'Club App',
      themeColor: '#123456',
    }),
  });
  if (tenantRes.status !== 200) {
    throw new Error(`Failed to seed tenant, got status ${tenantRes.status}`);
  }
  const tenant = ((await tenantRes.json()) as any).data;
  console.log(`Seeded tenant: ${tenant.name} (${tenant.id})`);

  return { tenant };
}
