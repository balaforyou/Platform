import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import {
  AllocationMode,
  Prisma,
  PrismaClient,
  PricingMode,
} from '@badminton/database';

const db = new PrismaClient();
const baseUrl = 'http://localhost:3001';
const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg';
const tenantId = 'phase-b-tenant';
const branchId = 'phase-b-branch';
const otherBranchId = 'phase-b-other-branch';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function signJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Slot Engine server did not become healthy');
}

async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body: body as any, data: body.data as T };
}

function dateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoWeekdayCsv(date: string) {
  const day = dateOnly(date).getUTCDay();
  return String(day === 0 ? 7 : day);
}

async function cleanup() {
  const pools = await db.resourcePool.findMany({
    where: { tenantId },
    select: { id: true },
  });
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

async function addPattern(resourcePoolId: string, date: string, startTime = '10:00', endTime = '12:00', capacity = 4) {
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
    where: {
      resourcePoolId,
      startTime: { gte: start },
      endTime: { lte: end },
    },
    orderBy: { startTime: 'asc' },
  });
}

async function runEvidence() {
  await cleanup();
  const ownerJwt = signJwt({ userId: 'phase-b-owner', roles: ['owner'] });
  const branchManagerJwt = signJwt({ userId: 'phase-b-manager', roles: [`branch_manager:${branchId}`] });

  const guestPool = await createPool('Phase B Guest Trigger Pool');
  const guestPattern = await addPattern(guestPool.id, '2026-08-07', '09:00', '11:00', 4);
  const guestBefore = await windowsForDate(guestPool.id, '2026-08-07');
  const guestAvailability = await api<any[]>(`/resource-pools/${guestPool.id}/availability?date=2026-08-07`);
  const guestAfter = await windowsForDate(guestPool.id, '2026-08-07');
  assert(guestAvailability.response.ok, 'guest availability request must succeed');
  assert(guestBefore.length === 0, 'guest trigger must start with zero windows');
  assert(guestAfter.length === 2, 'guest trigger must create windows');
  assert(guestAfter.every((window) => window.generatedFromPatternId === guestPattern.id), 'guest trigger windows must have pattern provenance');
  console.log('GUEST_AVAILABILITY_TRIGGER', {
    status: guestAvailability.response.status,
    before: guestBefore.length,
    returned: guestAvailability.data.length,
    after: guestAfter.map((window) => ({
      startTime: window.startTime.toISOString(),
      generatedFromPatternId: window.generatedFromPatternId,
    })),
  });

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
  assert(adminAfter.every((window) => window.generatedFromPatternId === adminPattern.id), 'admin trigger windows must have pattern provenance');
  console.log('ADMIN_AVAILABILITY_TRIGGER', {
    status: adminAvailability.response.status,
    before: adminBefore.length,
    returned: adminAvailability.data.length,
    after: adminAfter.map((window) => ({
      startTime: window.startTime.toISOString(),
      generatedFromPatternId: window.generatedFromPatternId,
    })),
  });

  const occupancyPool = await createPool('Phase B Occupancy Trigger Pool');
  await addPattern(occupancyPool.id, '2026-08-09', '15:00', '17:00', 6);
  const occupancyBefore = await windowsForDate(occupancyPool.id, '2026-08-09');
  const poolOccupancy = await api<any>(`/resource-pools/${occupancyPool.id}/occupancy?date=2026-08-09`);
  const branchOccupancyDate = '2026-08-10';
  await addPattern(occupancyPool.id, branchOccupancyDate, '18:00', '20:00', 7);
  const branchBefore = await windowsForDate(occupancyPool.id, branchOccupancyDate);
  const branchOccupancy = await api<any[]>(`/branches/${branchId}/guest-occupancy?date=${branchOccupancyDate}`, {
    headers: { Authorization: `Bearer ${ownerJwt}` },
  });
  const occupancyAfter = await windowsForDate(occupancyPool.id, '2026-08-09');
  const branchAfter = await windowsForDate(occupancyPool.id, branchOccupancyDate);
  assert(poolOccupancy.response.ok, 'pool occupancy request must succeed');
  assert(branchOccupancy.response.ok, 'branch occupancy request must succeed');
  assert(occupancyBefore.length === 0 && occupancyAfter.length === 2, 'pool occupancy must trigger generation before counting');
  assert(branchBefore.length === 0 && branchAfter.length === 2, 'branch occupancy must trigger generation before counting');
  assert(poolOccupancy.data.totalCapacity === 12, 'pool occupancy must count generated capacity');
  const occupancyRow = branchOccupancy.data.find((row: any) => row.resourcePoolId === occupancyPool.id);
  assert(occupancyRow?.totalCapacity === 14, 'branch occupancy must count generated capacity');
  console.log('OCCUPANCY_TRIGGERS', {
    poolEndpoint: {
      before: occupancyBefore.length,
      after: occupancyAfter.length,
      response: poolOccupancy.data,
    },
    branchEndpoint: {
      before: branchBefore.length,
      after: branchAfter.length,
      matchingRow: occupancyRow,
    },
  });

  const limitPool = await createPool('Phase B Limit Pool', branchId, 2);
  await addPattern(limitPool.id, '2026-08-20', '09:00', '10:00', 1);
  const limitResponse = await api<any>(`/resource-pools/${limitPool.id}/availability?date=2026-08-20`);
  assert(limitResponse.response.status === 400, 'browse-ahead limit must return 400');
  console.log('BROWSE_AHEAD_LIMIT', {
    status: limitResponse.response.status,
    body: limitResponse.body,
  });

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
  assert(closedAvailability.data.length === 0 && closedWindows.length === 0, 'closed override must return no availability and create no windows');

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
  assert(modifiedWindows.every((window) => window.capacity === 5 && Number(window.price) === 175), 'modified override must use override values');
  console.log('OVERRIDE_PRECEDENCE_API', {
    closed: {
      returned: closedAvailability.data.length,
      dbWindows: closedWindows.length,
    },
    modified: modifiedWindows.map((window) => ({
      startTime: window.startTime.toISOString(),
      endTime: window.endTime.toISOString(),
      capacity: window.capacity,
      pricingMode: window.pricingMode,
      price: Number(window.price),
      generatedFromPatternId: window.generatedFromPatternId,
    })),
  });

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

  const unauthorizedPool = await createPool('Phase B Unauthorized Pool', otherBranchId);
  const existingOtherBranchPattern = await db.availabilityPattern.create({
    data: {
      resourcePoolId: unauthorizedPool.id,
      daysOfWeek: '1',
      startTime: '08:00',
      endTime: '09:00',
      slotDurationMinutes: 60,
      capacity: 1,
    },
  });
  const existingOtherBranchOverride = await db.availabilityOverride.create({
    data: {
      resourcePoolId: unauthorizedPool.id,
      date: dateOnly('2026-08-17'),
      type: 'CLOSED',
      reason: 'Existing forbidden override',
    },
  });
  const unauthorizedPattern = await api<any>(`/resource-pools/${unauthorizedPool.id}/availability-patterns`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({
      daysOfWeek: '1',
      startTime: '10:00',
      endTime: '11:00',
      slotDurationMinutes: 60,
      capacity: 1,
    }),
  });
  const unauthorizedOverride = await api<any>(`/resource-pools/${unauthorizedPool.id}/availability-overrides`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({
      date: '2026-08-16',
      type: 'CLOSED',
      reason: 'Forbidden check',
    }),
  });
  const unauthorizedPatternEdit = await api<any>(`/resource-pools/${unauthorizedPool.id}/availability-patterns/${existingOtherBranchPattern.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({
      capacity: 2,
    }),
  });
  const unauthorizedOverrideEdit = await api<any>(`/resource-pools/${unauthorizedPool.id}/availability-overrides/${existingOtherBranchOverride.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({
      reason: 'Forbidden edit',
    }),
  });
  assert(unauthorizedPattern.response.status === 403, 'branch manager must not create pattern for another branch');
  assert(unauthorizedOverride.response.status === 403, 'branch manager must not create override for another branch');
  assert(unauthorizedPatternEdit.response.status === 403, 'branch manager must not edit pattern for another branch');
  assert(unauthorizedOverrideEdit.response.status === 403, 'branch manager must not edit override for another branch');
  console.log('TRUST_BOUNDARY_403', {
    patternCreateStatus: unauthorizedPattern.response.status,
    patternCreateBody: unauthorizedPattern.body,
    overrideCreateStatus: unauthorizedOverride.response.status,
    overrideCreateBody: unauthorizedOverride.body,
    patternEditStatus: unauthorizedPatternEdit.response.status,
    patternEditBody: unauthorizedPatternEdit.body,
    overrideEditStatus: unauthorizedOverrideEdit.response.status,
    overrideEditBody: unauthorizedOverrideEdit.body,
  });
}

async function main() {
  await cleanup();
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout?.on('data', (data) => process.stdout.write(data));
  child.stderr?.on('data', (data) => process.stderr.write(data));

  try {
    await waitForServer();
    await runEvidence();
    console.log('PHASE_B_AVAILABILITY_GENERATION_API_OK');
  } finally {
    child.kill();
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('PHASE_B_AVAILABILITY_GENERATION_API_FAILED', error);
  await db.$disconnect();
  process.exit(1);
});
