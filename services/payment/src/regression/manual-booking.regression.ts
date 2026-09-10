import { Section, signJwt, inspect } from '@badminton/test-harness';
import {
  db,
  slotEngineUrl,
  paymentUrl,
  internalKey,
  futureAlignedHour,
  PaymentContext,
  TENANT_ID,
  BRANCH_ID,
  USER_ID,
} from './_fixtures';

/**
 * MANUAL / WALK-IN BOOKING — F-229 Step 3
 *
 * POST /bookings/manual, three payment methods:
 *  - cash / upi_qr : HELD negotiated booking -> PaymentIntent written already `captured`
 *    -> slot-engine POST /bookings/:id/confirm (the exact call the Razorpay webhook makes).
 *  - razorpay_link : thin pass-through, identical to /payment-links/negotiated.
 *
 * Covers the retry / collision branches the reviewer flagged:
 *  - cash retry (same Idempotency-Key)              -> same booking + same intent, one row
 *  - upi_qr resubmit, same booking                  -> same intent, one row
 *  - upi_qr with the same txn id on a DIFFERENT booking -> 409, second booking NOT confirmed
 */

const ownerJwt = `Bearer ${signJwt({ userId: 'manual-owner', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' })}`;
const wrongBranchMgrJwt = `Bearer ${signJwt({ userId: 'manual-mgr', tenantId: TENANT_ID, roles: ['branch_manager:99999999-9999-9999-9999-999999999999'], userType: 'MEMBER' })}`;
const nonAdminJwt = `Bearer ${signJwt({ userId: 'manual-member', tenantId: TENANT_ID, roles: [], userType: 'MEMBER' })}`;

let windowSeq = 0;
async function freshWindow(): Promise<string> {
  windowSeq += 1;
  const start = futureAlignedHour(200 + windowSeq * 2);
  const end = futureAlignedHour(201 + windowSeq * 2);
  const res = await fetch(`${slotEngineUrl}/resource-pools/${POOL_ID}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 5 }),
  });
  return ((await res.json()) as any).data.id;
}

let POOL_ID = '';

const manual = (body: unknown, key: string, auth: string = `Bearer ${internalKey}`) =>
  fetch(`${paymentUrl}/bookings/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, Authorization: auth },
    body: JSON.stringify(body),
  });

const baseBody = (windowId: string, extra: Record<string, unknown>) => ({
  tenantId: TENANT_ID,
  branchId: BRANCH_ID,
  resourcePoolId: POOL_ID,
  windowId,
  userId: USER_ID,
  negotiatedPrice: 240,
  ...extra,
});

export const manualBookingSections: Section<PaymentContext>[] = [
  {
    name: 'F-229 /bookings/manual — cash: HELD->CONFIRMED via the real confirm route, PaymentIntent captured with cash_ ref and correct paise',
    async run(ctx) {
      POOL_ID = ctx.pool.id;

      // Standalone before/after demonstration of the primitive this route composes.
      const holdWin = await freshWindow();
      const heldRes = await inspect(await fetch(`${slotEngineUrl}/bookings/negotiated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'f229-standalone-hold', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: POOL_ID, windowId: holdWin, userId: USER_ID, negotiatedPrice: 100 }),
      }));
      const heldId = heldRes.json.data.id;
      const beforeStatus = (await db.booking.findUnique({ where: { id: heldId } }))?.status;
      await fetch(`${slotEngineUrl}/bookings/${heldId}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` }, body: '{}',
      });
      const afterStatus = (await db.booking.findUnique({ where: { id: heldId } }))?.status;
      console.log(`MANUAL_EVIDENCE standalone_confirm before=${beforeStatus} after=${afterStatus}`);
      if (beforeStatus !== 'HELD' || afterStatus !== 'CONFIRMED') {
        throw new Error(`standalone confirm primitive: expected HELD->CONFIRMED, got ${beforeStatus}->${afterStatus}`);
      }

      const win = await freshWindow();
      const res = await inspect(await manual(baseBody(win, { paymentMethod: 'cash' }), 'f229-cash-1'));
      console.log('MANUAL_EVIDENCE cash', JSON.stringify(res.json));
      if (res.status !== 201) throw new Error(`expected 201, got ${res.raw}`);

      const bookingId = res.json.data.booking.id;
      const bk = await db.booking.findUnique({ where: { id: bookingId } });
      if (bk?.status !== 'CONFIRMED') throw new Error(`booking not CONFIRMED: ${JSON.stringify(bk)}`);

      const pi = await db.paymentIntent.findFirst({ where: { referenceId: bookingId } });
      if (
        !pi || pi.status !== 'captured' || pi.amount !== 24000 ||
        !pi.gatewayRef.startsWith('cash_') || pi.referenceId !== bookingId || pi.purpose !== 'guest_booking'
      ) {
        throw new Error(`PaymentIntent wrong: ${JSON.stringify(pi)}`);
      }
      if (res.json.data.payment.method !== 'cash' || res.json.data.payment.amount !== 24000) {
        throw new Error(`response payment block wrong: ${res.raw}`);
      }
    },
  },
  {
    name: 'F-229 /bookings/manual — cash retry (same Idempotency-Key + body): same booking + same intent, exactly one intent row, still CONFIRMED',
    async run() {
      const win = await freshWindow();
      const body = baseBody(win, { paymentMethod: 'cash' });
      const first = await inspect(await manual(body, 'f229-cash-retry'));
      const second = await inspect(await manual(body, 'f229-cash-retry'));
      console.log('MANUAL_EVIDENCE cash_retry', JSON.stringify({ first: first.json.data, second: second.json.data }));

      if (second.status !== 201) throw new Error(`retry expected 201, got ${second.raw}`);
      if (first.json.data.booking.id !== second.json.data.booking.id) throw new Error('retry produced a different booking');
      if (first.json.data.payment.intentId !== second.json.data.payment.intentId) throw new Error('retry produced a different intent');

      const rows = await db.paymentIntent.findMany({ where: { referenceId: first.json.data.booking.id } });
      if (rows.length !== 1) throw new Error(`expected exactly 1 intent, got ${rows.length}`);
      const bk = await db.booking.findUnique({ where: { id: first.json.data.booking.id } });
      if (bk?.status !== 'CONFIRMED') throw new Error(`booking not CONFIRMED after retry: ${bk?.status}`);
    },
  },
  {
    name: 'F-229 /bookings/manual — upi_qr: gatewayRef is upi_<txn id>, booking CONFIRMED; resubmit same booking returns same intent (one row)',
    async run() {
      const win = await freshWindow();
      const txnId = 'UTR' + Date.now();
      const body = baseBody(win, { paymentMethod: 'upi_qr', upiTransactionId: txnId });

      const res = await inspect(await manual(body, 'f229-upi-1'));
      console.log('MANUAL_EVIDENCE upi', JSON.stringify(res.json));
      if (res.status !== 201) throw new Error(`expected 201, got ${res.raw}`);
      if (res.json.data.payment.gatewayRef !== `upi_${txnId}`) throw new Error(`gatewayRef wrong: ${res.raw}`);

      const bookingId = res.json.data.booking.id;
      if ((await db.booking.findUnique({ where: { id: bookingId } }))?.status !== 'CONFIRMED') {
        throw new Error('upi_qr booking not CONFIRMED');
      }

      const resub = await inspect(await manual(body, 'f229-upi-1'));
      if (resub.status !== 201 || resub.json.data.payment.intentId !== res.json.data.payment.intentId) {
        throw new Error(`resubmit did not return the same intent: ${resub.raw}`);
      }
      const rows = await db.paymentIntent.findMany({ where: { gatewayRef: `upi_${txnId}` } });
      if (rows.length !== 1) throw new Error(`expected 1 intent for the upi ref, got ${rows.length}`);
    },
  },
  {
    name: 'F-229 /bookings/manual — upi_qr cross-booking collision: same txn id on a different booking -> 409, second booking NOT confirmed, still one intent (first booking)',
    async run() {
      const txnId = 'SHARED-UTR-' + Date.now();

      const win1 = await freshWindow();
      const first = await inspect(await manual(baseBody(win1, { paymentMethod: 'upi_qr', upiTransactionId: txnId }), 'f229-collide-A'));
      if (first.status !== 201) throw new Error(`first booking expected 201, got ${first.raw}`);
      const firstBookingId = first.json.data.booking.id;

      const win2 = await freshWindow();
      const second = await inspect(await manual(baseBody(win2, { paymentMethod: 'upi_qr', upiTransactionId: txnId }), 'f229-collide-B'));
      console.log('MANUAL_EVIDENCE collision', JSON.stringify(second.json));
      if (second.status !== 409 || second.json.error?.code !== 'UPI_TRANSACTION_ID_ALREADY_USED') {
        throw new Error(`expected 409 UPI_TRANSACTION_ID_ALREADY_USED, got ${second.raw}`);
      }

      // The second booking was created HELD by createHeldNegotiatedBooking, then the 409 aborted
      // before confirm — it must NOT be CONFIRMED.
      const rows = await db.paymentIntent.findMany({ where: { gatewayRef: `upi_${txnId}` } });
      if (rows.length !== 1 || rows[0].referenceId !== firstBookingId) {
        throw new Error(`intent table wrong after collision: ${JSON.stringify(rows)}`);
      }
      // find the second booking by its window and assert it is not confirmed
      const secondBk = await db.booking.findFirst({ where: { windowId: win2 } });
      if (secondBk && secondBk.status === 'CONFIRMED') {
        throw new Error('collision confirmed the second booking against another booking payment — the F-229 bug');
      }
    },
  },
  {
    name: 'F-229 /bookings/manual — upi_qr without upiTransactionId -> 400 UPI_TRANSACTION_ID_REQUIRED (no booking, no intent)',
    async run() {
      const win = await freshWindow();
      const res = await inspect(await manual(baseBody(win, { paymentMethod: 'upi_qr' }), 'f229-upi-missing'));
      if (res.status !== 400 || res.json.error?.code !== 'UPI_TRANSACTION_ID_REQUIRED') {
        throw new Error(`expected 400 UPI_TRANSACTION_ID_REQUIRED, got ${res.raw}`);
      }
      const bk = await db.booking.findFirst({ where: { windowId: win } });
      if (bk) throw new Error('a rejected upi_qr call still created a booking');
    },
  },
  {
    name: 'F-229 /bookings/manual — razorpay_link: plink_mock_ ref, PaymentIntent pending, working short url (unchanged from /payment-links/negotiated)',
    async run() {
      const win = await freshWindow();
      const res = await inspect(await manual(baseBody(win, { paymentMethod: 'razorpay_link' }), 'f229-link-1'));
      console.log('MANUAL_EVIDENCE link', JSON.stringify(res.json));
      if (![200, 201].includes(res.status)) throw new Error(`expected 200/201, got ${res.raw}`);

      const link = res.json.data.paymentLink;
      if (!link.paymentLinkId.startsWith('plink_mock_') || !link.shortUrl.includes('rzp.io/l/mock-')) {
        throw new Error(`link shape wrong: ${res.raw}`);
      }
      const pi = await db.paymentIntent.findUnique({ where: { gatewayRef: link.paymentLinkId } });
      if (!pi || pi.status !== 'pending' || pi.amount !== 24000) throw new Error(`link intent wrong: ${JSON.stringify(pi)}`);

      const bk = await db.booking.findUnique({ where: { id: res.json.data.booking.id } });
      if (bk?.status !== 'HELD') throw new Error(`link booking should be HELD, got ${bk?.status}`);
    },
  },
  {
    name: 'F-229 /bookings/manual — auth: no auth 401, non-admin JWT 403, wrong-branch branch_manager 403, bad paymentMethod 400',
    async run() {
      const win = await freshWindow();
      const good = baseBody(win, { paymentMethod: 'cash' });

      const noAuth = await inspect(await fetch(`${paymentUrl}/bookings/manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'f229-noauth' }, body: JSON.stringify(good),
      }));
      if (noAuth.status !== 401) throw new Error(`no auth expected 401, got ${noAuth.raw}`);

      const member = await inspect(await manual(good, 'f229-member', nonAdminJwt));
      if (member.status !== 403) throw new Error(`non-admin expected 403, got ${member.raw}`);

      const wrongBranch = await inspect(await manual(good, 'f229-wrongbranch', wrongBranchMgrJwt));
      if (wrongBranch.status !== 403 || wrongBranch.json.error?.code !== 'FORBIDDEN') {
        throw new Error(`wrong-branch manager expected 403 FORBIDDEN, got ${wrongBranch.raw}`);
      }

      const badMethod = await inspect(await manual(baseBody(win, { paymentMethod: 'venmo' }), 'f229-badmethod', ownerJwt));
      if (badMethod.status !== 400) throw new Error(`bad method expected 400, got ${badMethod.raw}`);
    },
  },
];
