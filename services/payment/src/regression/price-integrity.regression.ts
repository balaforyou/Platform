import { Section } from '@badminton/test-harness';
import { slotEngineUrl, paymentUrl, PaymentContext, TENANT_ID, BRANCH_ID, USER_ID } from './_fixtures';

/**
 * PRICE INTEGRITY — the Phase 4 trust boundary.
 * Migrated verbatim from payment.test.ts Tests 1 and 6.
 */
export const priceIntegritySections: Section<PaymentContext>[] = [
  {
    name: 'Server-side pricing ignores a client-supplied price (spoofed 5.00 → resolved 125.00)',
    async run(ctx) {
      const bookingRes = await fetch(`${slotEngineUrl}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': 'pricing-spoof-booking-key',
        },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pool.id,
          windowId: ctx.window.id,
          userId: USER_ID,
          price: 5.0, // Spoofed client-side value — must be discarded.
        }),
      });
      const booking = ((await bookingRes.json()) as any).data;

      if (Number(booking.price) !== 125.0) {
        throw new Error(`Expected server resolved price of 125.00, got ${booking.price}`);
      }
      console.log('Server successfully resolved ResourcePool.basePrice (125.00) and ignored client-supplied price.');
    },
  },

  {
    name: 'PaymentIntent duplicate prevention (two creates for one hold → identical intent id)',
    async run(ctx) {
      const bookingHoldRes = await fetch(`${slotEngineUrl}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': 'dup-intent-hold-key',
        },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pool.id,
          windowId: ctx.window.id,
          userId: USER_ID,
        }),
      });
      const bookingHold = ((await bookingHoldRes.json()) as any).data;

      const intentRes1 = await fetch(`${paymentUrl}/payments/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingHold.id }),
      });
      const intent1 = ((await intentRes1.json()) as any).data;

      const intentRes2 = await fetch(`${paymentUrl}/payments/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingHold.id }),
      });
      const intent2 = ((await intentRes2.json()) as any).data;

      if (intent1.id !== intent2.id) {
        throw new Error('Created duplicate PaymentIntent records for same booking hold.');
      }
      console.log('Duplicate prevention successfully returned existing pending intent.');
    },
  },
];
