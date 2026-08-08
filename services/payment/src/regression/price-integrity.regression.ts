import { Section, inspect } from '@badminton/test-harness';
import {
  db,
  slotEngineUrl,
  paymentUrl,
  bookingHeaders,
  paymentHeaders,
  PaymentContext,
  BRANCH_ID,
  USER_ID,
} from './_fixtures';

/** A second, unrelated user used to prove cross-user access is refused. */
const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999';

/**
 * PRICE INTEGRITY — the Phase 4 trust boundary — and the F-045 identity
 * boundary on the two payment endpoints.
 *
 * Price sections migrated from payment.test.ts Tests 1 and 6. Identity sections
 * are new with F-045: /payments/intents had no auth at all, and
 * /payments/create-order verified a token but never checked it owned the booking.
 */
export const priceIntegritySections: Section<PaymentContext>[] = [
  {
    name: 'Server-side pricing ignores a client-supplied price (spoofed 5.00 → resolved 125.00)',
    async run(ctx) {
      const bookingRes = await fetch(`${slotEngineUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID, 'pricing-spoof-booking-key'),
        body: JSON.stringify({
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pool.id,
          windowId: ctx.window.id,
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
        headers: bookingHeaders(USER_ID, 'dup-intent-hold-key'),
        body: JSON.stringify({
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pool.id,
          windowId: ctx.window.id,
        }),
      });
      const bookingHold = ((await bookingHoldRes.json()) as any).data;
      ctx.dupIntentBookingId = bookingHold.id;

      const intentRes1 = await fetch(`${paymentUrl}/payments/intents`, {
        method: 'POST',
        headers: paymentHeaders(USER_ID),
        body: JSON.stringify({ bookingId: bookingHold.id }),
      });
      const intent1 = ((await intentRes1.json()) as any).data;

      const intentRes2 = await fetch(`${paymentUrl}/payments/intents`, {
        method: 'POST',
        headers: paymentHeaders(USER_ID),
        body: JSON.stringify({ bookingId: bookingHold.id }),
      });
      const intent2 = ((await intentRes2.json()) as any).data;

      if (intent1.id !== intent2.id) {
        throw new Error('Created duplicate PaymentIntent records for same booking hold.');
      }
      console.log('Duplicate prevention successfully returned existing pending intent.');
    },
  },

  {
    name: 'F-045: /payments/intents requires auth and refuses another user\'s booking',
    async run(ctx) {
      if (!ctx.dupIntentBookingId) {
        throw new Error('Duplicate-prevention section must run first to provide a booking id.');
      }

      // (a) No token at all — this endpoint previously had NO auth whatsoever.
      const noAuth = await inspect(
        await fetch(`${paymentUrl}/payments/intents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: ctx.dupIntentBookingId }),
        }),
      );
      console.log(
        'PAYMENT_IDENTITY_EVIDENCE intent_unauthenticated_rejected',
        JSON.stringify({ status: noAuth.status, body: noAuth.json }),
      );
      if (noAuth.status !== 401) {
        throw new Error(`Expected 401 for unauthenticated intent creation, got ${noAuth.status}`);
      }

      // (b) A valid token belonging to someone else, against USER_ID's booking.
      // This hits the EXISTING-intent branch, which is why ownership is checked
      // above that early return rather than after it.
      const crossUser = await inspect(
        await fetch(`${paymentUrl}/payments/intents`, {
          method: 'POST',
          headers: paymentHeaders(OTHER_USER_ID),
          body: JSON.stringify({ bookingId: ctx.dupIntentBookingId }),
        }),
      );
      console.log(
        'PAYMENT_IDENTITY_EVIDENCE intent_cross_user_rejected',
        JSON.stringify({
          status: crossUser.status,
          callerUserId: OTHER_USER_ID,
          bookingOwner: USER_ID,
          body: crossUser.json,
        }),
      );
      if (crossUser.status !== 403) {
        throw new Error(`Expected 403 for cross-user intent access, got ${crossUser.status}`);
      }

      // The foreign caller must not have learned the intent's contents.
      if (crossUser.raw.includes('gatewayRef') || crossUser.raw.includes('pay_mock')) {
        throw new Error(`Rejection leaked intent details: ${crossUser.raw}`);
      }
    },
  },

  {
    name: 'F-045: /payments/create-order requires bookingId and refuses another user\'s booking',
    async run(ctx) {
      if (!ctx.dupIntentBookingId) {
        throw new Error('Duplicate-prevention section must run first to provide a booking id.');
      }

      // (a) bookingId omitted — previously optional, which made "omit it" a
      // way to skip the ownership check entirely.
      const missing = await inspect(
        await fetch(`${paymentUrl}/payments/create-order`, {
          method: 'POST',
          headers: paymentHeaders(USER_ID),
          body: JSON.stringify({ amount: 12500, currency: 'INR' }),
        }),
      );
      console.log(
        'PAYMENT_IDENTITY_EVIDENCE order_missing_bookingid_rejected',
        JSON.stringify({ status: missing.status, body: missing.json }),
      );
      if (missing.status !== 400) {
        throw new Error(`Expected 400 when bookingId is omitted, got ${missing.status}`);
      }

      // (b) Someone else's booking.
      const crossUser = await inspect(
        await fetch(`${paymentUrl}/payments/create-order`, {
          method: 'POST',
          headers: paymentHeaders(OTHER_USER_ID),
          body: JSON.stringify({
            bookingId: ctx.dupIntentBookingId,
            amount: 12500,
            currency: 'INR',
            receipt: ctx.dupIntentBookingId,
          }),
        }),
      );
      console.log(
        'PAYMENT_IDENTITY_EVIDENCE order_cross_user_rejected',
        JSON.stringify({
          status: crossUser.status,
          callerUserId: OTHER_USER_ID,
          bookingOwner: USER_ID,
          body: crossUser.json,
        }),
      );
      if (crossUser.status !== 403) {
        throw new Error(`Expected 403 for cross-user order creation, got ${crossUser.status}`);
      }

      // No Razorpay order may have been created for the foreign caller.
      if (crossUser.raw.includes('order_')) {
        throw new Error(`Rejection leaked an order id: ${crossUser.raw}`);
      }

      // (c) Unauthenticated.
      const noAuth = await inspect(
        await fetch(`${paymentUrl}/payments/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: ctx.dupIntentBookingId, amount: 12500 }),
        }),
      );
      if (noAuth.status !== 401) {
        throw new Error(`Expected 401 for unauthenticated order creation, got ${noAuth.status}`);
      }

      // (d) The rightful owner must PASS the gate rather than be turned away.
      //
      // WHY THIS ASSERTS "not rejected" INSTEAD OF 200: create-order's success
      // path calls Razorpay's live API (razorpayClient.orders.create). This
      // suite runs offline against a local stack with no Razorpay connectivity,
      // so the owner's request legitimately ends in a 500 from that outbound
      // call. That 500 is thrown well AFTER the auth and ownership checks, so
      // reaching it is itself proof the owner was admitted — which is exactly
      // the F-045 property under test. Asserting a 200 here would make the
      // suite depend on a third-party network call, and is the reason this
      // endpoint had no regression coverage before now. A real end-to-end
      // order against live Razorpay remains manual (see F-008/F-027).
      const owner = await inspect(
        await fetch(`${paymentUrl}/payments/create-order`, {
          method: 'POST',
          headers: paymentHeaders(USER_ID),
          body: JSON.stringify({
            bookingId: ctx.dupIntentBookingId,
            amount: 12500,
            currency: 'INR',
            receipt: ctx.dupIntentBookingId,
          }),
        }),
      );
      console.log(
        'PAYMENT_IDENTITY_EVIDENCE order_owner_passed_gate',
        JSON.stringify({ status: owner.status, body: owner.json }),
      );
      if ([400, 401, 403].includes(owner.status)) {
        throw new Error(
          `The booking's own owner was rejected by the identity gate with ${owner.status}: ${owner.raw}`,
        );
      }
      if (owner.status === 200) {
        // Razorpay was reachable — then the intent must point at the new order.
        const intent = await db.paymentIntent.findFirst({
          where: { referenceId: ctx.dupIntentBookingId },
        });
        const orderId = (owner.json?.data ?? owner.json)?.order_id;
        if (!orderId || intent?.gatewayRef !== orderId) {
          throw new Error(`Expected intent.gatewayRef to be updated to ${orderId}, got ${intent?.gatewayRef}`);
        }
      }
    },
  },

  {
    name: 'F-049: create-order charges the stored intent amount, never the client-supplied one',
    async run(ctx) {
      if (!ctx.dupIntentBookingId) {
        throw new Error('Duplicate-prevention section must run first to provide a booking id.');
      }

      const intentBefore = await db.paymentIntent.findFirst({
        where: { referenceId: ctx.dupIntentBookingId },
      });
      if (!intentBefore) throw new Error('Expected a PaymentIntent for the seeded booking.');

      // The booking is ₹125.00 → 12500 paise, resolved server-side by resolvePrice
      // (which also honours any window-level pricing override).
      if (intentBefore.amount !== 12500) {
        throw new Error(`Expected authoritative amount 12500 paise, got ${intentBefore.amount}`);
      }

      // The owner attempts to pay ₹1.00 for a ₹125.00 booking.
      const tampered = await inspect(
        await fetch(`${paymentUrl}/payments/create-order`, {
          method: 'POST',
          headers: paymentHeaders(USER_ID),
          body: JSON.stringify({
            bookingId: ctx.dupIntentBookingId,
            amount: 100, // 100 paise = ₹1.00
            currency: 'INR',
            receipt: ctx.dupIntentBookingId,
          }),
        }),
      );

      console.log(
        'PAYMENT_AMOUNT_EVIDENCE tampered_amount_not_charged',
        JSON.stringify({
          status: tampered.status,
          bookingId: ctx.dupIntentBookingId,
          intentId: intentBefore.id,
          clientSuppliedAmount: 100,
          authoritativeAmount: intentBefore.amount,
        }),
      );

      // The tampered value must never become the charge. Not rejected — overridden.
      if ([400, 401, 403].includes(tampered.status)) {
        throw new Error(
          `The booking's owner was rejected rather than having the amount overridden: ${tampered.status} ${tampered.raw}`,
        );
      }
      if (tampered.status === 200) {
        const charged = (tampered.json?.data ?? tampered.json)?.amount;
        if (Number(charged) !== intentBefore.amount) {
          throw new Error(
            `Razorpay order was created for ${charged}, expected the authoritative ${intentBefore.amount}`,
          );
        }
      }

      // The stored amount must be untouched by the attempt, whatever happened upstream.
      const intentAfter = await db.paymentIntent.findFirst({
        where: { referenceId: ctx.dupIntentBookingId },
      });
      if (intentAfter?.amount !== intentBefore.amount) {
        throw new Error(
          `Stored intent amount changed from ${intentBefore.amount} to ${intentAfter?.amount} — a client-supplied amount leaked into storage`,
        );
      }
    },
  },

];
