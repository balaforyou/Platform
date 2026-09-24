import { Section, signJwt } from '@badminton/test-harness';
import { slotEngineUrl, paymentUrl, internalKey, futureAlignedHour, TENANT_ID, BRANCH_ID, USER_ID, PaymentContext } from './_fixtures';

const OTHER_BRANCH_ID = 'f295-other-branch';
let windowSeq = 0;

async function freshWindow(poolId: string): Promise<string> {
  windowSeq += 1;
  const start = futureAlignedHour(600 + windowSeq * 2);
  const end = futureAlignedHour(601 + windowSeq * 2);
  const res = await fetch(`${slotEngineUrl}/resource-pools/${poolId}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
  });
  return ((await res.json()) as any).data.id;
}

async function createHeldBooking(poolId: string, price: number): Promise<{ id: string }> {
  const windowId = await freshWindow(poolId);
  const res = await fetch(`${slotEngineUrl}/bookings/negotiated`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `f295-hold-${Date.now()}-${windowSeq}`,
      Authorization: `Bearer ${internalKey}`,
    },
    body: JSON.stringify({
      tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: poolId, windowId,
      userId: USER_ID, negotiatedPrice: price,
    }),
  });
  const booking = ((await res.json()) as any).data;
  if (booking.status !== 'HELD') throw new Error(`F-295 setup: expected HELD booking, got ${booking.status}`);
  return booking;
}

/**
 * F-295 — POST /payment-links: dual-path auth (unchanged, now via the shared
 * requirePaymentLinkAdmin instead of a duplicated inline copy), the F-274 branch-scoping check
 * (copied verbatim from /refunds's own fix), and a new real cross-check that tenantId/userId/
 * amount in the request body actually match the real booking -- previously trusted
 * unconditionally from the client.
 */
export const paymentLinksGuardSections: Section<PaymentContext>[] = [
  {
    name: 'F-295: POST /payment-links — 401/403 auth unchanged, 403 cross-branch (F-274), 400 tenant/user mismatch, 400 amount mismatch, 201 real internal key, 201 real matching-branch admin JWT',
    async run(ctx) {
      const REAL_PRICE = 275;
      const booking = await createHeldBooking(ctx.pool.id, REAL_PRICE);
      const validBody = { bookingId: booking.id, tenantId: TENANT_ID, userId: USER_ID, amount: REAL_PRICE };

      // 1. No auth -> 401 (unchanged behavior, now via the shared requirePaymentLinkAdmin).
      const noAuth = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validBody),
      });
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      // 2. A real, valid JWT with no admin role -> 403 (unchanged).
      const memberJwt = signJwt({ userId: 'f295-member', tenantId: TENANT_ID, roles: [] });
      const nonAdmin = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberJwt}` },
        body: JSON.stringify(validBody),
      });
      if (nonAdmin.status !== 403) throw new Error(`Expected 403 for a non-admin JWT, got ${nonAdmin.status}`);

      // 3. THE F-274 CASE: a real branch_manager JWT scoped to a DIFFERENT branch than the
      //    booking's real branch -> 403, not 201.
      const wrongBranchJwt = signJwt({ userId: 'f295-wrong-mgr', tenantId: TENANT_ID, roles: [`branch_manager:${OTHER_BRANCH_ID}`] });
      const wrongBranch = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrongBranchJwt}` },
        body: JSON.stringify(validBody),
      });
      if (wrongBranch.status !== 403) {
        throw new Error(`Expected 403 for a branch_manager scoped to a different branch, got ${wrongBranch.status}: ${await wrongBranch.text()}`);
      }

      const realBranchJwt = signJwt({ userId: 'f295-real-mgr', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });

      // 4. Real admin, but tenantId/userId in the body don't match the real booking -> 400.
      const mismatchIdentity = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${realBranchJwt}` },
        body: JSON.stringify({ ...validBody, userId: 'f295-someone-else' }),
      });
      if (mismatchIdentity.status !== 400) {
        throw new Error(`Expected 400 for a userId that doesn't match the real booking, got ${mismatchIdentity.status}: ${await mismatchIdentity.text()}`);
      }

      // 5. Real admin, real identity, but amount doesn't match the booking's real price -> 400.
      const mismatchAmount = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${realBranchJwt}` },
        body: JSON.stringify({ ...validBody, amount: REAL_PRICE + 500 }),
      });
      if (mismatchAmount.status !== 400) {
        throw new Error(`Expected 400 for an amount that doesn't match the booking's real price, got ${mismatchAmount.status}: ${await mismatchAmount.text()}`);
      }

      // 6. Real internal key, genuinely matching values -> 201.
      const internalOk = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify(validBody),
      });
      if (internalOk.status !== 201) {
        throw new Error(`Expected 201 for the real internal key with matching values, got ${internalOk.status}: ${await internalOk.text()}`);
      }

      // 7. A SECOND, fresh HELD booking -- real matching-branch admin JWT, genuinely matching
      //    values -> 201. (The first booking is no longer HELD once the internal-key call
      //    above created its payment link — payment-links doesn't itself flip HELD, so it
      //    would still work, but a fresh booking keeps this case independent of step 6.)
      const booking2 = await createHeldBooking(ctx.pool.id, REAL_PRICE);
      const realAdminOk = await fetch(`${paymentUrl}/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${realBranchJwt}` },
        body: JSON.stringify({ bookingId: booking2.id, tenantId: TENANT_ID, userId: USER_ID, amount: REAL_PRICE }),
      });
      if (realAdminOk.status !== 201) {
        throw new Error(`Expected 201 for a real matching-branch admin JWT with matching values, got ${realAdminOk.status}: ${await realAdminOk.text()}`);
      }
      const realAdminBody = (await realAdminOk.json()) as any;
      if (!realAdminBody.data?.paymentLinkId) {
        throw new Error(`Expected a real paymentLinkId back, got ${JSON.stringify(realAdminBody)}`);
      }
    },
  },
];
