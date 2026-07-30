import { spawn } from 'child_process';
import path from 'path';
import { PrismaClient } from '@badminton/database';

const db = new PrismaClient();
const identityUrl = 'http://localhost:3002';
const slotEngineUrl = 'http://localhost:3001';
const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

/**
 * Helper to wait for a service to start listening.
 */
async function waitForService(url: string, retries = 15): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch (e) {
      // Ignore connection failures during boot
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * Wipes the database tables to ensure clean test runs.
 */
async function cleanDatabase() {
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

async function runTests() {
  console.log('Starting Phase 2 Identity & Auth Integration Tests...');
  await cleanDatabase();

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const phone = '9999999999';

  // Seed Slot Engine Pool & Window for resolve-invites check
  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: 'Badminton Pool',
      allocationMode: 'POOLED',
      capacity: 5,
    }),
  });
  const pool = (await poolRes.json() as any).data;

  const windowRes = await fetch(`${slotEngineUrl}/resource-pools/${pool.id}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      capacity: 5,
    }),
  });
  const window = (await windowRes.json() as any).data;

  // Create an invited booking (phone added to coPlayers list)
  const bookingRes = await fetch(`${slotEngineUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': 'invite-booking-key-t3',
    },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pool.id,
      windowId: window.id,
      userId: 'booker-user-id',
      coPlayers: [phone],
    }),
  });
  const booking = (await bookingRes.json() as any).data;
  console.log(`Seeded group booking: ${booking.id} with invited co-player phone: ${phone}`);

  // Create Pending Invite in Identity service
  await fetch(`${identityUrl}/users/resolve-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, phone }),
  });

  // ==========================================
  // TEST 1: OTP REQUEST ABUSE PREVENTION (429 COOLDOWN & RATE-LIMITS)
  // ==========================================
  console.log('\n--- Test 1: OTP Rate-Limiting & Cooldown ---');
  // First OTP request
  const otpRes1 = await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });
  if (otpRes1.status !== 200) {
    throw new Error(`Test 1 failed: Expected first OTP request to return 200, got ${otpRes1.status}`);
  }

  // Second request within 60s (should trigger cooldown 429)
  const otpRes2 = await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });
  if (otpRes2.status !== 429) {
    throw new Error(`Test 1 failed: Expected second sequential OTP request to trigger 429 Cooldown, got ${otpRes2.status}`);
  }
  const otpData2 = await otpRes2.json() as any;
  if (otpData2.error?.code !== 'COOLDOWN_ACTIVE') {
    throw new Error(`Test 1 failed: Expected error code COOLDOWN_ACTIVE, got ${otpData2.error?.code}`);
  }
  console.log('Cooldown 429 triggered correctly.');

  // Shift OTP requests timestamps back in DB to bypass cooldown and test rate limits
  await db.otpRequest.updateMany({
    where: { phone },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) }, // 2 minutes ago
  });

  // Second valid OTP request (shifted)
  await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });

  // Shift again
  await db.otpRequest.updateMany({
    where: { phone },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
  });

  // Third valid OTP request
  await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });

  // Shift again
  await db.otpRequest.updateMany({
    where: { phone },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
  });

  // Fourth request within 10 minutes (should trigger rate limit 429)
  const otpRes4 = await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });
  if (otpRes4.status !== 429) {
    throw new Error(`Test 1 failed: Expected 4th request to trigger 429 Rate Limit, got ${otpRes4.status}`);
  }
  const otpData4 = await otpRes4.json() as any;
  if (otpData4.error?.code !== 'RATE_LIMIT_EXCEEDED') {
    throw new Error(`Test 1 failed: Expected error code RATE_LIMIT_EXCEEDED, got ${otpData4.error?.code}`);
  }
  console.log('Rate limit 429 triggered correctly.');
  console.log('Test 1 passed successfully!');

  // ==========================================
  // TEST 2: OTP VERIFICATION ATTEMPTS AND USER CREATION
  // ==========================================
  console.log('\n--- Test 2: OTP Verification & Registration ---');
  // Reset requests in DB to allow fresh request
  await db.otpRequest.deleteMany();
  await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });

  // Verify with wrong code
  const verifyResWrong = await fetch(`${identityUrl}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId, code: '000000' }),
  });
  if (verifyResWrong.status !== 400) {
    throw new Error(`Test 2 failed: Expected wrong code to return 400, got ${verifyResWrong.status}`);
  }

  // Verify with correct code
  const verifyRes = await fetch(`${identityUrl}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId, code: '123456' }),
  });
  if (verifyRes.status !== 201) {
    throw new Error(`Test 2 failed: Expected OTP verification to return 201, got ${verifyRes.status}`);
  }
  
  const verifyBody = await verifyRes.json() as any;
  const accessToken = verifyBody.data.accessToken;
  const user = verifyBody.data.user;
  const cookieHeader = verifyRes.headers.get('set-cookie');

  if (!accessToken || !cookieHeader || !cookieHeader.includes('refresh_token')) {
    throw new Error('Test 2 failed: Missing JWT access token or refresh cookie in response.');
  }

  // Assert userType is GUEST by default
  if (user.userType !== 'GUEST') {
    throw new Error(`Test 2 failed: Expected userType to default to GUEST, got ${user.userType}`);
  }
  console.log('User registered successfully in GUEST mode with valid JWT & Cookies.');
  console.log('Test 2 passed successfully!');

  // ==========================================
  // TEST 3: INVITE RESOLUTION & LINKING HISTORY (AND 401 AUTH GATE)
  // ==========================================
  console.log('\n--- Test 3: Invite Resolution & Booking Linking ---');
  // Verify PendingInvite was deleted
  const invite = await db.pendingInvite.findUnique({
    where: { phone_tenantId: { phone, tenantId } },
  });
  if (invite) {
    throw new Error('Test 3 failed: Expected PendingInvite to be deleted upon registration.');
  }

  // Verify Slot Engine resolved the co-player booking
  const dbPlayer = await db.bookingPlayer.findFirst({
    where: { phone, bookingId: booking.id },
  });
  if (dbPlayer?.userId !== user.id) {
    throw new Error(`Test 3 failed: Expected BookingPlayer.userId to be linked to ${user.id}, got ${dbPlayer?.userId}`);
  }
  console.log('Co-player booking history resolved and linked successfully in Slot Engine.');

  // Assert unauthenticated calls to resolve-invites get rejected with 401
  const resolveUnauth = await fetch(`${slotEngineUrl}/bookings/resolve-invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, userId: user.id }),
  });
  if (resolveUnauth.status !== 401) {
    throw new Error(`Test 3 failed: Expected resolve-invites without key to return 401, got ${resolveUnauth.status}`);
  }
  console.log('Internal service endpoint resolve-invites rejected 401 unauthenticated requests correctly.');
  console.log('Test 3 passed successfully!');

  // ==========================================
  // TEST 4: JWT REFRESH TOKEN ROTATION
  // ==========================================
  console.log('\n--- Test 4: Token Refresh Cookie & Rotation ---');
  // Extract refresh token from cookie header
  const refreshToken = cookieHeader.split(';')[0].split('=')[1];

  const refreshRes = await fetch(`${identityUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Cookie': `refresh_token=${refreshToken}` },
  });

  if (refreshRes.status !== 200) {
    throw new Error(`Test 4 failed: Expected refresh to return 200, got ${refreshRes.status}`);
  }

  const refreshBody = await refreshRes.json() as any;
  const newAccessToken = refreshBody.data.accessToken;
  const newCookieHeader = refreshRes.headers.get('set-cookie');

  if (!newAccessToken || !newCookieHeader) {
    throw new Error('Test 4 failed: Missing new access token or cookie.');
  }

  const newRefreshToken = newCookieHeader.split(';')[0].split('=')[1];
  if (refreshToken === newRefreshToken) {
    throw new Error('Test 4 failed: Expected refresh token rotation to update token value.');
  }

  // Verify old token is no longer valid
  const refreshResOld = await fetch(`${identityUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Cookie': `refresh_token=${refreshToken}` },
  });
  if (refreshResOld.status !== 401) {
    throw new Error(`Test 4 failed: Expected old refresh token to return 401, got ${refreshResOld.status}`);
  }
  console.log('Refresh token rotation completed and old token invalidated successfully.');
  console.log('Test 4 passed successfully!');

  // ==========================================
  // TEST 5: GOOGLE SIGNUP GATING & MEMBER HAPPY PATH
  // ==========================================
  console.log('\n--- Test 5: Google Signup Gating & Login Restrictions ---');
  // Brand new Google signup (email not in DB)
  const googleResNew = await fetch(`${identityUrl}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleIdToken: 'mock-google-token-newuser@example.com',
      tenantId,
    }),
  });
  if (googleResNew.status !== 400) {
    throw new Error(`Test 5 failed: Expected new Google signup to request phone verification, got ${googleResNew.status}`);
  }
  const googleDataNew = await googleResNew.json() as any;
  if (googleDataNew.error?.code !== 'PHONE_VERIFICATION_REQUIRED') {
    throw new Error(`Test 5 failed: Expected PHONE_VERIFICATION_REQUIRED code, got ${googleDataNew.error?.code}`);
  }
  console.log('New Google OAuth signup properly gated to phone verification flow.');

  // Guest OAuth Login attempt (should return 403 Forbidden)
  await fetch(`${identityUrl}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleIdToken: `mock-google-token-${phone}@example.com`, // matches email linked to phone in verify
      tenantId,
    }),
  });
  
  // Link guest to email
  await db.user.update({
    where: { id: user.id },
    data: { email: `email-${phone}@example.com`, googleId: `google-id-email-${phone}@example.com` },
  });

  const googleResGuestLinked = await fetch(`${identityUrl}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleIdToken: `mock-google-token-email-${phone}@example.com`,
      tenantId,
    }),
  });
  if (googleResGuestLinked.status !== 403) {
    throw new Error(`Test 5 failed: Expected guest Google login to return 403, got ${googleResGuestLinked.status}`);
  }
  console.log('Guest Google login blocked with 403 Forbidden correctly.');

  // Promote GUEST user to MEMBER via internal PATCH endpoint (requires auth check)
  const patchUnauth = await fetch(`${identityUrl}/users/${user.id}/type`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userType: 'MEMBER' }),
  });
  if (patchUnauth.status !== 401) {
    throw new Error(`Test 5 failed: Expected patch without internal key to return 401, got ${patchUnauth.status}`);
  }

  const patchRes = await fetch(`${identityUrl}/users/${user.id}/type`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ userType: 'MEMBER' }),
  });
  if (patchRes.status !== 200) {
    throw new Error(`Test 5 failed: Expected userType promotion to return 200, got ${patchRes.status}`);
  }
  console.log('User promoted to MEMBER securely using INTERNAL_SERVICE_KEY.');

  // Member Google Login (Happy Path)
  const googleResMember = await fetch(`${identityUrl}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleIdToken: `mock-google-token-email-${phone}@example.com`,
      tenantId,
    }),
  });
  if (googleResMember.status !== 200) {
    throw new Error(`Test 5 failed: Expected member Google login to return 200, got ${googleResMember.status}`);
  }
  console.log('Member Google login authenticated successfully (Happy Path).');
  console.log('Test 5 passed successfully!');

  console.log('\nAll Phase 2 Identity & Auth Tests Passed Successfully!');
}

async function main() {
  console.log('Starting local Identity & Auth and Slot Engine servers...');
  
  const slotProcess = spawn('node', [path.join(__dirname, '../../slot-engine/dist/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  const authProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3002', INTERNAL_SERVICE_KEY: internalKey },
  });

  const exitHandler = (code: number) => {
    console.log('Shutting down local servers...');
    slotProcess.kill();
    authProcess.kill();
    process.exit(code);
  };

  try {
    const ready1 = await waitForService(slotEngineUrl);
    const ready2 = await waitForService(identityUrl);
    if (!ready1 || !ready2) {
      console.error('Servers failed to boot within timeout.');
      exitHandler(1);
    }
    console.log('Local servers are ready. Executing integration tests...');
    await runTests();
    exitHandler(0);
  } catch (e) {
    console.error('Verification tests failed with error:', e);
    exitHandler(1);
  }
}

main();
