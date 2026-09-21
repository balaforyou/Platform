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
 * F-274: branch-scoping fix on POST /refunds/override and POST /refunds.
 *
 * Neither route compared the caller's branch_manager claim against the target booking's real
 * branchId before this fix -- any owner/branch_manager role passed regardless of which branch
 * the booking actually belonged to, the same IDOR class F-071 fixed for slot-engine's
 * booking-scoped routes. Confirmed real callers (RefundsPage in admin-web) never surfaced an
 * out-of-branch booking because GET /bookings/admin is already branch-filtered -- so this
 * exercises the gap directly against the payment routes themselves, not through that UI.
 */

const OTHER_BRANCH_ID = 'f274-other-branch';

async function cancelBooking(bookingId: string) {
  const cancelRes = await fetch(`${slotEngineUrl}/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${internalKey}` },
  });
  const cancelled = ((await cancelRes.json()) as any).data;
  if (cancelled.status !== 'CANCELLED') {
    throw new Error(`F-274 setup: expected CANCELLED, got ${cancelled.status}`);
  }
  return cancelled;
}

export const refundBranchScopingSections: Section<PaymentContext>[] = [
  {
    name: 'F-274: POST /refunds/override rejects a branch_manager scoped to a different branch, accepts the real branch',
    async run(ctx) {
      const booking = await createConfirmedBooking(ctx, 'f274-override-key');
      await cancelBooking(booking.id);

      const wrongBranchManager = signJwt({ userId: 'f274-wrong-mgr', tenantId: TENANT_ID, roles: [`branch_manager:${OTHER_BRANCH_ID}`] });
      const wrongRes = await fetch(`${paymentUrl}/refunds/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrongBranchManager}` },
        body: JSON.stringify({ bookingId: booking.id, overrideAmount: 50, reason: 'F-274 wrong-branch probe' }),
      });
      if (wrongRes.status !== 403) {
        throw new Error(`F-274 /refunds/override: expected 403 for a manager scoped to a different branch, got ${wrongRes.status}`);
      }

      const realBranchManager = signJwt({ userId: 'f274-real-mgr', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });
      const realRes = await fetch(`${paymentUrl}/refunds/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${realBranchManager}` },
        body: JSON.stringify({ bookingId: booking.id, overrideAmount: 50, reason: 'F-274 real-branch override' }),
      });
      if (realRes.status !== 200) {
        throw new Error(`F-274 /refunds/override: expected 200 for the correctly-scoped manager, got ${realRes.status}`);
      }
      const refund = ((await realRes.json()) as any).data;
      if (refund.amount !== 5000 || refund.overriddenBy !== 'f274-real-mgr') {
        throw new Error(`F-274 /refunds/override: unexpected refund shape ${JSON.stringify(refund)}`);
      }
      console.log('F-274 /refunds/override branch-scoping verified: wrong branch 403, real branch 200.');
    },
  },

  {
    name: 'F-274: POST /refunds rejects a branch_manager scoped to a different branch, accepts the real branch (internal key unaffected)',
    async run(ctx) {
      const booking = await createConfirmedBooking(ctx, 'f274-refunds-key');
      await cancelBooking(booking.id);

      const wrongBranchManager = signJwt({ userId: 'f274-wrong-mgr-2', tenantId: TENANT_ID, roles: [`branch_manager:${OTHER_BRANCH_ID}`] });
      const wrongRes = await fetch(`${paymentUrl}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrongBranchManager}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (wrongRes.status !== 403) {
        throw new Error(`F-274 /refunds: expected 403 for a manager scoped to a different branch, got ${wrongRes.status}`);
      }

      const realBranchManager = signJwt({ userId: 'f274-real-mgr-2', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });
      const realRes = await fetch(`${paymentUrl}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${realBranchManager}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (realRes.status !== 200) {
        throw new Error(`F-274 /refunds: expected 200 for the correctly-scoped manager, got ${realRes.status}`);
      }

      // The internal-key/platform path (decoded === null in requirePaymentLinkAdmin) must stay
      // unaffected -- it is the automated cancellation-to-refund continuation this route exists
      // for, and it bypasses requirePaymentLinkAdmin's role check entirely, so there is nothing
      // to branch-scope. Idempotent replay against the same booking proves the internal-key path
      // still resolves cleanly post-fix (returns the same Refund row, no new 403).
      const internalRes = await fetch(`${paymentUrl}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (internalRes.status !== 200) {
        throw new Error(`F-274 /refunds: expected internal-key replay to still return 200, got ${internalRes.status}`);
      }

      const refundCount = await db.refund.count({ where: { paymentIntentId: (await db.paymentIntent.findFirst({ where: { referenceId: booking.id } }))!.id } });
      if (refundCount !== 1) {
        throw new Error(`F-274 /refunds: expected exactly 1 Refund row (idempotent), got ${refundCount}`);
      }
      console.log('F-274 /refunds branch-scoping verified: wrong branch 403, real branch 200, internal-key path unaffected.');
    },
  },
];
