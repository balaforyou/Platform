import { Section, signJwt, expectForbidden } from '@badminton/test-harness';
import {
  db,
  slotEngineUrl,
  paymentUrl,
  futureAlignedHour,
  PaymentContext,
  TENANT_ID,
  BRANCH_ID,
  USER_ID,
} from './_fixtures';

/**
 * NEGOTIATED PAYMENT-LINK ORCHESTRATION.
 * Migrated verbatim from payment.test.ts Test 6B.
 *
 * Covers both the idempotency contract (one booking + one intent across a
 * retry with the same Idempotency-Key) and the admin-only trust boundary
 * (a member JWT must be rejected).
 */
export const negotiatedLinkSections: Section<PaymentContext>[] = [
  {
    name: 'Negotiated payment-link idempotency (retry → same booking/intent, exactly one row each) + member JWT 403',
    async run(ctx) {
      const negotiatedWindowRes = await fetch(
        `${slotEngineUrl}/resource-pools/${ctx.pool.id}/availability-windows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: futureAlignedHour(72).toISOString(),
            endTime: futureAlignedHour(73).toISOString(),
            capacity: 5,
          }),
        },
      );
      const negotiatedWindow = ((await negotiatedWindowRes.json()) as any).data;

      const ownerJwt = signJwt({ userId: 'admin-owner', roles: ['owner'] });
      const negotiatedKey = 'negotiated-payment-link-key';
      const negotiatedBody = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        resourcePoolId: ctx.pool.id,
        windowId: negotiatedWindow.id,
        userId: USER_ID,
        negotiatedPrice: 222,
        coPlayers: ['9876543210'],
        description: 'Admin negotiated test booking',
      };

      const postNegotiated = (jwt: string, idempotencyKey: string) =>
        fetch(`${paymentUrl}/payment-links/negotiated`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(negotiatedBody),
        });

      const negotiatedRes1 = await postNegotiated(ownerJwt, negotiatedKey);
      if (negotiatedRes1.status !== 201) {
        throw new Error(`Expected negotiated orchestration 201, got ${negotiatedRes1.status}`);
      }
      const negotiated1 = ((await negotiatedRes1.json()) as any).data;

      const negotiatedRes2 = await postNegotiated(ownerJwt, negotiatedKey);
      if (negotiatedRes2.status !== 200) {
        throw new Error(`Expected negotiated retry 200, got ${negotiatedRes2.status}`);
      }
      const negotiated2 = ((await negotiatedRes2.json()) as any).data;

      if (
        negotiated1.booking.id !== negotiated2.booking.id ||
        negotiated1.paymentLink.intentId !== negotiated2.paymentLink.intentId
      ) {
        throw new Error('Retry did not return the same booking and payment intent.');
      }

      const duplicateBookingCount = await db.booking.count({ where: { idempotencyKey: negotiatedKey } });
      const duplicateIntentCount = await db.paymentIntent.count({ where: { referenceId: negotiated1.booking.id } });
      if (duplicateBookingCount !== 1 || duplicateIntentCount !== 1) {
        throw new Error(
          `Expected one booking and one intent, got ${duplicateBookingCount} bookings and ${duplicateIntentCount} intents.`,
        );
      }

      // Admin-only endpoint: a member token must not orchestrate a negotiated link.
      const memberJwt = signJwt({ userId: 'member-user', roles: ['member'] });
      const forbiddenNegotiatedRes = await postNegotiated(memberJwt, 'negotiated-member-forbidden');
      await expectForbidden(forbiddenNegotiatedRes, 'member JWT creating a negotiated payment link');

      console.log('Negotiated orchestration returned one booking/payment link across retry and rejected member JWT.');
    },
  },
];
