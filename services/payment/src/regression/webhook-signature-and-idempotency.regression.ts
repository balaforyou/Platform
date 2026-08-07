import crypto from 'crypto';
import { Section } from '@badminton/test-harness';
import {
  db,
  slotEngineUrl,
  paymentUrl,
  internalKey,
  webhookSecret,
  generateRazorpaySignature,
  PaymentContext,
  TENANT_ID,
  BRANCH_ID,
  USER_ID,
} from './_fixtures';

/**
 * WEBHOOK SIGNATURE, IDEMPOTENCY, AND THE FULL CAPTURE → CONFIRM CHAIN.
 * Migrated verbatim from payment.test.ts Tests 2, 3 and 4.
 */
export const webhookSignatureAndIdempotencySections: Section<PaymentContext>[] = [
  {
    name: 'Webhook signature validation (invalid → 400, valid → 200)',
    async run(ctx) {
      const payload = {
        id: 'evt_mock123',
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_mock123', amount: 12500, status: 'captured' } },
        },
      };
      const payloadStr = JSON.stringify(payload);

      const resInvalidSig = await fetch(`${paymentUrl}/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'invalid-signature-value' },
        body: payloadStr,
      });
      if (resInvalidSig.status !== 400) {
        throw new Error(`Expected invalid signature to return 400, got ${resInvalidSig.status}`);
      }

      const validSig = generateRazorpaySignature(payloadStr, webhookSecret);
      const resValidSig = await fetch(`${paymentUrl}/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': validSig },
        body: payloadStr,
      });
      if (resValidSig.status !== 200) {
        throw new Error(`Expected valid signature to return 200, got ${resValidSig.status}`);
      }

      // Handed to the idempotency section, which replays this exact event.
      ctx.validSig = validSig;
      ctx.payloadStr = payloadStr;
      console.log('Webhook signature validation verified (invalid signature rejected, valid accepted).');
    },
  },

  {
    name: 'Webhook idempotency (replayed event id → 200 with duplicated: true, no double-processing)',
    async run(ctx) {
      if (!ctx.validSig || !ctx.payloadStr) {
        throw new Error('Signature section must run before idempotency replay.');
      }

      const resDup = await fetch(`${paymentUrl}/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': ctx.validSig },
        body: ctx.payloadStr,
      });
      if (resDup.status !== 200) {
        throw new Error(`Expected duplicate webhook to return 200, got ${resDup.status}`);
      }
      const dupBody = (await resDup.json()) as any;
      if (dupBody.data?.duplicated !== true) {
        throw new Error(`Expected duplicated response flag to be true, got ${JSON.stringify(dupBody)}`);
      }
      console.log('Webhook idempotency successfully intercepted duplicate event (no double-processing).');
    },
  },

  {
    name: 'E2E webhook booking confirmation (HELD → CONFIRMED, PaymentIntent → captured)',
    async run(ctx) {
      const holdRes = await fetch(`${slotEngineUrl}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': 'e2e-payment-hold-key' },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pool.id,
          windowId: ctx.window.id,
          userId: USER_ID,
        }),
      });
      const holdBooking = ((await holdRes.json()) as any).data;
      if (holdBooking.status !== 'HELD') {
        throw new Error(`Setup failed: Expected HELD booking, got ${holdBooking.status}`);
      }

      const intentRes = await fetch(`${paymentUrl}/payments/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: holdBooking.id }),
      });
      const intent = ((await intentRes.json()) as any).data;

      const capturePayload = {
        id: 'evt_capture_' + crypto.randomBytes(4).toString('hex'),
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: intent.gatewayRef, amount: intent.amount, status: 'captured' } },
        },
      };
      const capturePayloadStr = JSON.stringify(capturePayload);
      const captureSig = generateRazorpaySignature(capturePayloadStr, webhookSecret);

      const webhookRes = await fetch(`${paymentUrl}/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': captureSig },
        body: capturePayloadStr,
      });
      if (webhookRes.status !== 200) {
        throw new Error(`Webhook dispatch failed with status ${webhookRes.status}`);
      }

      const bookingConfirmRes = await fetch(`${slotEngineUrl}/bookings/${holdBooking.id}`, {
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      const bookingConfirmed = ((await bookingConfirmRes.json()) as any).data;
      if (bookingConfirmed.status !== 'CONFIRMED') {
        throw new Error(`Expected booking status to transition to CONFIRMED, got ${bookingConfirmed.status}`);
      }

      const updatedIntent = await db.paymentIntent.findUnique({ where: { id: intent.id } });
      if (updatedIntent?.status !== 'captured') {
        throw new Error(`Expected PaymentIntent status captured, got ${updatedIntent?.status}`);
      }

      // The refund section cancels and refunds this exact booking.
      ctx.bookingConfirmed = bookingConfirmed;
      console.log(
        'E2E payment flow successful. Webhook captured payment and transitioned Slot Engine booking HELD -> CONFIRMED.',
      );
    },
  },
];
