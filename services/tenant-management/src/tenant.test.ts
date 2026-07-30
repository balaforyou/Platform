import { spawn } from 'child_process';
import path from 'path';
import { PrismaClient } from '@badminton/database';

const db = new PrismaClient();
const identityUrl = 'http://localhost:3002';
const slotEngineUrl = 'http://localhost:3001';
const tenantUrl = 'http://localhost:3003';
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
 * Helper to decode JWT payloads without third-party libraries.
 */
function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payloadB64 = parts[1];
  const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf8');
  return JSON.parse(payloadStr);
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
  await db.roleAssignment.deleteMany();
  await db.branch.deleteMany();
  await db.tenant.deleteMany();
  await db.user.deleteMany();
  console.log('Database cleaned successfully.');
}

async function runTests() {
  console.log('Starting Phase 3 Tenant Management Integration Tests...');
  await cleanDatabase();

  // Seed Tenant via Platform endpoint (requires INTERNAL_SERVICE_KEY)
  const tenantRes = await fetch(`${tenantUrl}/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
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
  const tenant = (await tenantRes.json() as any).data;
  console.log(`Seeded tenant: ${tenant.name} (${tenant.id})`);

  // ==========================================
  // TEST 1: DRAFT-TO-ACTIVE BRANCH SELECTOR GATE
  // ==========================================
  console.log('\n--- Test 1: Draft-to-Active Branch Gate ---');
  // Create a branch (defaults to DRAFT)
  const branchRes1 = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ name: 'Branch A', address: '123 Main St' }),
  });
  const branchA = (await branchRes1.json() as any).data;
  console.log(`Branch created (status defaults to DRAFT): ${branchA.name} (${branchA.id})`);

  // Guest list branches query (should exclude DRAFT branch)
  const branchesGuest = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches`);
  const branchesGuestList = (await branchesGuest.json() as any).data;
  if (branchesGuestList.length !== 0) {
    throw new Error(`Test 1 failed: Expected draft branch to be excluded from guest query, got count ${branchesGuestList.length}`);
  }

  // Guest list branches query with includeDraft=true but no auth (should still exclude DRAFT branch)
  const branchesGuestDraft = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches?includeDraft=true`);
  const branchesGuestDraftList = (await branchesGuestDraft.json() as any).data;
  if (branchesGuestDraftList.length !== 0) {
    throw new Error('Test 1 failed: Guest query was able to view draft branches without authorization.');
  }
  console.log('Draft branch successfully hidden from guest picker.');

  // Activate the branch
  const patchBranchRes = await fetch(`${tenantUrl}/branches/${branchA.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  if (patchBranchRes.status !== 200) {
    throw new Error(`Test 1 failed: Could not activate branch, got status ${patchBranchRes.status}`);
  }
  console.log('Branch status flipped to ACTIVE.');

  // Guest list branches query (should now include branch)
  const branchesGuestActive = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches`);
  const branchesGuestActiveList = (await branchesGuestActive.json() as any).data;
  if (branchesGuestActiveList.length !== 1 || branchesGuestActiveList[0].id !== branchA.id) {
    throw new Error('Test 1 failed: Active branch not returned in guest query.');
  }
  console.log('Active branch successfully visible to guest picker.');
  console.log('Test 1 passed successfully!');

  // ==========================================
  // TEST 2: ROLE SCOPING SECURITY ENFORCEMENT
  // ==========================================
  console.log('\n--- Test 2: Role Scoping & Owner Access ---');
  // Create Branch B
  const branchRes2 = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ name: 'Branch B' }),
  });
  const branchB = (await branchRes2.json() as any).data;

  // Assign user "manager-1" to Branch A as BRANCH_MANAGER
  await fetch(`${tenantUrl}/tenants/${tenant.id}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ userId: 'manager-1', role: 'BRANCH_MANAGER', branchId: branchA.id }),
  });

  // Verify access checks
  const checkARes = await fetch(`${tenantUrl}/users/manager-1/branches/${branchA.id}/check`);
  const checkA = (await checkARes.json() as any).data;
  if (checkA.hasAccess !== true) {
    throw new Error('Test 2 failed: Expected manager to have access to Branch A.');
  }

  const checkBRes = await fetch(`${tenantUrl}/users/manager-1/branches/${branchB.id}/check`);
  const checkB = (await checkBRes.json() as any).data;
  if (checkB.hasAccess !== false) {
    throw new Error('Test 2 failed: Scoping bypass! Scoped manager was granted access to Branch B.');
  }
  console.log('Role scoping restrictions successfully enforced (Access A: allowed, Access B: denied).');

  // Assign user "owner-1" as OWNER
  await fetch(`${tenantUrl}/tenants/${tenant.id}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ userId: 'owner-1', role: 'OWNER', branchId: null }),
  });

  // Verify owner access check on Branch B (should return true due to null branchId bypass)
  const checkOwnerRes = await fetch(`${tenantUrl}/users/owner-1/branches/${branchB.id}/check`);
  const checkOwner = (await checkOwnerRes.json() as any).data;
  if (checkOwner.hasAccess !== true) {
    throw new Error('Test 2 failed: Expected OWNER (null branchId) to access Branch B.');
  }
  console.log('Owner null-branchId bypass successfully verified (Access granted to all branches).');
  console.log('Test 2 passed successfully!');

  // ==========================================
  // TEST 3: END-TO-END JWT ROLE EMBEDDING & BOOTSTRAPPING
  // ==========================================
  console.log('\n--- Test 3: E2E JWT Role Embedding & Bootstrapping ---');
  const userPhone = '8888888888';

  // Step 1: Request OTP from Identity & Auth
  await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userPhone, tenantId: tenant.id }),
  });

  // Step 2: Verify OTP to register the user
  const verifyRes = await fetch(`${identityUrl}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userPhone, tenantId: tenant.id, code: '123456' }),
  });
  const verifyBody = (await verifyRes.json() as any).data;
  const user = verifyBody.user;

  // Step 3: Promote user to MEMBER via internal userType API
  await fetch(`${identityUrl}/users/${user.id}/type`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ userType: 'MEMBER' }),
  });

  // Step 4: Assign USER the BRANCH_MANAGER role for Branch A (Bootstrapping via INTERNAL_SERVICE_KEY)
  const roleRes = await fetch(`${tenantUrl}/tenants/${tenant.id}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ userId: user.id, role: 'BRANCH_MANAGER', branchId: branchA.id }),
  });
  if (roleRes.status !== 200) {
    throw new Error(`Test 3 failed: Expected role assignment to succeed, got status ${roleRes.status}`);
  }

  // Step 5: Perform a fresh OTP request/verify login flow to fetch the enhanced JWT access token
  await fetch(`${identityUrl}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userPhone, tenantId: tenant.id }),
  });
  const loginRes = await fetch(`${identityUrl}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userPhone, tenantId: tenant.id, code: '123456' }),
  });
  const loginBody = (await loginRes.json() as any).data;
  const token = loginBody.accessToken;

  // Step 6: Decode JWT access token and assert roles claim is populated
  const decoded = decodeJwtPayload(token);
  console.log('Decoded JWT payload claims:', decoded);

  if (!decoded.roles || !decoded.roles.includes(`branch_manager:${branchA.id}`)) {
    throw new Error(`Test 3 failed: Expected JWT roles claim to carry branch_manager:${branchA.id}, got: ${JSON.stringify(decoded.roles)}`);
  }
  console.log('End-to-End verification successful! JWT token successfully embedded the Tenant-assigned roles.');
  console.log('Test 3 passed successfully!');

  // ==========================================
  // TEST 4: DYNAMIC MANIFEST ERROR HANDLING
  // ==========================================
  console.log('\n--- Test 4: Dynamic Manifest Error Handling ---');
  // Query manifest with nonexistent tenant ID
  const manifestErrorRes = await fetch(`${tenantUrl}/tenants/99999999-9999-9999-9999-999999999999/manifest.json`);
  if (manifestErrorRes.status !== 404) {
    throw new Error(`Test 4 failed: Expected manifest.json of nonexistent tenant to return 404, got ${manifestErrorRes.status}`);
  }
  const manifestError = await manifestErrorRes.json() as any;
  if (manifestError.error?.code !== 'TENANT_NOT_FOUND') {
    throw new Error(`Test 4 failed: Expected error code TENANT_NOT_FOUND, got ${manifestError.error?.code}`);
  }
  console.log('Dynamic manifest error path caught and returned standard envelope correctly.');
  console.log('Test 4 passed successfully!');

  console.log('\nAll Phase 3 Tenant Management Tests Passed Successfully!');
}

async function main() {
  console.log('Starting local servers (Slot Engine, Identity & Auth, Tenant Management)...');
  
  const slotProcess = spawn('node', [path.join(__dirname, '../../slot-engine/dist/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  const authProcess = spawn('node', [path.join(__dirname, '../../identity-auth/dist/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3002', INTERNAL_SERVICE_KEY: internalKey, TENANT_SERVICE_URL: tenantUrl },
  });

  const tenantProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3003', INTERNAL_SERVICE_KEY: internalKey },
  });

  const exitHandler = (code: number) => {
    console.log('Shutting down local servers...');
    slotProcess.kill();
    authProcess.kill();
    tenantProcess.kill();
    process.exit(code);
  };

  try {
    const ready1 = await waitForService(slotEngineUrl);
    const ready2 = await waitForService(identityUrl);
    const ready3 = await waitForService(tenantUrl);
    if (!ready1 || !ready2 || !ready3) {
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
