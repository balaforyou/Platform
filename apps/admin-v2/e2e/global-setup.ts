import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '../../../packages/database/dist/index.js';

// admin-v2 e2e needs identity-auth (3002) + tenant-management (3003) live against a
// disposable DB. Playwright's webServer only covers the Vite dev server, so this
// spawns the two backends from their built dist, seeds a JBC admin, and records the
// PIDs for global-teardown.

const PID_FILE = resolve(process.cwd(), 'e2e/.pids.json');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const TEST_ADMIN_EMAIL = 'e2e-admin@jbc-e2e.test';
export const TEST_NONADMIN_EMAIL = 'e2e-frontdesk@jbc-e2e.test';
export const TEST_MANAGER_ONE_EMAIL = 'e2e-manager-one@jbc-e2e.test'; // scoped to ONE branch
export const TEST_MANAGER_TWO_EMAIL = 'e2e-manager-two@jbc-e2e.test'; // scoped to TWO branches
export const TEST_TENANT_SUBDOMAIN = 'jbc-e2e';

function startService(name: string, entry: string, port: number, extra: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY || 'test-service-key',
      ...extra,
    },
    stdio: 'ignore',
    detached: false,
  });
  child.on('error', (e) => console.error(`[${name}] spawn error`, e));
  return child;
}

async function waitForHealth(url: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error(`service never became healthy: ${url}`);
}

export default async function globalSetup() {
  const root = resolve(process.cwd(), '../..');
  const prisma = new PrismaClient();

  // Fresh fixtures.
  const existing = await prisma.tenant.findFirst({ where: { subdomain: TEST_TENANT_SUBDOMAIN } });
  if (existing) {
    await prisma.webAuthnCredential.deleteMany({ where: { user: { tenantId: existing.id } } });
    await prisma.authSession.deleteMany({ where: { user: { tenantId: existing.id } } });
    await prisma.roleAssignment.deleteMany({ where: { tenantId: existing.id } });
    await prisma.user.deleteMany({ where: { tenantId: existing.id } });
    await prisma.branch.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }
  const tenant = await prisma.tenant.create({
    data: {
      name: 'JBC E2E', subdomain: TEST_TENANT_SUBDOMAIN, appName: 'JBC E2E',
      themeColor: '#059669', plan: 'basic', status: 'active',
    },
  });
  const admin = await prisma.user.create({
    data: { tenantId: tenant.id, email: TEST_ADMIN_EMAIL, userType: 'STAFF', isEmailVerified: true },
  });
  await prisma.roleAssignment.create({ data: { userId: admin.id, tenantId: tenant.id, branchId: null, role: 'OWNER' } });
  // S1: two branches in DIFFERENT time zones (the JBC / courtowner1 shape), so the role shell and the
  // global branch switcher can be exercised for an owner, a one-branch manager and a two-branch manager.
  const branch = await prisma.branch.create({
    data: { tenantId: tenant.id, name: 'E2E Branch', status: 'ACTIVE', timezone: 'UTC' },
  });
  const branch2 = await prisma.branch.create({
    data: { tenantId: tenant.id, name: 'E2E Branch Two', status: 'ACTIVE', timezone: 'Asia/Kolkata' },
  });
  // Both sellable modules ACTIVE so Walk-in / Manage Members appear in the nav (F-206 gating is
  // unchanged; it is just satisfied here).
  for (const module of ['GUEST_BOOKING', 'MEMBER_MANAGEMENT'] as const) {
    await prisma.moduleEntitlement.create({
      data: { tenantId: tenant.id, module, startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01') },
    });
  }
  const managerOne = await prisma.user.create({
    data: { tenantId: tenant.id, email: TEST_MANAGER_ONE_EMAIL, userType: 'STAFF', isEmailVerified: true },
  });
  await prisma.roleAssignment.create({
    data: { userId: managerOne.id, tenantId: tenant.id, branchId: branch.id, role: 'BRANCH_MANAGER' },
  });
  const managerTwo = await prisma.user.create({
    data: { tenantId: tenant.id, email: TEST_MANAGER_TWO_EMAIL, userType: 'STAFF', isEmailVerified: true },
  });
  for (const b of [branch, branch2]) {
    await prisma.roleAssignment.create({
      data: { userId: managerTwo.id, tenantId: tenant.id, branchId: b.id, role: 'BRANCH_MANAGER' },
    });
  }
  const frontDesk = await prisma.user.create({
    data: { tenantId: tenant.id, email: TEST_NONADMIN_EMAIL, userType: 'STAFF', isEmailVerified: true },
  });
  await prisma.roleAssignment.create({
    data: { userId: frontDesk.id, tenantId: tenant.id, branchId: branch.id, role: 'FRONT_DESK' },
  });
  await prisma.$disconnect();

  const tm = startService('tenant-management', resolve(root, 'services/tenant-management/dist/index.js'), 3003, {});
  const ia = startService('identity-auth', resolve(root, 'services/identity-auth/dist/index.js'), 3002, {
    TENANT_SERVICE_URL: 'http://localhost:3003',
    // The spec's devSignIn helper posts `dev-admin-token-<email>` — that path is now
    // gated on ADMIN_DEV_LOGIN, not NODE_ENV. Opt in here; production never sets it.
    ADMIN_DEV_LOGIN: 'true',
    // localhost RP defaults are fine — the Vite dev server is http://127.0.0.1:5175,
    // and RP ID "localhost" covers 127.0.0.1 for the virtual authenticator.
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_ORIGIN: 'http://localhost:5175',
  });

  await waitForHealth('http://localhost:3003/health');
  await waitForHealth('http://localhost:3002/health');

  writeFileSync(PID_FILE, JSON.stringify({ tm: tm.pid, ia: ia.pid, tenantId: tenant.id }));
}
