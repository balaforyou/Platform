import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient, BookingStatus } from '@badminton/database';

const db = new PrismaClient();
const baseUrl = 'http://localhost:3001';
const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg';

/**
 * Helper to wait for the local Fastify server to start listening.
 * WHY: The child process runs asynchronously, so we poll the /health route
 * until it responds before executing any HTTP requests.
 */
async function waitForServer(url: string, retries = 15): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch (e) {
      // Ignore connection errors and try again
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * Wipes the database tables to ensure each run is fully deterministic and independent.
 * WHY: We need a clean state for testing capacities, blocked windows, and sweeps.
 */
async function cleanDatabase() {
  await db.booking.deleteMany();
  await db.memberGroupAssignment.deleteMany();
  await db.subscription.deleteMany();
  await db.availabilityWindow.deleteMany();
  await db.resource.deleteMany();
  await db.blockedWindow.deleteMany();
  await db.bookingRule.deleteMany();
  await db.resourcePool.deleteMany();
  console.log('Database cleaned successfully.');
}

function nextAlignedHour(hoursFromNow: number): Date {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date;
}

function signJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function runTests() {
  console.log('Starting Phase 1 Concurrency & Business Logic Verification...');
  await cleanDatabase();

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const userId1 = '33333333-3333-3333-3333-333333333333';
  const userId2 = '44444444-4444-4444-4444-444444444444';

  // ==========================================
  // SETUP TEST DATA
  // ==========================================
  
  // 1. Create a FIXED_INSTANCE pool (e.g. Badminton Courts)
  const fixedPoolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: 'Badminton Court Pool',
      allocationMode: 'FIXED_INSTANCE',
    }),
  });
  const fixedPool = (await fixedPoolRes.json() as any).data;

  // Add rule with 30-minute grace period
  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  // Add a court resource
  const resourceRes = await fetch(`${baseUrl}/resource-pools/${fixedPool.id}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Court_1' }),
  });
  const resource = (await resourceRes.json() as any).data;

  // Add a bookable availability window starting 2 hours from now
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
  const window = (await windowRes.json() as any).data;

  // 2. Create a POOLED pool (e.g. Drivers/Cars)
  const pooledPoolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: 'Driver Pool',
      allocationMode: 'POOLED',
      capacity: 2,
    }),
  });
  const pooledPool = (await pooledPoolRes.json() as any).data;

  // Add a pooled window with capacity 2 starting 2 hours from now
  const pooledWindowRes = await fetch(`${baseUrl}/resource-pools/${pooledPool.id}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      capacity: 2,
    }),
  });
  const pooledWindow = (await pooledWindowRes.json() as any).data;

  console.log('Seeded database entries successfully. Beginning tests...');

  // ==========================================
  // TEST 0: ADMIN CONFIG ENDPOINTS & SCOPING
  // ==========================================
  console.log('\n--- Test 0: Admin Config Endpoints & Scoping ---');
  const ownerJwt = signJwt({ userId: 'owner-user', roles: ['owner'] });
  const branchManagerJwt = signJwt({ userId: 'manager-user', roles: [`branch_manager:${branchId}`] });
  const otherBranchManagerJwt = signJwt({ userId: 'other-manager', roles: ['branch_manager:other-branch'] });
  const adminPoolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: 'Admin Config Pool',
      allocationMode: 'POOLED',
      capacity: 3,
    }),
  });
  const adminPool = (await adminPoolRes.json() as any).data;

  const patchPoolRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
    body: JSON.stringify({
      capacity: 4,
      minOccupancy: 2,
      minBookingDurationMinutes: 60,
      pricingMode: 'PER_PERSON',
      defaultRate: 150,
    }),
  });
  if (patchPoolRes.status !== 200) {
    throw new Error(`Test 0 failed: Expected pool update 200, got ${patchPoolRes.status}`);
  }
  const updatedPool = (await patchPoolRes.json() as any).data;
  if (updatedPool.capacity !== 4 || updatedPool.minOccupancy !== 2 || updatedPool.pricingMode !== 'PER_PERSON') {
    throw new Error('Test 0 failed: Pool update did not persist expected fields.');
  }

  const immutableRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
    body: JSON.stringify({ branchId: 'forged-branch' }),
  });
  if (immutableRes.status !== 400) {
    throw new Error(`Test 0 failed: Expected immutable branchId update to return 400, got ${immutableRes.status}`);
  }

  const ruleRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}/booking-rule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({ lowOccupancyThresholdPct: 45, guestAccessCutoffMinutes: 90 }),
  });
  if (ruleRes.status !== 200) {
    throw new Error(`Test 0 failed: Expected rule upsert 200, got ${ruleRes.status}`);
  }
  const updatedRule = (await ruleRes.json() as any).data;
  if (updatedRule.lowOccupancyThresholdPct !== 45 || updatedRule.guestAccessCutoffMinutes !== 90) {
    throw new Error('Test 0 failed: Rule upsert did not persist expected fields.');
  }

  const assignmentRes = await fetch(`${baseUrl}/member-group-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${branchManagerJwt}` },
    body: JSON.stringify({
      userId: 'assigned-member',
      resourcePoolId: adminPool.id,
      daysOfWeek: '1,2,3',
      startTime: '10:00',
    }),
  });
  if (assignmentRes.status !== 201) {
    throw new Error(`Test 0 failed: Expected assignment create 201, got ${assignmentRes.status}`);
  }

  const listRes = await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${adminPool.id}`, {
    headers: { 'Authorization': `Bearer ${branchManagerJwt}` },
  });
  if (listRes.status !== 200) {
    throw new Error(`Test 0 failed: Expected scoped assignment list 200, got ${listRes.status}`);
  }
  const listedAssignments = (await listRes.json() as any).data;
  if (!Array.isArray(listedAssignments) || listedAssignments.length !== 1) {
    throw new Error('Test 0 failed: Expected scoped listing to return the created assignment.');
  }

  const forbiddenListRes = await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${adminPool.id}`, {
    headers: { 'Authorization': `Bearer ${otherBranchManagerJwt}` },
  });
  if (forbiddenListRes.status !== 403) {
    throw new Error(`Test 0 failed: Expected other branch manager listing to return 403, got ${forbiddenListRes.status}`);
  }

  const internalListRes = await fetch(`${baseUrl}/member-group-assignments`, {
    headers: { 'Authorization': `Bearer ${internalKey}` },
  });
  if (internalListRes.status !== 200) {
    throw new Error(`Test 0 failed: Expected internal assignment listing to still return 200, got ${internalListRes.status}`);
  }
  console.log('Test 0 passed successfully!');

  // ==========================================
  // TEST 1: CONCURRENT HOLDS ON SAME SLOT (FIXED_INSTANCE)
  // ==========================================
  console.log('\n--- Test 1: Concurrent Holds (FIXED_INSTANCE) ---');
  // WHY: We execute two concurrent HTTP requests at the same time to verify that only ONE
  // can hold the slot and return 201, while the other is rejected with a 409 Conflict code.
  const req1 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': 'fixed-key-req1' },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: fixedPool.id,
      resourceId: resource.id,
      windowId: window.id,
      userId: userId1,
    }),
  });

  const req2 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': 'fixed-key-req2' },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: fixedPool.id,
      resourceId: resource.id,
      windowId: window.id,
      userId: userId2,
    }),
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const data1 = await res1.json() as any;
  const data2 = await res2.json() as any;

  console.log(`Request 1 status: ${res1.status}, data:`, data1);
  console.log(`Request 2 status: ${res2.status}, data:`, data2);

  // Assert that one returned 201 and one returned 409
  const statuses = [res1.status, res2.status];
  if (!statuses.includes(201) || !statuses.includes(409)) {
    throw new Error('Test 1 failed: Expected exactly one 201 success and one 409 conflict.');
  }

  const errors = [data1.error?.code, data2.error?.code];
  if (!errors.includes('SLOT_ALREADY_BOOKED')) {
    throw new Error('Test 1 failed: Expected SLOT_ALREADY_BOOKED error code.');
  }
  console.log('Test 1 passed successfully!');

  // ==========================================
  // TEST 2: CONCURRENT HOLDS ON SAME SLOT (POOLED)
  // ==========================================
  console.log('\n--- Test 2: Concurrent Holds (POOLED) ---');
  // WHY: The pooled window has capacity = 2. We send 3 concurrent requests.
  // Exactly 2 must succeed (201) and the 3rd must fail with a 409 POOL_CAPACITY_EXCEEDED.
  const preq1 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': 'pooled-key-1' },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });

  const preq2 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': 'pooled-key-2' },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId2,
    }),
  });

  const preq3 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': 'pooled-key-3' },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });

  const [pres1, pres2, pres3] = await Promise.all([preq1, preq2, preq3]);
  const pdata1 = await pres1.json() as any;
  const pdata2 = await pres2.json() as any;
  const pdata3 = await pres3.json() as any;

  console.log(`Pooled Request 1 status: ${pres1.status}`);
  console.log(`Pooled Request 2 status: ${pres2.status}`);
  console.log(`Pooled Request 3 status: ${pres3.status}`);

  const pStatuses = [pres1.status, pres2.status, pres3.status];
  const successesCount = pStatuses.filter(s => s === 201).length;
  const conflictsCount = pStatuses.filter(s => s === 409).length;

  if (successesCount !== 2 || conflictsCount !== 1) {
    throw new Error(`Test 2 failed: Expected 2 successes and 1 conflict, got ${successesCount} and ${conflictsCount}`);
  }

  const pErrors = [pdata1.error?.code, pdata2.error?.code, pdata3.error?.code];
  if (!pErrors.includes('POOL_CAPACITY_EXCEEDED')) {
    throw new Error('Test 2 failed: Expected POOL_CAPACITY_EXCEEDED error code.');
  }
  console.log('Test 2 passed successfully!');

  // ==========================================
  // TEST 3: IDEMPOTENCY KEY RETRY
  // ==========================================
  console.log('\n--- Test 3: Idempotency Key Retry ---');
  // Clear any existing bookings to reset pool/window capacities.
  await db.booking.deleteMany();
  // WHY: If a request is retried with the exact same Idempotency-Key, it should return the original
  // response with a 200 OK status code, rather than creating a new booking row.
  const idemKey = 'idempotency-test-key-t3';
  const holdRes1 = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': idemKey },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });
  
  if (holdRes1.status !== 201) {
    throw new Error(`Test 3 failed: Expected first hold to return 201, got ${holdRes1.status}`);
  }
  const holdData1 = (await holdRes1.json() as any).data;

  const holdRes2 = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': idemKey },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });

  if (holdRes2.status !== 200) {
    throw new Error(`Test 3 failed: Expected retried hold to return 200 OK, got ${holdRes2.status}`);
  }
  const holdData2 = (await holdRes2.json() as any).data;

  if (holdData1.id !== holdData2.id) {
    throw new Error('Test 3 failed: Expected retried request to return identical booking record.');
  }
  console.log('Test 3 passed successfully!');

  // ==========================================
  // TEST 4: IDEMPOTENCY KEY CONCURRENT RACE CASE
  // ==========================================
  console.log('\n--- Test 4: Idempotency Key Concurrent Race Case ---');
  // Clear any existing bookings to reset pool/window capacities.
  await db.booking.deleteMany();
  // WHY: If two identical requests with the same Idempotency-Key are sent concurrently, the first
  // will write to the DB, and the second will hit a DB unique constraint violation.
  // We want to verify that the server catches this and gracefully returns the created booking (200 OK)
  // rather than failing with a raw 500 error.
  const raceKey = 'idempotency-race-key-t4';
  
  const raceReq1 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': raceKey },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });

  const raceReq2 = fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': raceKey },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
    }),
  });

  const [raceRes1, raceRes2] = await Promise.all([raceReq1, raceReq2]);
  const raceData1 = await raceRes1.json() as any;
  const raceData2 = await raceRes2.json() as any;

  console.log(`Race Request 1 status: ${raceRes1.status}`);
  console.log(`Race Request 2 status: ${raceRes2.status}`);

  const raceStatuses = [raceRes1.status, raceRes2.status];
  if (!raceStatuses.includes(201) || !raceStatuses.includes(200)) {
    throw new Error('Test 4 failed: Expected exactly one 201 (created) and one 200 (duplicate hit) response.');
  }
  
  const raceBookingId1 = raceData1.data ? raceData1.data.id : raceData1.id; // handle envelopes
  const raceBookingId2 = raceData2.data ? raceData2.data.id : raceData2.id;
  if (raceBookingId1 !== raceBookingId2) {
    throw new Error('Test 4 failed: Expected concurrent requests to resolve to the same booking ID.');
  }
  console.log('Test 4 passed successfully!');

  // ==========================================
  // TEST 5: HELD-BOOKING EXPIRY SWEEP
  // ==========================================
  console.log('\n--- Test 5: Held-Booking Expiry Sweep ---');
  // Clear any existing bookings to reset pool/window capacities.
  await db.booking.deleteMany();
  // WHY: A held booking should automatically be released and set to RELEASED_NO_SHOW
  // during the background sweep if its heldUntil TTL has expired.
  
  // Directly create an expired held booking in the database
  const expiredHold = await db.booking.create({
    data: {
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: pooledWindow.id,
      userId: userId1,
      status: BookingStatus.HELD,
      heldAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      heldUntil: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      idempotencyKey: 'expired-hold-key',
    },
  });

  console.log(`Expired HELD booking created with ID: ${expiredHold.id}`);

  // Run the sweep
  const sweepRes = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST' });
  const sweepData = (await sweepRes.json() as any).data;
  console.log('Sweep result:', sweepData);

  if (sweepData.expiredHoldsCount === 0) {
    throw new Error('Test 5 failed: Expected at least 1 expired hold to be swept.');
  }

  const updatedHold = await db.booking.findUnique({ where: { id: expiredHold.id } });
  if (updatedHold?.status !== BookingStatus.RELEASED_NO_SHOW) {
    throw new Error(`Test 5 failed: Expected status to be RELEASED_NO_SHOW, got ${updatedHold?.status}`);
  }
  console.log('Test 5 passed successfully!');

  // ==========================================
  // TEST 6: MEMBER AUTO-RELEASE SWEEP VS GUEST PRESERVE
  // ==========================================
  console.log('\n--- Test 6: Member Auto-Release Sweep ---');
  // Clear any existing bookings to reset pool/window capacities.
  await db.booking.deleteMany();
  // WHY:
  // - A member booking (isMemberBooking = true, status = CONFIRMED) must be auto-released if
  //   it's within gracePeriodMinutes (default 30) before the slot start time.
  // - A guest booking (isMemberBooking = false, status = CONFIRMED) starting at the same time
  //   must NOT be auto-released (guests paid and should not lose their slot).

  // Create a pool and window starting 15 minutes from now.
  const windowStartT6 = new Date(Date.now() + 15 * 60 * 1000);
  const windowEndT6 = new Date(windowStartT6.getTime() + 1 * 60 * 60 * 1000);

  const windowT6 = await db.availabilityWindow.create({
    data: {
      resourcePoolId: pooledPool.id,
      startTime: windowStartT6,
      endTime: windowEndT6,
      capacity: 5,
    },
  });

  // Create confirmed member booking
  const memberBooking = await db.booking.create({
    data: {
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: windowT6.id,
      userId: userId1,
      status: BookingStatus.CONFIRMED,
      isMemberBooking: true,
      heldUntil: new Date(),
      idempotencyKey: 'member-booking-t6',
    },
  });

  // Create attendance-confirmed member booking; the sweep must not undo this.
  const attendanceConfirmedMember = await db.booking.create({
    data: {
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: windowT6.id,
      userId: 'member-attendance-confirmed-t6',
      status: BookingStatus.CONFIRMED,
      isMemberBooking: true,
      memberAttendanceConfirmedAt: new Date(),
      heldUntil: new Date(),
      idempotencyKey: 'member-booking-confirmed-t6',
    },
  });

  // Create confirmed guest booking
  const guestBooking = await db.booking.create({
    data: {
      tenantId,
      branchId,
      resourcePoolId: pooledPool.id,
      windowId: windowT6.id,
      userId: userId2,
      status: BookingStatus.CONFIRMED,
      isMemberBooking: false,
      heldUntil: new Date(),
      idempotencyKey: 'guest-booking-t6',
    },
  });

  console.log(`Created member booking: ${memberBooking.id} and guest booking: ${guestBooking.id}`);

  // Run the sweep
  const sweepRes2 = await fetch(`${baseUrl}/bookings/sweep`, { method: 'POST' });
  const sweepData2 = (await sweepRes2.json() as any).data;
  console.log('Sweep 2 result:', sweepData2);

  // Retrieve updated bookings from DB
  const updatedMember = await db.booking.findUnique({ where: { id: memberBooking.id } });
  const updatedAttendanceConfirmedMember = await db.booking.findUnique({ where: { id: attendanceConfirmedMember.id } });
  const updatedGuest = await db.booking.findUnique({ where: { id: guestBooking.id } });

  if (updatedMember?.status !== BookingStatus.RELEASED_NO_SHOW) {
    throw new Error(`Test 6 failed: Expected member booking to be RELEASED_NO_SHOW, got ${updatedMember?.status}`);
  }

  if (updatedGuest?.status !== BookingStatus.CONFIRMED) {
    throw new Error(`Test 6 failed: Expected guest booking to remain CONFIRMED, got ${updatedGuest?.status}`);
  }

  if (updatedAttendanceConfirmedMember?.status !== BookingStatus.CONFIRMED) {
    throw new Error(`Test 6 failed: Expected attendance-confirmed member booking to remain CONFIRMED, got ${updatedAttendanceConfirmedMember?.status}`);
  }

  console.log('Test 6 passed successfully!');

  // ==========================================
  // TEST 7: Member self-confirm attendance uses JWT identity and one atomic booking path
  // ==========================================
  console.log('\nTest 7: Member self-confirm attendance states, trust boundary, and concurrency...');

  const memberTenant = tenantId;
  const memberPool = await db.resourcePool.create({
    data: {
      tenantId: memberTenant,
      branchId,
      name: 'Member Self Confirm Pool',
      allocationMode: 'POOLED',
      capacity: 8,
      minOccupancy: 2,
      minBookingDurationMinutes: 60,
      pricingMode: 'FLAT',
      defaultRate: 0,
    },
  });
  await db.bookingRule.create({
    data: {
      resourcePoolId: memberPool.id,
      gracePeriodMinutes: 30,
      guestAccessCutoffMinutes: 120,
      cancellationPolicyJson: { type: 'tiered', tiers: [] },
    },
  });

  const futureWindowStart = nextAlignedHour(4);
  const futureWindowEnd = new Date(futureWindowStart.getTime() + 60 * 60 * 1000);
  const assignmentStartTime = futureWindowStart.toISOString().slice(11, 16);
  const todayIsoWeekday = String(new Date().getDay() === 0 ? 7 : new Date().getDay());
  const notTodayIsoWeekday = todayIsoWeekday === '1' ? '2' : '1';

  const selfConfirmWindow = await db.availabilityWindow.create({
    data: {
      resourcePoolId: memberPool.id,
      startTime: futureWindowStart,
      endTime: futureWindowEnd,
      capacity: 8,
    },
  });

  const memberSelfUserId = 'member-self-confirm-001';
  const otherMemberUserId = 'member-self-confirm-other';
  await db.subscription.create({
    data: {
      userId: memberSelfUserId,
      tenantId: memberTenant,
      mandateId: 'mandate-member-self-confirm-001',
      amount: 100000,
      frequency: 'monthly',
      status: 'active',
    },
  });
  await db.memberGroupAssignment.create({
    data: {
      userId: memberSelfUserId,
      resourcePoolId: memberPool.id,
      daysOfWeek: todayIsoWeekday,
      startTime: assignmentStartTime,
      status: 'ACTIVE',
    },
  });
  await db.memberGroupAssignment.create({
    data: {
      userId: otherMemberUserId,
      resourcePoolId: memberPool.id,
      daysOfWeek: notTodayIsoWeekday,
      startTime: assignmentStartTime,
      status: 'SUSPENDED',
    },
  });

  const memberToken = signJwt({ userId: memberSelfUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
  const guestToken = signJwt({ userId: 'guest-self-confirm-001', tenantId: memberTenant, userType: 'GUEST', roles: [] });
  const memberHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` };

  const todayRes = await fetch(`${baseUrl}/member/today-assignment`, { headers: memberHeaders });
  const todayBody = (await todayRes.json() as any).data;
  console.log('MEMBER_CONFIRM_EVIDENCE today_success', JSON.stringify({ status: todayRes.status, body: todayBody }));
  if (todayRes.status !== 200 || todayBody.state !== 'HAS_SESSION' || !todayBody.canConfirm) {
    throw new Error(`Test 7 failed: Expected HAS_SESSION/canConfirm, got ${todayRes.status} ${JSON.stringify(todayBody)}`);
  }

  const guestConfirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
    body: JSON.stringify({}),
  });
  console.log('MEMBER_CONFIRM_EVIDENCE non_member_rejection', JSON.stringify({ status: guestConfirmRes.status, body: await guestConfirmRes.json() }));
  if (guestConfirmRes.status !== 403) {
    throw new Error(`Test 7 failed: Expected guest confirm rejection 403, got ${guestConfirmRes.status}`);
  }

  const confirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
    method: 'POST',
    headers: memberHeaders,
    body: JSON.stringify({ userId: otherMemberUserId }),
  });
  const confirmBody = (await confirmRes.json() as any).data;
  console.log('MEMBER_CONFIRM_EVIDENCE authorized_success_spoof_ignored', JSON.stringify({ status: confirmRes.status, body: confirmBody }));
  if (confirmRes.status !== 201 || confirmBody.userId !== memberSelfUserId || confirmBody.userId === otherMemberUserId || !confirmBody.memberAttendanceConfirmedAt) {
    throw new Error('Test 7 failed: Confirm did not derive identity from JWT or did not stamp attendance confirmation.');
  }
  const confirmedCount = await db.booking.count({
    where: { userId: memberSelfUserId, windowId: selfConfirmWindow.id, status: { not: BookingStatus.CANCELLED } },
  });
  if (confirmedCount !== 1) throw new Error(`Test 7 failed: Expected one confirmed member booking, got ${confirmedCount}`);

  const noSessionUserId = 'member-self-confirm-no-session';
  await db.subscription.create({
    data: {
      userId: noSessionUserId,
      tenantId: memberTenant,
      mandateId: 'mandate-member-no-session',
      amount: 100000,
      frequency: 'monthly',
      status: 'active',
    },
  });
  await db.memberGroupAssignment.create({
    data: {
      userId: noSessionUserId,
      resourcePoolId: memberPool.id,
      daysOfWeek: notTodayIsoWeekday,
      startTime: assignmentStartTime,
      status: 'ACTIVE',
    },
  });
  const noSessionToken = signJwt({ userId: noSessionUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
  const noSessionRes = await fetch(`${baseUrl}/member/today-assignment`, {
    headers: { Authorization: `Bearer ${noSessionToken}` },
  });
  console.log('MEMBER_CONFIRM_EVIDENCE no_session_today', JSON.stringify({ status: noSessionRes.status, body: await noSessionRes.json() }));

  const inactiveUserId = 'member-self-confirm-inactive';
  await db.memberGroupAssignment.create({
    data: {
      userId: inactiveUserId,
      resourcePoolId: memberPool.id,
      daysOfWeek: todayIsoWeekday,
      startTime: assignmentStartTime,
      status: 'ACTIVE',
    },
  });
  await db.subscription.create({
    data: {
      userId: inactiveUserId,
      tenantId: memberTenant,
      mandateId: 'mandate-member-inactive',
      amount: 100000,
      frequency: 'monthly',
      status: 'suspended',
    },
  });
  const inactiveToken = signJwt({ userId: inactiveUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
  const inactiveRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${inactiveToken}` },
  });
  console.log('MEMBER_CONFIRM_EVIDENCE subscription_inactive', JSON.stringify({ status: inactiveRes.status, body: await inactiveRes.json() }));
  if (inactiveRes.status !== 409) throw new Error(`Test 7 failed: Expected inactive subscription 409, got ${inactiveRes.status}`);

  const cutoffUserId = 'member-self-confirm-cutoff';
  const soonWindowStart = nextAlignedHour(1);
  const soonWindowEnd = new Date(soonWindowStart.getTime() + 60 * 60 * 1000);
  const cutoffPool = await db.resourcePool.create({
    data: {
      tenantId: memberTenant,
      branchId,
      name: 'Member Cutoff Pool',
      allocationMode: 'POOLED',
      capacity: 8,
      minOccupancy: 2,
      minBookingDurationMinutes: 60,
      pricingMode: 'FLAT',
      defaultRate: 0,
    },
  });
  await db.bookingRule.create({
    data: {
      resourcePoolId: cutoffPool.id,
      gracePeriodMinutes: 120,
      guestAccessCutoffMinutes: 120,
      cancellationPolicyJson: { type: 'tiered', tiers: [] },
    },
  });
  await db.availabilityWindow.create({
    data: {
      resourcePoolId: cutoffPool.id,
      startTime: soonWindowStart,
      endTime: soonWindowEnd,
      capacity: 8,
    },
  });
  await db.subscription.create({
    data: {
      userId: cutoffUserId,
      tenantId: memberTenant,
      mandateId: 'mandate-member-cutoff',
      amount: 100000,
      frequency: 'monthly',
      status: 'active',
    },
  });
  await db.memberGroupAssignment.create({
    data: {
      userId: cutoffUserId,
      resourcePoolId: cutoffPool.id,
      daysOfWeek: todayIsoWeekday,
      startTime: soonWindowStart.toISOString().slice(11, 16),
      status: 'ACTIVE',
    },
  });
  const cutoffToken = signJwt({ userId: cutoffUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
  const cutoffRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cutoffToken}` },
  });
  console.log('MEMBER_CONFIRM_EVIDENCE cutoff_passed', JSON.stringify({ status: cutoffRes.status, body: await cutoffRes.json() }));
  if (cutoffRes.status !== 409) throw new Error(`Test 7 failed: Expected cutoff passed 409, got ${cutoffRes.status}`);

  const raceUserId = 'member-self-confirm-race';
  await db.subscription.create({
    data: {
      userId: raceUserId,
      tenantId: memberTenant,
      mandateId: 'mandate-member-race',
      amount: 100000,
      frequency: 'monthly',
      status: 'active',
    },
  });
  await db.memberGroupAssignment.create({
    data: {
      userId: raceUserId,
      resourcePoolId: memberPool.id,
      daysOfWeek: todayIsoWeekday,
      startTime: assignmentStartTime,
      status: 'ACTIVE',
    },
  });
  const raceToken = signJwt({ userId: raceUserId, tenantId: memberTenant, userType: 'MEMBER', roles: [] });
  const raceHeaders = { Authorization: `Bearer ${raceToken}` };
  const [memberRaceRes1, memberRaceRes2] = await Promise.all([
    fetch(`${baseUrl}/member/today-assignment/confirm`, { method: 'POST', headers: raceHeaders }),
    fetch(`${baseUrl}/member/today-assignment/confirm`, { method: 'POST', headers: raceHeaders }),
  ]);
  const memberRaceBody1 = (await memberRaceRes1.json() as any).data;
  const memberRaceBody2 = (await memberRaceRes2.json() as any).data;
  const raceCount = await db.booking.count({
    where: { userId: raceUserId, windowId: selfConfirmWindow.id, status: { not: BookingStatus.CANCELLED } },
  });
  console.log('MEMBER_CONFIRM_EVIDENCE concurrent_double_confirm', JSON.stringify({
    statuses: [memberRaceRes1.status, memberRaceRes2.status],
    bookingIds: [memberRaceBody1?.id, memberRaceBody2?.id],
    raceCount,
  }));
  if (raceCount !== 1 || memberRaceBody1?.id !== memberRaceBody2?.id) {
    throw new Error('Test 7 failed: Concurrent confirm did not resolve to one booking.');
  }

  console.log('Test 7 passed successfully!');

  console.log('\nAll Phase 1 Concurrency & Business Logic Tests Passed Successfully!');
}

// WHY: Entry point of the test runner. It spawns the server in a child process,
// waits for it to become healthy, executes all assertions, and shuts down clean.
async function main() {
  console.log('Starting local Slot Engine server...');
  const serverProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  // Register clean shutdown on exit
  const exitHandler = (code: number) => {
    console.log('Shutting down local Slot Engine server...');
    serverProcess.kill();
    process.exit(code);
  };

  try {
    const ready = await waitForServer(baseUrl);
    if (!ready) {
      console.error('Local server failed to start within the timeout.');
      exitHandler(1);
    }
    console.log('Local server is healthy. Running tests...');
    await runTests();
    exitHandler(0);
  } catch (err) {
    console.error('Verification tests failed with error:', err);
    exitHandler(1);
  }
}

main();
