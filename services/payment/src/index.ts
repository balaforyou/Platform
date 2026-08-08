import 'dotenv/config';
import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { Readable } from 'stream';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, Prisma } from '@badminton/database';
// @ts-ignore
import Razorpay from 'razorpay';

const razorpayClient = new Razorpay({
  key_id: (process.env.RAZORPAY_KEY_ID || 'rzp_test_TJllXnaezST7MV').trim(),
  key_secret: (process.env.RAZORPAY_KEY_SECRET || '2rZ1iVD0uYAJ7bw0CAFKsPC6').trim(),
});

const server = fastify({ logger: true });

// WHY: Register the response envelope plugin globally so all success and error responses
// are automatically wrapped to follow the API standards.
server.register(responseEnvelopePlugin);

// Register JWT support for verifying admin tokens on POST /refunds/override.
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg',
});

const prisma = new PrismaClient();

// WHY: Fastify preParsing hook captures the raw body string and attaches it to the request object.
// This is required to compute valid Razorpay webhook signatures without consuming/disrupting
// the payload stream before the default JSON content parser processes it.
server.addHook('preParsing', async (request, reply, payload) => {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(chunk as Buffer);
  }
  const buffer = Buffer.concat(chunks);
  (request as any).rawBody = buffer.toString('utf8');
  
  // Re-create the stream so the downstream JSON parser can parse request.body
  return Readable.from(buffer);
});

// Signature validation helper
const verifyRazorpaySignature = (rawBody: string, signature: string, secret: string): boolean => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
};

// Connectivity health check endpoint
server.get('/health', async () => {
  return { status: 'ok', service: 'payment' };
});

/**
 * Verifies the caller's JWT and returns its identity claims.
 *
 * Mirrors slot-engine's requireUserJwt and the rule already stated on
 * POST /refunds/override: identity is ALWAYS derived from the verified token,
 * never accepted from the request body (F-045).
 */
async function requireUserJwt(request: any, reply: any) {
  try {
    const decoded: any = await request.jwtVerify();
    const userId = decoded.userId || decoded.sub || decoded.id;
    if (!userId) {
      reply.status(401);
      const err = new Error('Unauthorized: no user identity in token');
      (err as any).statusCode = 401;
      (err as any).code = 'UNAUTHORIZED';
      throw err;
    }
    return { userId, tenantId: decoded.tenantId, roles: (decoded.roles ?? []) as string[] };
  } catch (err: any) {
    if (err.statusCode || err.code) throw err;
    reply.status(401);
    const authErr = new Error('Unauthorized: Invalid or missing token');
    (authErr as any).statusCode = 401;
    (authErr as any).code = 'UNAUTHORIZED';
    throw authErr;
  }
}

/**
 * F-045: a booking's payment flow may only be driven by the booking's owner.
 * Fails closed — a missing/null owner id is a rejection, never a match.
 */
function requireBookingOwnership(ownerId: string | null | undefined, callerId: string, reply: any) {
  if (!ownerId || ownerId !== callerId) {
    reply.status(403);
    const err = new Error('Forbidden: booking belongs to another user');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }
}

// Create Payment Intent (with duplicate prevention checks)
// WHY: Ensures only one intent is created per booking, returning the pending one if retried.
const createIntentHandler = async (request: any, reply: any) => {
  // F-045: this endpoint previously had NO auth at all — anyone who knew a
  // bookingId could create or read back a payment intent for someone else's
  // booking. Identity now comes from the verified token only.
  const claims = await requireUserJwt(request, reply);

  const { bookingId } = request.body as any;
  if (!bookingId) {
    reply.status(400);
    const err = new Error('bookingId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // 1. Prevent duplicate intent creation per booking
  const existingIntent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId },
  });

  if (existingIntent) {
    // WHY the ownership check sits ABOVE the early return: otherwise this
    // branch hands an existing intent (amount, gatewayRef, userId) to any
    // caller who guesses a bookingId, which is the same leak in a new shape.
    requireBookingOwnership(existingIntent.userId, claims.userId, reply);

    if (existingIntent.status === 'captured') {
      reply.status(400);
      const err = new Error('Payment has already been captured for this booking');
      (err as any).statusCode = 400;
      (err as any).code = 'PAYMENT_ALREADY_CAPTURED';
      throw err;
    }
    // Return existing pending payment intent
    return existingIntent;
  }

  // 2. Fetch booking details from Slot Engine (Secure cross-service lookup)
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';

  let booking: any = null;
  try {
    const res = await fetch(`${slotEngineUrl}/bookings/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${internalKey}`,
      },
    });
    if (!res.ok) {
      reply.status(400);
      const err = new Error('Failed to find booking in Slot Engine');
      (err as any).statusCode = 400;
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const body = await res.json() as any;
    booking = body.data || body;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }

  // F-045: the caller must own the booking they are paying for. Checked before
  // any status/pricing work so a foreign booking never reveals its state either.
  requireBookingOwnership(booking?.userId, claims.userId, reply);

  if (!booking || booking.status !== 'HELD') {
    reply.status(400);
    const err = new Error('Only held bookings can have payment intents created');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  const amountPaise = Math.round(Number(booking.price) * 100);
  const gatewayRef = 'pay_mock_' + crypto.randomBytes(8).toString('hex');

  const intent = await prisma.paymentIntent.create({
    data: {
      tenantId: booking.tenantId,
      userId: booking.userId,
      amount: amountPaise,
      purpose: 'guest_booking',
      referenceId: bookingId,
      status: 'pending',
      gatewayRef,
    },
  });

  return intent;
};

server.post('/payments/intents', createIntentHandler);
server.post('/intents', createIntentHandler);

const createOrderHandler = async (request: any, reply: any) => {
  // F-045: this endpoint already verified that SOME valid token was presented,
  // but never checked that the token's owner is the booking's owner.
  const claims = await requireUserJwt(request, reply);

  const { amount, currency, receipt, bookingId } = request.body as any;

  // F-045: bookingId is now REQUIRED. It was optional, which meant "omit it"
  // was a way to skip the ownership check entirely. It is a resource selector,
  // not a claimed identity — without it the check cannot run at all.
  if (!bookingId) {
    reply.status(400);
    const err = new Error('bookingId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // The intent's userId was itself copied server-side from booking.userId when
  // the intent was created, so it is an authoritative owner record — and a
  // local read, with no extra cross-service hop.
  const owningIntent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId },
  });
  if (!owningIntent) {
    reply.status(404);
    const err = new Error('No payment intent exists for this booking');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  requireBookingOwnership(owningIntent.userId, claims.userId, reply);

  // F-049: the charge is ALWAYS the amount stored on the PaymentIntent, never
  // the one in the request body. That stored value was determined at an earlier,
  // properly-authorized step — server-side resolvePrice for standard bookings
  // (which already honours a window-level pricing override), or an admin's
  // negotiatedPrice for negotiated ones. The body's `amount` is ignored, not
  // rejected, matching how identity and price are handled elsewhere.
  const authoritativeAmount = owningIntent.amount;

  if (typeof authoritativeAmount !== 'number' || !Number.isFinite(authoritativeAmount)) {
    reply.status(409);
    const err = new Error('Stored payment amount for this booking is unusable');
    (err as any).statusCode = 409;
    (err as any).code = 'INVALID_STORED_AMOUNT';
    throw err;
  }

  // Validation applies to the amount actually charged, not to the discarded one.
  if (authoritativeAmount < 100) {
    reply.status(400);
    const err = new Error('Amount must be at least 100 paise');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Traceable to a specific booking if this is ever reviewed later.
  if (amount !== undefined && amount !== null && Number(amount) !== authoritativeAmount) {
    console.log(
      'PAYMENT_AMOUNT_EVIDENCE client_amount_overridden',
      JSON.stringify({
        bookingId,
        intentId: owningIntent.id,
        clientSuppliedAmount: amount,
        authoritativeAmount,
        callerUserId: claims.userId,
      }),
    );
  }

  try {
    const order = await razorpayClient.orders.create({
      amount: authoritativeAmount,
      currency: currency || 'INR',
      receipt: receipt ? receipt.slice(0, 40) : `receipt_${Date.now()}`,
    });

    // Point the (already resolved and ownership-checked) intent at this order.
    await prisma.paymentIntent.update({
      where: { id: owningIntent.id },
      data: { gatewayRef: order.id },
    });

    return {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  } catch (err: any) {
    console.error('Razorpay Order Creation Error details:', err);
    server.log.error(err, 'Razorpay Order Creation Error');
    reply.status(500);
    throw new Error('Razorpay API error: ' + (err.message || err.description || 'Internal server error'));
  }
};

const verifyPaymentHandler = async (request: any, reply: any) => {
  // Authentication verification
  try {
    await request.jwtVerify();
  } catch (err: any) {
    reply.status(401);
    const authErr = new Error('Unauthorized: Invalid or missing token');
    (authErr as any).statusCode = 401;
    (authErr as any).code = 'UNAUTHORIZED';
    throw authErr;
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = request.body as any;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    reply.status(400);
    const err = new Error('Missing required fields: razorpay_payment_id, razorpay_order_id, and razorpay_signature are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '2rZ1iVD0uYAJ7bw0CAFKsPC6').trim();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    reply.status(400);
    const err = new Error('Signature verification failed: Mismatched signature');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Update intent status to captured and confirm booking in slot-engine
  const intent = await prisma.paymentIntent.findFirst({
    where: { gatewayRef: razorpay_order_id },
  });

  if (intent && intent.status === 'pending') {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'captured' },
    });

    const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
    const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';
    
    const confirmRes = await fetch(`${slotEngineUrl}/bookings/${intent.referenceId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalKey}`,
      },
      body: JSON.stringify({}),
    });

    if (!confirmRes.ok) {
      const errText = await confirmRes.text();
      server.log.error(`Confirm booking error response: ${errText}`);
      reply.status(500);
      throw new Error(`Failed to confirm booking on Slot Engine: Status ${confirmRes.status}`);
    }
  }

  return { success: true };
};

server.post('/payments/create-order', createOrderHandler);
server.post('/create-order', createOrderHandler);

server.post('/payments/verify-payment', verifyPaymentHandler);
server.post('/verify-payment', verifyPaymentHandler);

// Create/Register subscription mandate (Bookkeeping only)
// WHY: Pure bookkeeping. Mandate creation is initiated and authorized client-side using Razorpay's SDK.
server.post('/subscriptions', async (request, reply) => {
  const { tenantId, userId, mandateId, amount, frequency } = request.body as any;

  if (!tenantId || !userId || !mandateId || !amount) {
    reply.status(400);
    const err = new Error('tenantId, userId, mandateId, and amount are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const sub = await prisma.subscription.upsert({
    where: { mandateId },
    update: {},
    create: {
      tenantId,
      userId,
      mandateId,
      amount: Number(amount),
      frequency: frequency || 'monthly',
      status: 'active',
    },
  });

  return sub;
});

// Razorpay One-time Guest Webhook Receiver
// WHY: Verifies signatures and enforces atomic idempotency before triggering Slot Engine confirmations.
server.post('/webhooks/razorpay', async (request, reply) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret';
  const signature = request.headers['x-razorpay-signature'] as string;
  const rawBody = (request as any).rawBody || '';

  if (!signature || !verifyRazorpaySignature(rawBody, signature, secret)) {
    reply.status(400);
    const err = new Error('Invalid signature');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_SIGNATURE';
    throw err;
  }

  const body = request.body as any;
  const eventId = body.id; // Razorpay event ID
  if (!eventId) {
    reply.status(400);
    throw new Error('Missing event id');
  }

  // 1. Atomic Idempotency Gate (Insert First)
  // WHY: Protects against concurrent replayed webhook races.
  try {
    await prisma.webhookEvent.create({
      data: { gatewayEventId: eventId },
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Duplicate event. Skip processing and return 200 OK.
      return { success: true, duplicated: true };
    }
    throw err;
  }

  // 2. Process event
  if (body.event === 'payment.captured') {
    const paymentEntity = body.payload?.payment?.entity;
    const gatewayRef = paymentEntity?.id;     // pay_XYZ (standard checkout or link payment)
    const linkRef = paymentEntity?.payment_link_id ?? null; // plink_ABC, present for Payment Link flows

    // WHY: Match by direct pay_ ref first; fall back to the payment_link_id that was stored
    // as gatewayRef when the Payment Link intent was created. This is additive — existing
    // self-service Checkout flows are unaffected (they never have payment_link_id in their payload).
    const intent = await prisma.paymentIntent.findFirst({
      where: {
        OR: [
          { gatewayRef },
          ...(linkRef ? [{ gatewayRef: linkRef }] : []),
        ],
      },
    });

    if (intent && intent.status === 'pending') {
      // Update intent status to captured
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'captured' },
      });

      // Call Slot Engine to confirm the booking (Requires INTERNAL_SERVICE_KEY)
      const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
      const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';
      
      const confirmRes = await fetch(`${slotEngineUrl}/bookings/${intent.referenceId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalKey}`,
        },
        body: JSON.stringify({}),
      });

      if (!confirmRes.ok) {
        const errText = await confirmRes.text();
        server.log.error(`Confirm booking error response: ${errText}`);
        throw new Error(`Failed to confirm booking on Slot Engine: Status ${confirmRes.status}, Body: ${errText}`);
      }
    }
  }

  return { success: true };
});

// Razorpay AutoPay Webhook Receiver
// WHY: Manages member subscription recurring charges, suspension alerts, and self-healing recovery.
server.post('/webhooks/razorpay/autopay', async (request, reply) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret';
  const signature = request.headers['x-razorpay-signature'] as string;
  const rawBody = (request as any).rawBody || '';

  if (!signature || !verifyRazorpaySignature(rawBody, signature, secret)) {
    reply.status(400);
    const err = new Error('Invalid signature');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_SIGNATURE';
    throw err;
  }

  const body = request.body as any;
  const eventId = body.id;
  if (!eventId) {
    reply.status(400);
    throw new Error('Missing event id');
  }

  // Atomic Idempotency Gate
  try {
    await prisma.webhookEvent.create({
      data: { gatewayEventId: eventId },
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: true, duplicated: true };
    }
    throw err;
  }

  // Process recurring AutoPay charge
  const mandateId = body.payload?.subscription?.entity?.id || body.payload?.payment?.entity?.subscription_id;

  if (body.event === 'subscription.charged') {
    const sub = await prisma.subscription.findUnique({
      where: { mandateId },
    });

    if (sub) {
      // 1. Update subscription status to active (self-healing recovery)
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'active' },
      });

      // 2. Create captured PaymentIntent record for billing history auditing
      await prisma.paymentIntent.create({
        data: {
          tenantId: sub.tenantId,
          userId: sub.userId,
          amount: sub.amount,
          purpose: 'subscription_billing',
          referenceId: sub.id,
          status: 'captured',
          gatewayRef: `mock-razorpay-autopay-${eventId}`,
        },
      });
    }
  } else if (body.event === 'subscription.charge_failed') {
    const sub = await prisma.subscription.findUnique({
      where: { mandateId },
    });

    if (sub) {
      // 1. Update status to suspended
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'suspended' },
      });

      // 2. Dispatch call to Notification service (using INTERNAL_SERVICE_KEY)
      const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
      const notificationUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
      try {
        await fetch(`${notificationUrl}/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalKey}`,
          },
          body: JSON.stringify({
            tenantId: sub.tenantId,
            recipient: sub.userId,
            event_type: 'subscription_charge_failed',
            variables: {
              subscriptionId: sub.id,
              amount: sub.amount,
            },
          }),
        });
      } catch (e) {
        // Log warning but don't block in dev if Notification service isn't built yet
        server.log.warn('Could not trigger notification for AutoPay failure: ' + String(e));
      }
    }
  }

  return { success: true };
});

// Issue direct refund based on Slot-Engine calculation
// WHY: Decoupled design. Reads booking.refundAmount from Slot Engine and triggers direct monetary refund.
server.post('/refunds', async (request, reply) => {
  const { bookingId } = request.body as any;
  if (!bookingId) {
    reply.status(400);
    const err = new Error('bookingId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // 1. Fetch booking details from Slot Engine (with internal key authentication)
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';

  let booking: any = null;
  try {
    const res = await fetch(`${slotEngineUrl}/bookings/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${internalKey}`,
      },
    });
    if (!res.ok) {
      reply.status(400);
      const err = new Error('Failed to find booking in Slot Engine');
      (err as any).statusCode = 400;
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const body = await res.json() as any;
    booking = body.data;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }

  if (booking.status !== 'CANCELLED') {
    reply.status(400);
    const err = new Error('Only cancelled bookings can be refunded');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  const refundAmt = Number(booking.refundAmount);
  if (isNaN(refundAmt) || refundAmt <= 0) {
    // If calculated refund is 0 (flat no-refund zone), skip gateway refund processing
    return { success: true, message: 'Refund amount is 0, skipping gateway transaction' };
  }

  // Verify that a captured payment intent exists
  const intent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId, status: 'captured' },
  });
  if (!intent) {
    reply.status(400);
    const err = new Error('No captured payment found for this booking');
    (err as any).statusCode = 400;
    (err as any).code = 'PAYMENT_INTENT_NOT_FOUND';
    throw err;
  }

  // Check if a Refund already exists (idempotency check)
  const existingRefund = await prisma.refund.findFirst({
    where: { paymentIntentId: intent.id },
  });
  if (existingRefund) {
    return existingRefund;
  }

  // Convert refundAmount from rupees to paise
  const refundAmountPaise = Math.round(refundAmt * 100);

  // Record Refund in database
  const refund = await prisma.refund.create({
    data: {
      paymentIntentId: intent.id,
      amount: refundAmountPaise,
      reason: 'customer_cancellation',
      status: 'processed',
    },
  });

  return refund;
});

// ---------------------------------------------------------------------------
// POST /payment-links — create a Razorpay Payment Link for negotiated bookings
// WHY: Payment Links are used for admin-negotiated bookings (e.g. sent via WhatsApp).
// Auth: INTERNAL_SERVICE_KEY OR JWT with OWNER/BRANCH_MANAGER role (explicit dual-path per plan).
// The gatewayRef stored is the plink_ ID so the webhook matcher can resolve it when
// payment.captured fires with payment_link_id in the payload.
// ---------------------------------------------------------------------------
const requirePaymentLinkAdmin = async (request: any, reply: any): Promise<any | null> => {
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

  if (authHeader === `Bearer ${internalKey}`) {
    return null;
  }
  if (!authHeader) {
    reply.status(401);
    const err = new Error('Missing authorization header');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  try {
    const decoded = await request.jwtVerify() as any;
    const roles: string[] = decoded.roles ?? [];
    const isAdmin = roles.some((r: string) =>
      r === 'owner' || r.startsWith('branch_manager:')
    );
    if (!isAdmin) {
      reply.status(403);
      const err = new Error('Forbidden: Owner or Branch Manager role required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
    return decoded;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

const getBookingFromSlotEngine = async (bookingId: string, reply: any) => {
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${slotEngineUrl}/bookings/${bookingId}`, {
      headers: { 'Authorization': `Bearer ${internalKey}` },
    });
    if (!res.ok) {
      reply.status(400);
      const err = new Error('Booking not found in Slot Engine');
      (err as any).statusCode = 400;
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const body = await res.json() as any;
    return body.data ?? body;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }
};

// WHY: Payment Link creation is reused by both the legacy bookingId-based endpoint
// and the negotiated-booking orchestration endpoint. It checks for an existing intent
// first so retries return the same link rather than creating duplicates.
const createPaymentLinkForHeldBooking = async ({
  bookingId,
  tenantId,
  userId,
  amount,
  idempotencyKey,
  reply,
}: {
  bookingId: string;
  tenantId: string;
  userId: string;
  amount: number;
  idempotencyKey?: string;
  reply: any;
}) => {
  const existingIntent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId },
  });
  if (existingIntent) {
    if (existingIntent.status === 'captured') {
      reply.status(400);
      const err = new Error('Payment has already been captured for this booking');
      (err as any).statusCode = 400;
      (err as any).code = 'PAYMENT_ALREADY_CAPTURED';
      throw err;
    }
    return {
      paymentLinkId: existingIntent.gatewayRef,
      shortUrl: `https://rzp.io/l/mock-${existingIntent.gatewayRef.slice(-8)}`,
      amount: existingIntent.amount,
      intentId: existingIntent.id,
      reused: true,
    };
  }

  const booking = await getBookingFromSlotEngine(bookingId, reply);
  if (booking.status !== 'HELD') {
    reply.status(400);
    const err = new Error('Only held bookings can have a payment link created');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  const deterministicSuffix = idempotencyKey
    ? crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)
    : crypto.randomBytes(8).toString('hex');
  const paymentLinkId = `plink_mock_${deterministicSuffix}`;
  const shortUrl = `https://rzp.io/l/mock-${paymentLinkId.slice(-8)}`;
  const amountPaise = Math.round(Number(amount) * 100);

  try {
    const intent = await prisma.paymentIntent.create({
      data: {
        tenantId,
        userId,
        amount: amountPaise,
        purpose: 'guest_booking',
        referenceId: bookingId,
        status: 'pending',
        gatewayRef: paymentLinkId,
      },
    });

    return { paymentLinkId, shortUrl, amount: amountPaise, intentId: intent.id };
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existingByGateway = await prisma.paymentIntent.findUnique({ where: { gatewayRef: paymentLinkId } });
      if (existingByGateway) {
        return {
          paymentLinkId: existingByGateway.gatewayRef,
          shortUrl: `https://rzp.io/l/mock-${existingByGateway.gatewayRef.slice(-8)}`,
          amount: existingByGateway.amount,
          intentId: existingByGateway.id,
          reused: true,
        };
      }
    }
    throw err;
  }
};

server.post('/payment-links', async (request, reply) => {
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

  let authed = false;
  if (authHeader === `Bearer ${internalKey}`) {
    authed = true;
  } else if (authHeader) {
    try {
      const decoded = await request.jwtVerify() as any;
      const roles: string[] = decoded.roles ?? [];
      const isAdmin = roles.some((r: string) =>
        r === 'owner' || r.startsWith('branch_manager:')
      );
      if (isAdmin) authed = true;
      else {
        reply.status(403);
        const err = new Error('Forbidden: Owner or Branch Manager role required');
        (err as any).statusCode = 403;
        (err as any).code = 'FORBIDDEN';
        throw err;
      }
    } catch (e: any) {
      if (e.statusCode) throw e;
      reply.status(401);
      const err = new Error('Invalid or expired token');
      (err as any).statusCode = 401;
      (err as any).code = 'UNAUTHORIZED';
      throw err;
    }
  }
  if (!authed) {
    reply.status(401);
    const err = new Error('Missing authorization header');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  const { bookingId, tenantId, userId, amount, description } = request.body as any;
  if (!bookingId || !tenantId || !userId || amount == null) {
    reply.status(400);
    const err = new Error('bookingId, tenantId, userId, and amount are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Verify booking exists in Slot Engine and is in HELD state.
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';
  let booking: any = null;
  try {
    const res = await fetch(`${slotEngineUrl}/bookings/${bookingId}`, {
      headers: { 'Authorization': `Bearer ${internalKey}` },
    });
    if (!res.ok) {
      reply.status(400);
      const err = new Error('Booking not found in Slot Engine');
      (err as any).statusCode = 400;
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const body = await res.json() as any;
    booking = body.data;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }

  if (booking.status !== 'HELD') {
    reply.status(400);
    const err = new Error('Only held bookings can have a payment link created');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  // WHY: In dev/test, mock the Razorpay Payment Link ID. In production, this would call
  // the Razorpay Payment Links API and return the real plink_ ID and short_url.
  const paymentLinkId = 'plink_mock_' + crypto.randomBytes(8).toString('hex');
  const shortUrl = `https://rzp.io/l/mock-${paymentLinkId.slice(-8)}`;
  const amountPaise = Math.round(Number(amount) * 100);

  // WHY: Store the plink_ ID as gatewayRef so the webhook matcher can find this intent
  // when Razorpay fires payment.captured with payment_link_id = plink_...
  const intent = await prisma.paymentIntent.create({
    data: {
      tenantId,
      userId,
      amount: amountPaise,
      purpose: 'guest_booking',
      referenceId: bookingId,
      status: 'pending',
      gatewayRef: paymentLinkId,
    },
  });

  reply.status(201);
  return { paymentLinkId, shortUrl, amount: amountPaise, intentId: intent.id };
});

// POST /payment-links/negotiated — create held negotiated booking and link atomically for Admin Web.
// WHY: Keeps the legacy /payment-links contract stable while giving browsers one JWT-gated
// operation that performs the internal Slot Engine negotiated booking call without exposing
// INTERNAL_SERVICE_KEY to the client.
server.post('/payment-links/negotiated', async (request, reply) => {
  const decoded = await requirePaymentLinkAdmin(request, reply);

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) {
    reply.status(400);
    const err = new Error('Idempotency-Key header is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const {
    tenantId,
    branchId,
    resourcePoolId,
    resourceId,
    windowId,
    userId,
    negotiatedPrice,
    coPlayers,
    description,
  } = request.body as any;

  if (!tenantId || !branchId || !resourcePoolId || !windowId || !userId || negotiatedPrice == null) {
    reply.status(400);
    const err = new Error('tenantId, branchId, resourcePoolId, windowId, userId, and negotiatedPrice are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  if (decoded) {
    const roles: string[] = decoded.roles ?? [];
    const isOwner = roles.includes('owner');
    const isScopedManager = roles.includes(`branch_manager:${branchId}`);
    if (!isOwner && !isScopedManager) {
      reply.status(403);
      const err = new Error('Forbidden: Not authorized for this branch');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  }

  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';

  let booking: any;
  try {
    const bookingRes = await fetch(`${slotEngineUrl}/bookings/negotiated`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        tenantId,
        branchId,
        resourcePoolId,
        resourceId,
        windowId,
        userId,
        negotiatedPrice,
        coPlayers,
      }),
    });

    const bookingBody = await bookingRes.json() as any;
    if (!bookingRes.ok) {
      reply.status(bookingRes.status);
      const err = new Error(bookingBody.error?.message || 'Negotiated booking creation failed');
      (err as any).statusCode = bookingRes.status;
      (err as any).code = bookingBody.error?.code || 'NEGOTIATED_BOOKING_FAILED';
      throw err;
    }
    booking = bookingBody.data ?? bookingBody;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }

  const paymentLink = await createPaymentLinkForHeldBooking({
    bookingId: booking.id,
    tenantId: booking.tenantId ?? tenantId,
    userId: booking.userId ?? userId,
    amount: Number(negotiatedPrice),
    idempotencyKey,
    reply,
  });

  reply.status(paymentLink.reused ? 200 : 201);
  return { booking, paymentLink, description };
});

// ---------------------------------------------------------------------------
// POST /refunds/override — admin-initiated override refund with full audit trail
// WHY: Allows an admin to issue a refund for an amount different from the calculated one.
// Auth: JWT required, role OWNER or BRANCH_MANAGER.
// adminId is ALWAYS derived from request.jwtVerify() — never accepted from the request body.
// This mirrors the pattern from Phase 2 (client-supplied identity fields are a security issue).
// ---------------------------------------------------------------------------
server.post('/refunds/override', async (request, reply) => {
  // 1. Verify JWT and extract adminId from token — never from body.
  let adminId: string;
  try {
    const decoded = await request.jwtVerify() as any;
    adminId = decoded.sub || decoded.userId || decoded.id;
    if (!adminId) throw new Error('No user identity in token');

    const roles: string[] = decoded.roles ?? [];
    const isAdmin = roles.some((r: string) =>
      r === 'owner' || r.startsWith('branch_manager:')
    );
    if (!isAdmin) {
      reply.status(403);
      const err = new Error('Forbidden: Owner or Branch Manager role required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(401);
    const err = new Error('JWT required for refund override');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  const { bookingId, overrideAmount, reason } = request.body as any;
  if (!bookingId || overrideAmount == null || !reason) {
    reply.status(400);
    const err = new Error('bookingId, overrideAmount, and reason are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // 2. Fetch booking from Slot Engine — must be CANCELLED.
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';

  let booking: any = null;
  try {
    const res = await fetch(`${slotEngineUrl}/bookings/${bookingId}`, {
      headers: { 'Authorization': `Bearer ${internalKey}` },
    });
    if (!res.ok) {
      reply.status(400);
      const err = new Error('Booking not found in Slot Engine');
      (err as any).statusCode = 400;
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    const body = await res.json() as any;
    booking = body.data;
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(500);
    throw new Error('Slot Engine communication failure: ' + e.message);
  }

  if (booking.status !== 'CANCELLED') {
    reply.status(400);
    const err = new Error('Only cancelled bookings can be override-refunded');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_BOOKING_STATUS';
    throw err;
  }

  // 3. Verify a captured payment intent exists.
  const intent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId, status: 'captured' },
  });
  if (!intent) {
    reply.status(400);
    const err = new Error('No captured payment found for this booking');
    (err as any).statusCode = 400;
    (err as any).code = 'PAYMENT_INTENT_NOT_FOUND';
    throw err;
  }

  // 4. Idempotency: do not create a second refund for the same intent.
  const existingRefund = await prisma.refund.findFirst({
    where: { paymentIntentId: intent.id },
  });
  if (existingRefund) {
    return existingRefund;
  }

  // 5. Validate override amount does not exceed the original payment.
  const maxRefundRupees = intent.amount / 100;
  if (Number(overrideAmount) > maxRefundRupees) {
    reply.status(400);
    const err = new Error(`Override amount cannot exceed original payment of ₹${maxRefundRupees}`);
    (err as any).statusCode = 400;
    (err as any).code = 'AMOUNT_EXCEEDS_PAYMENT';
    throw err;
  }

  const overrideAmountPaise = Math.round(Number(overrideAmount) * 100);

  // 6. Create refund with full audit trail.
  // WHY: overriddenBy is set to adminId extracted from the JWT — not from the request body.
  // This prevents an attacker from claiming to be any admin they choose.
  const refund = await prisma.refund.create({
    data: {
      paymentIntentId: intent.id,
      amount: overrideAmountPaise,
      reason,
      status: 'processed',
      isOverride: true,
      overriddenBy: adminId,
      overrideReason: reason,
      overrideAt: new Date(),
    },
  });

  return refund;
});

// POST /payments/test/simulate-capture
// WHY: Test-only simulation endpoint gated strictly to non-production to keep secrets secure.
// Computes signature over simulated payload using the local RAZORPAY_WEBHOOK_SECRET and calls
// /webhooks/razorpay internally.
server.post('/payments/test/simulate-capture', async (request, reply) => {
  if (process.env.NODE_ENV === 'production') {
    reply.status(404);
    throw new Error('Not Found');
  }

  const { bookingId } = request.body as any;
  if (!bookingId) {
    reply.status(400);
    throw new Error('bookingId is required');
  }

  // 1. Fetch pending intent
  const intent = await prisma.paymentIntent.findFirst({
    where: { referenceId: bookingId },
  });

  if (!intent) {
    reply.status(404);
    throw new Error('Payment intent not found for this booking');
  }

  if (intent.status === 'captured') {
    return { success: true, message: 'Already captured' };
  }

  // 2. Build mock Razorpay webhook payload
  const webhookPayload = {
    id: `evt_sim_${crypto.randomBytes(8).toString('hex')}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: intent.gatewayRef,
          amount: intent.amount
        }
      }
    }
  };

  const rawBody = JSON.stringify(webhookPayload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret';
  
  // Calculate signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const signature = hmac.digest('hex');

  const port = process.env.PORT || 3004;

  // Make internal HTTP post request to our own webhook
  const webhookRes = await fetch(`http://localhost:${port}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature
    },
    body: rawBody
  });

  if (!webhookRes.ok) {
    reply.status(500);
    throw new Error(`Webhook simulation failed with status ${webhookRes.status}`);
  }

  return { success: true };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3004;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Payment service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
