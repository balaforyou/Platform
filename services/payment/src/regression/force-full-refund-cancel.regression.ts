import { Section, signJwt } from '@badminton/test-harness';
import {
  db,
  slotEngineUrl,
  paymentUrl,
  internalKey,
  createConfirmedBooking,
  PaymentContext,
  TENANT_ID,
  BRANCH_ID,
} from './_fixtures';

/**
 * F-275: POST /bookings/:id/cancel's forceFullRefund -- the system-initiated, unconditional
 * 100% refund F-207.2's relocate/cancel sweep needs. internal-key-only; a JWT caller sending
 * forceFullRefund is rejected outright, never silently ignored. Composes with the existing,
 * unmodified POST /refunds (F-274-fixed, still branch-scoped for a JWT caller, still bypassed
 * for internal-key) exactly as designed: force-cancel sets refundAmount to the full price,
 * /refunds reads that back and creates the Refund row -- zero changes needed to /refunds itself.
 */
export const forceFullRefundCancelSections: Section<PaymentContext>[] = [
  {
    name: 'F-275: forceFullRefund is rejected outright for a JWT caller (owner), never silently ignored',
    async run(ctx) {
      // F-184: a distinct userId, not the shared USER_ID -- by this point in the suite USER_ID
      // is already at (or near) the default 3-bookings/day cap from earlier sections, and this
      // section's job is testing the auth rejection, not fighting that unrelated limit.
      const booking = await createConfirmedBooking(ctx, 'f275-jwt-reject-key', 'f275-jwt-reject-user');

      const ownerJwt = signJwt({ userId: 'f275-owner', tenantId: TENANT_ID, roles: ['owner'] });
      const res = await fetch(`${slotEngineUrl}/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ forceFullRefund: true, reason: 'F-275 JWT probe' }),
      });
      if (res.status !== 403) {
        throw new Error(`F-275: expected 403 for a JWT caller sending forceFullRefund, got ${res.status}`);
      }
      const body = (await res.json()) as any;
      if (body.error?.code !== 'FORCE_REFUND_INTERNAL_ONLY') {
        throw new Error(`F-275: expected FORCE_REFUND_INTERNAL_ONLY, got ${JSON.stringify(body.error)}`);
      }

      // Confirmed still CONFIRMED, not left in some half-applied state -- the rejection is total.
      const stillConfirmed = await db.booking.findUnique({ where: { id: booking.id } });
      if (stillConfirmed?.status !== 'CONFIRMED') {
        throw new Error(`F-275: booking should be untouched after the rejected call, got status ${stillConfirmed?.status}`);
      }
      console.log('F-275 JWT-caller rejection verified: 403 FORCE_REFUND_INTERNAL_ONLY, booking left untouched.');
    },
  },

  {
    name: 'F-275: internal-key forceFullRefund composes with the unmodified POST /refunds end-to-end (full price, not the tiered amount)',
    async run(ctx) {
      const booking = await createConfirmedBooking(ctx, 'f275-compose-key', 'f275-compose-user');
      const fullPricePaise = Math.round(Number(booking.price) * 100);

      // ctx's booking rule (setupBaseFixtures) gives 100% only >=24h out and this window is 48h
      // out, so the ordinary tiered path would ALSO compute the full price here -- not a useful
      // distinguishing test. Force a policy that would tier it down to 0% if forceFullRefund did
      // NOT actually bypass tiering, so a passing test proves the bypass, not a coincidence.
      // Restored afterward -- ctx.pool's rule is shared with every section that runs later in
      // this suite, so leaving the 0%-tier override in place would silently break them.
      const originalRule = await db.bookingRule.findFirst({ where: { resourcePoolId: ctx.pool.id }, orderBy: { createdAt: 'asc' } });
      await db.bookingRule.updateMany({
        where: { resourcePoolId: ctx.pool.id },
        data: { cancellationPolicyJson: { type: 'tiered', tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }] } },
      });

      try {
        const cancelRes = await fetch(`${slotEngineUrl}/bookings/${booking.id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ forceFullRefund: true, reason: 'displaced by Member contract assignment f275-test' }),
        });
        if (cancelRes.status !== 200) {
          throw new Error(`F-275: expected 200 on internal-key forceFullRefund cancel, got ${cancelRes.status}`);
        }
        const cancelled = ((await cancelRes.json()) as any).data;
        if (cancelled.status !== 'CANCELLED') {
          throw new Error(`F-275: expected CANCELLED, got ${cancelled.status}`);
        }
        if (Math.round(Number(cancelled.refundAmount) * 100) !== fullPricePaise) {
          throw new Error(
            `F-275: expected refundAmount to be the full price (${fullPricePaise} paise) despite the 0%-tier policy, got ${cancelled.refundAmount}`,
          );
        }

        // Same unmodified POST /refunds F-274 already covers -- no forceFullRefund-specific
        // handling needed there, since it already just refunds whatever refundAmount says.
        const refundRes = await fetch(`${paymentUrl}/refunds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ bookingId: booking.id }),
        });
        if (refundRes.status !== 200) {
          throw new Error(`F-275: expected /refunds 200, got ${refundRes.status}`);
        }
        const refund = ((await refundRes.json()) as any).data;
        if (refund.amount !== fullPricePaise || refund.status !== 'processed') {
          throw new Error(`F-275: expected Refund.amount ${fullPricePaise} paise processed, got ${JSON.stringify(refund)}`);
        }
        console.log('F-275 composition chain verified: force-cancel -> unmodified /refunds -> Refund.amount is the full price, not the 0%-tiered amount.');
      } finally {
        // Restore regardless of pass/fail -- later sections in this suite share ctx.pool.
        if (originalRule) {
          await db.bookingRule.updateMany({
            where: { resourcePoolId: ctx.pool.id },
            data: { cancellationPolicyJson: originalRule.cancellationPolicyJson as any },
          });
        }
      }
    },
  },
];
