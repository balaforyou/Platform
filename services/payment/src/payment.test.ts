import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@badminton/database';

const db = new PrismaClient();
const identityUrl = 'http://localhost:3002';
const slotEngineUrl = 'http://localhost:3001';
const paymentUrl = 'http://localhost:3004';
const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
const webhookSecret = 'test-webhook-secret';

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
 * Helper to generate a valid Razorpay signature for testing.
 */
function generateRazorpaySignature(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

/**
 * Wipes the database tables to ensure clean test runs.
 */
async function cleanDatabase() {
  await db.webhookEvent.deleteMany();
  await db.refund.deleteMany();
  await db.paymentIntent.deleteMany();
  await db.subscription.deleteMany();
  
  await db.bookingPlayer.deleteMany();
  await db.booking.deleteMany();
  await db.availabilityWindow.deleteMany();
  await db.resource.deleteMany();
  await db.blockedWindow.deleteMany();
  await db.bookingRule.deleteMany();
  await db.resourcePool.deleteMany();
  console.log('Database cleaned successfully.');
}

async function runTests() {
  console.log('Starting Phase 4 Payment Integration Tests...');
  await cleanDatabase();

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';

  // ==========================================
  // TEST 1: SERVER-SIDE PRICING & SPOOFING DEFENSE
  // ==========================================
  console.log('\n--- Test 1: Server-Side Pricing & Spoofing Defense ---');
  // Seed a ResourcePool with basePrice = 125.00
  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: 'Priced Pool',
      allocationMode: 'POOLED',
      basePrice: 125.00,
    }),
  });
  const pool = (await poolRes.json() as any).data;

  // Add rule with 24 hours cancellation threshold
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
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h from now
      endTime: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
      capacity: 5,
    }),
  });
  const window = (await windowRes.json() as any).data;

  // Request booking passing a spoofed price = 5.00
  const bookingRes = await fetch(`${slotEngineUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': 'pricing-spoof-booking-key',
    },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pool.id,
      windowId: window.id,
      userId,
      price: 5.00, // Spoofed client-side value
    }),
  });
  const booking = (await bookingRes.json() as any).data;

  if (Number(booking.price) !== 125.00) {
    throw new Error(`Test 1 failed: Expected server resolved price of 125.00, got ${booking.price}`);
  }
  console.log('Server successfully resolved ResourcePool.basePrice (125.00) and ignored client-supplied price.');
  console.log('Test 1 passed successfully!');

  // ==========================================
  // TEST 2: WEBHOOK SIGNATURE VALIDATION
  // ==========================================
  console.log('\n--- Test 2: Webhook Signature Validation ---');
  const payload = {
    id: 'evt_mock123',
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_mock123',
          amount: 12500,
          status: 'captured',
        },
      },
    },
  };
  const payloadStr = JSON.stringify(payload);

  // Send with invalid signature
  const resInvalidSig = await fetch(`${paymentUrl}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': 'invalid-signature-value',
    },
    body: payloadStr,
  });
  if (resInvalidSig.status !== 400) {
    throw new Error(`Test 2 failed: Expected invalid signature to return 400, got ${resInvalidSig.status}`);
  }

  // Send with valid signature
  const validSig = generateRazorpaySignature(payloadStr, webhookSecret);
  const resValidSig = await fetch(`${paymentUrl}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': validSig,
    },
    body: payloadStr,
  });
  if (resValidSig.status !== 200) {
    throw new Error(`Test 2 failed: Expected valid signature to return 200, got ${resValidSig.status}`);
  }
  console.log('Webhook signature validation verified (invalid signature rejected, valid accepted).');
  console.log('Test 2 passed successfully!');

  // ==========================================
  // TEST 3: WEBHOOK IDEMPOTENCY
  // ==========================================
  console.log('\n--- Test 3: Webhook Idempotency ---');
  // Re-send the exact same payload (evt_mock123)
  const resDup = await fetch(`${paymentUrl}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': validSig,
    },
    body: payloadStr,
  });
  if (resDup.status !== 200) {
    throw new Error(`Test 3 failed: Expected duplicate webhook to return 200, got ${resDup.status}`);
  }
  const dupBody = await resDup.json() as any;
  if (dupBody.data?.duplicated !== true) {
    throw new Error(`Test 3 failed: Expected duplicated response flag to be true, got ${JSON.stringify(dupBody)}`);
  }
  console.log('Webhook idempotency successfully intercepted duplicate event (no double-processing).');
  console.log('Test 3 passed successfully!');

  // ==========================================
  // TEST 4: E2E WEBHOOK BOOKING CONFIRMATION (HELD -> CONFIRMED)
  // ==========================================
  console.log('\n--- Test 4: E2E Webhook Booking Confirmation ---');
  // 1. Create a held booking
  const holdRes = await fetch(`${slotEngineUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': 'e2e-payment-hold-key',
    },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pool.id,
      windowId: window.id,
      userId,
    }),
  });
  const holdBooking = (await holdRes.json() as any).data;
  if (holdBooking.status !== 'HELD') {
    throw new Error(`Setup failed: Expected HELD booking, got ${holdBooking.status}`);
  }

  // 2. Create PaymentIntent
  const intentRes = await fetch(`${paymentUrl}/payments/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: holdBooking.id }),
  });
  const intent = (await intentRes.json() as any).data;

  // 3. Dispatch signed webhook to capture payment
  const capturePayload = {
    id: 'evt_capture_' + crypto.randomBytes(4).toString('hex'),
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: intent.gatewayRef,
          amount: intent.amount,
          status: 'captured',
        },
      },
    },
  };
  const capturePayloadStr = JSON.stringify(capturePayload);
  const captureSig = generateRazorpaySignature(capturePayloadStr, webhookSecret);

  const webhookRes = await fetch(`${paymentUrl}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': captureSig,
    },
    body: capturePayloadStr,
  });
  if (webhookRes.status !== 200) {
    throw new Error(`Webhook dispatch failed with status ${webhookRes.status}`);
  }

  // 4. Assert Booking status is now CONFIRMED in Slot Engine
  const bookingConfirmRes = await fetch(`${slotEngineUrl}/bookings/${holdBooking.id}`, {
    headers: { 'Authorization': `Bearer ${internalKey}` },
  });
  const bookingConfirmed = (await bookingConfirmRes.json() as any).data;
  if (bookingConfirmed.status !== 'CONFIRMED') {
    throw new Error(`Test 4 failed: Expected booking status to transition to CONFIRMED, got ${bookingConfirmed.status}`);
  }

  // Assert PaymentIntent is updated to captured
  const updatedIntent = await db.paymentIntent.findUnique({ where: { id: intent.id } });
  if (updatedIntent?.status !== 'captured') {
    throw new Error(`Test 4 failed: Expected PaymentIntent status captured, got ${updatedIntent?.status}`);
  }

  console.log('E2E payment flow successful. Webhook captured payment and transitioned Slot Engine booking HELD -> CONFIRMED.');
  console.log('Test 4 passed successfully!');

  // ==========================================
  // TEST 5: MEMBER AUTOPAY BILLING FLOW
  // ==========================================
  console.log('\n--- Test 5: Member AutoPay Billing & Recovery ---');
  const mandateId = 'mandate_mock_123';
  
  // Register member subscription (bookkeeping)
  const subRes = await fetch(`${paymentUrl}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      userId,
      mandateId,
      amount: 15000,
    }),
  });
  const sub = (await subRes.json() as any).data;
  if (sub.status !== 'active') {
    throw new Error('Mandate registration failed.');
  }

  // 1. Dispatch failed charge webhook
  const failPayload = {
    id: 'evt_fail_' + crypto.randomBytes(4).toString('hex'),
    event: 'subscription.charge_failed',
    payload: {
      subscription: {
        entity: { id: mandateId },
      },
    },
  };
  const failPayloadStr = JSON.stringify(failPayload);
  const failSig = generateRazorpaySignature(failPayloadStr, webhookSecret);

  await fetch(`${paymentUrl}/webhooks/razorpay/autopay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': failSig,
    },
    body: failPayloadStr,
  });

  // Assert status is now suspended
  const suspendedSub = await db.subscription.findUnique({ where: { id: sub.id } });
  if (suspendedSub?.status !== 'suspended') {
    throw new Error(`Test 5 failed: Expected suspended status, got ${suspendedSub?.status}`);
  }
  console.log('Subscription suspended successfully on debit failure.');

  // 2. Dispatch successful charged retry webhook (Self-healing recovery)
  const chargedPayload = {
    id: 'evt_success_' + crypto.randomBytes(4).toString('hex'),
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: { id: mandateId },
      },
    },
  };
  const chargedPayloadStr = JSON.stringify(chargedPayload);
  const chargedSig = generateRazorpaySignature(chargedPayloadStr, webhookSecret);

  await fetch(`${paymentUrl}/webhooks/razorpay/autopay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': chargedSig,
    },
    body: chargedPayloadStr,
  });

  // Assert status recovered back to active
  const activeSub = await db.subscription.findUnique({ where: { id: sub.id } });
  if (activeSub?.status !== 'active') {
    throw new Error(`Test 5 failed: Expected active status post-recovery, got ${activeSub?.status}`);
  }
  console.log('Subscription recovered back to active successfully on successful retry webhook.');
  console.log('Test 5 passed successfully!');

  // ==========================================
  // TEST 6: PAYMENTINTENT DUPLICATE PREVENTION
  // ==========================================
  console.log('\n--- Test 6: PaymentIntent Duplicate Prevention ---');
  // 1. Create a held booking
  const bookingHoldRes = await fetch(`${slotEngineUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idempotency-key': 'dup-intent-hold-key',
    },
    body: JSON.stringify({
      tenantId,
      branchId,
      resourcePoolId: pool.id,
      windowId: window.id,
      userId,
    }),
  });
  const bookingHold = (await bookingHoldRes.json() as any).data;

  // 2. Trigger first payment intent creation
  const intentRes1 = await fetch(`${paymentUrl}/payments/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: bookingHold.id }),
  });
  const intent1 = (await intentRes1.json() as any).data;

  // 3. Trigger second payment intent creation
  const intentRes2 = await fetch(`${paymentUrl}/payments/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: bookingHold.id }),
  });
  const intent2 = (await intentRes2.json() as any).data;

  if (intent1.id !== intent2.id) {
    throw new Error('Test 6 failed: Created duplicate PaymentIntent records for same booking hold.');
  }
  console.log('Duplicate prevention successfully returned existing pending intent.');
  console.log('Test 6 passed successfully!');

  // ==========================================
  // TEST 7: DIRECT REFUND EXECUTION (SLOT-ENGINE COMPUTED)
  // ==========================================
  console.log('\n--- Test 7: Direct Refund Execution ---');
  // 1. Capture payment first for our E2E confirmed booking (from Test 4)
  // (bookingConfirmed is already confirmed, has price 125.00 and status CONFIRMED)
  
  // 2. Cancel the confirmed booking in Slot Engine
  const cancelRes = await fetch(`${slotEngineUrl}/bookings/${bookingConfirmed.id}/cancel`, {
    method: 'POST',
  });
  const cancelledBooking = (await cancelRes.json() as any).data;
  if (cancelledBooking.status !== 'CANCELLED' || Number(cancelledBooking.refundAmount) !== 125.00) {
    throw new Error(`Setup failed: Expected CANCELLED booking and 125.00 refundAmount, got status ${cancelledBooking.status} and refund ${cancelledBooking.refundAmount}`);
  }
  console.log(`Booking cancelled in Slot Engine. Computed refundAmount: ${cancelledBooking.refundAmount}`);

  // 3. Trigger refund in Payment service
  const refundRes = await fetch(`${paymentUrl}/refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: bookingConfirmed.id }),
  });
  const refund = (await refundRes.json() as any).data;

  if (refund.amount !== 12500 || refund.status !== 'processed') {
    throw new Error(`Test 7 failed: Expected refund status processed and amount 12500 paise, got status ${refund.status} and amount ${refund.amount}`);
  }
  console.log('Refund executed successfully using the pre-calculated refundAmount from Slot Engine.');
  console.log('Test 7 passed successfully!');

  console.log('\nAll Phase 4 Payment Tests Passed Successfully!');
}

async function main() {
  console.log('Starting local servers (Slot Engine, Identity & Auth, Payment)...');
  
  const slotProcess = spawn('node', [path.join(__dirname, '../../slot-engine/dist/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  const authProcess = spawn('node', [path.join(__dirname, '../../identity-auth/dist/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3002', INTERNAL_SERVICE_KEY: internalKey },
  });

  const paymentProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3004', INTERNAL_SERVICE_KEY: internalKey, RAZORPAY_WEBHOOK_SECRET: webhookSecret },
  });

  const exitHandler = (code: number) => {
    console.log('Shutting down local servers...');
    slotProcess.kill();
    authProcess.kill();
    paymentProcess.kill();
    process.exit(code);
  };

  try {
    const ready1 = await waitForService(slotEngineUrl);
    const ready2 = await waitForService(identityUrl);
    const ready4 = await waitForService(paymentUrl);
    if (!ready1 || !ready2 || !ready4) {
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
