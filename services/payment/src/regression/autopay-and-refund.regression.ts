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
  USER_ID,
} from './_fixtures';

/**
 * MEMBER AUTOPAY SELF-HEALING AND DIRECT REFUND EXECUTION.
 * Migrated verbatim from payment.test.ts Tests 5 and 7.
 */
export const autopayAndRefundSections: Section<PaymentContext>[] = [
  {
    name: 'Member AutoPay billing (charge_failed → suspended, charged → active recovery)',
    async run() {
      const mandateId = 'mandate_mock_123';

      const subRes = await fetch(`${paymentUrl}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: TENANT_ID, userId: USER_ID, mandateId, amount: 15000 }),
      });
      const sub = ((await subRes.json()) as any).data;
      if (sub.status !== 'active') {
        throw new Error('Mandate registration failed.');
      }

      const dispatchAutopay = async (event: string, idPrefix: string) => {
        const payload = {
          id: `${idPrefix}_` + crypto.randomBytes(4).toString('hex'),
          event,
          payload: { subscription: { entity: { id: mandateId } } },
        };
        const payloadStr = JSON.stringify(payload);
        return fetch(`${paymentUrl}/webhooks/razorpay/autopay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Razorpay-Signature': generateRazorpaySignature(payloadStr, webhookSecret),
          },
          body: payloadStr,
        });
      };

      await dispatchAutopay('subscription.charge_failed', 'evt_fail');
      const suspendedSub = await db.subscription.findUnique({ where: { id: sub.id } });
      if (suspendedSub?.status !== 'suspended') {
        throw new Error(`Expected suspended status, got ${suspendedSub?.status}`);
      }
      console.log('Subscription suspended successfully on debit failure.');

      // Self-healing: a later successful charge must restore the subscription.
      await dispatchAutopay('subscription.charged', 'evt_success');
      const activeSub = await db.subscription.findUnique({ where: { id: sub.id } });
      if (activeSub?.status !== 'active') {
        throw new Error(`Expected active status post-recovery, got ${activeSub?.status}`);
      }
      console.log('Subscription recovered back to active successfully on successful retry webhook.');
    },
  },

  {
    name: 'Direct refund execution uses Slot Engine\'s tiered-policy refundAmount (125.00 → 12500 paise, processed)',
    async run(ctx) {
      if (!ctx.bookingConfirmed) {
        throw new Error('Webhook confirmation section must run before the refund section.');
      }

      const cancelRes = await fetch(`${slotEngineUrl}/bookings/${ctx.bookingConfirmed.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      const cancelledBooking = ((await cancelRes.json()) as any).data;
      if (cancelledBooking.status !== 'CANCELLED' || Number(cancelledBooking.refundAmount) !== 125.0) {
        throw new Error(
          `Setup failed: Expected CANCELLED booking and 125.00 refundAmount, got status ${cancelledBooking.status} and refund ${cancelledBooking.refundAmount}`,
        );
      }
      console.log(`Booking cancelled in Slot Engine. Computed refundAmount: ${cancelledBooking.refundAmount}`);

      const refundRes = await fetch(`${paymentUrl}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: ctx.bookingConfirmed.id }),
      });
      const refund = ((await refundRes.json()) as any).data;

      if (refund.amount !== 12500 || refund.status !== 'processed') {
        throw new Error(
          `Expected refund status processed and amount 12500 paise, got status ${refund.status} and amount ${refund.amount}`,
        );
      }
      console.log('Refund executed successfully using the pre-calculated refundAmount from Slot Engine.');
    },
  },
];
