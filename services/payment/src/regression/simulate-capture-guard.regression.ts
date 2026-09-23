import { Section, signJwt } from '@badminton/test-harness';
import { db, paymentUrl, internalKey, userToken, TENANT_ID, BRANCH_ID, USER_ID, PaymentContext } from './_fixtures';

/**
 * F-294 — POST /payments/test/simulate-capture's dual-path guard + booking-ownership check.
 *
 * Real caller: guest-member-pwa's "Simulate Payment" dev-tool (BookingPay.tsx:140) sends the
 * guest/member's own session JWT, never the internal key -- so this needs a dual-path guard
 * (internal key OR valid user JWT) plus the same booking-ownership check every other
 * booking-scoped payment route already enforces (F-045's requireBookingOwnership, reused).
 *
 * The webhook this route drives internally (/webhooks/razorpay) throws (surfacing as this
 * route's own 500) if the downstream Slot Engine confirm call fails -- so a genuine 200
 * success case needs a real, genuinely-confirmable HELD booking, not just a PaymentIntent row.
 */
export const simulateCaptureGuardSections: Section<PaymentContext>[] = [
  {
    name: 'F-294: POST /payments/test/simulate-capture dual-path guard + IDOR ownership check',
    async run() {
      const ownerId = 'f294-real-owner';
      const otherUserId = 'f294-other-user';

      // A real HELD booking is required, not just a PaymentIntent row -- the webhook this
      // route drives internally (/webhooks/razorpay) calls Slot Engine's real
      // POST /bookings/:id/confirm and throws (surfacing as this route's own 500) if that
      // fails, so a genuine 200 success case needs a genuinely confirmable booking.
      const pool = await db.resourcePool.create({
        data: { tenantId: TENANT_ID, branchId: BRANCH_ID, name: 'F294 Guard Pool', allocationMode: 'POOLED', capacity: 4 },
      });
      const start = new Date();
      start.setUTCHours(start.getUTCHours() + 2, 0, 0, 0);
      const window = await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity: 4 },
      });

      const intent = await db.paymentIntent.create({
        data: {
          tenantId: TENANT_ID,
          userId: ownerId,
          amount: 10000,
          purpose: 'guest_booking',
          referenceId: 'f294-guard-booking',
          status: 'pending',
          gatewayRef: `pay_f294_${Date.now()}`,
        },
      });
      await db.booking.create({
        data: {
          id: intent.referenceId,
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
          userId: ownerId, status: 'HELD', heldUntil: new Date(Date.now() + 300000),
        },
      });

      const body = JSON.stringify({ bookingId: intent.referenceId });

      // 1. No auth at all -> 401.
      const noAuth = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      // 2. A syntactically invalid JWT -> 401.
      const invalidJwt = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-jwt' },
        body,
      });
      if (invalidJwt.status !== 401) throw new Error(`Expected 401 with an invalid JWT, got ${invalidJwt.status}`);

      // 3. A real, correctly-signed but genuinely EXPIRED JWT -> 401 (proves expiry is
      //    actually enforced, not just signature shape).
      const expiredJwt = signJwt({ userId: ownerId, tenantId: TENANT_ID, userType: 'GUEST', roles: [] }, -60);
      const expiredRes = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${expiredJwt}` },
        body,
      });
      if (expiredRes.status !== 401) throw new Error(`Expected 401 with an expired JWT, got ${expiredRes.status}`);

      // 4. THE IDOR CASE: a real, valid, unexpired JWT for a DIFFERENT user than the
      //    booking's real owner -> 403, not 200. This is the check that actually matters here.
      const foreignRes = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken(otherUserId, TENANT_ID)}` },
        body,
      });
      if (foreignRes.status !== 403) {
        throw new Error(`Expected 403 for a valid JWT belonging to someone else, got ${foreignRes.status}: ${await foreignRes.text()}`);
      }
      const afterForeignAttempt = await db.paymentIntent.findUnique({ where: { id: intent.id } });
      if (afterForeignAttempt?.status !== 'pending') {
        throw new Error(`A rejected foreign caller must not have advanced the intent, got status ${afterForeignAttempt?.status}`);
      }

      // 5. The real internal key -> 200. Internal callers bypass the ownership check
      //    entirely (same "internal is trusted" convention used elsewhere).
      const internalRes = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body,
      });
      if (internalRes.status !== 200) throw new Error(`Expected 200 with the real internal key, got ${internalRes.status}: ${await internalRes.text()}`);
      const afterInternal = await db.paymentIntent.findUnique({ where: { id: intent.id } });
      if (afterInternal?.status !== 'captured') {
        throw new Error(`Expected the internal-key call to genuinely capture the intent, got status ${afterInternal?.status}`);
      }

      // 6. A second, fresh intent -- this time proven with the REAL booking owner's own
      //    valid JWT (admin-v2/guest-member-pwa's real call shape), no internal key at all.
      const intent2 = await db.paymentIntent.create({
        data: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          amount: 10000,
          purpose: 'guest_booking',
          referenceId: 'f294-guard-booking-2',
          status: 'pending',
          gatewayRef: `pay_f294_owner_${Date.now()}`,
        },
      });
      await db.booking.create({
        data: {
          id: intent2.referenceId,
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
          userId: USER_ID, status: 'HELD', heldUntil: new Date(Date.now() + 300000),
        },
      });
      const ownerRes = await fetch(`${paymentUrl}/payments/test/simulate-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken(USER_ID, TENANT_ID)}` },
        body: JSON.stringify({ bookingId: intent2.referenceId }),
      });
      if (ownerRes.status !== 200) throw new Error(`Expected 200 for the real booking owner's own JWT, got ${ownerRes.status}: ${await ownerRes.text()}`);
      const afterOwner = await db.paymentIntent.findUnique({ where: { id: intent2.id } });
      if (afterOwner?.status !== 'captured') {
        throw new Error(`Expected the owner's own JWT call to genuinely capture the intent, got status ${afterOwner?.status}`);
      }

      await db.paymentIntent.deleteMany({ where: { id: { in: [intent.id, intent2.id] } } });
      await db.booking.deleteMany({ where: { id: { in: [intent.referenceId, intent2.referenceId] } } });
      await db.availabilityWindow.deleteMany({ where: { id: window.id } });
      await db.resourcePool.deleteMany({ where: { id: pool.id } });
    },
  },
];
