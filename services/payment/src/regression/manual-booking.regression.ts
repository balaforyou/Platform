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

// F-230: a resourced POOLED pool with per-court guest authorization, mirroring slot-engine's own
// F-225 fixture (services/slot-engine/src/regression/court-slot-index.regression.ts's
// createResourcedPooledPool) so /bookings/manual's walk-in-guest path can be checked against the
// same guestBookable gate the self-service path already respects.
async function createResourcedPooledPool(capacity: number, authorizedIndices: number[]): Promise<{ pool: any; courts: any[] }> {
  const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID, branchId: BRANCH_ID, name: `F-230 Pool ${Date.now()}`,
      allocationMode: 'POOLED', capacity, basePrice: 200, defaultRate: 200,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  await fetch(`${slotEngineUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      cancellationPolicyJson: { type: 'tiered', tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }] },
    }),
  });

  const courts: any[] = [];
  for (let i = 1; i <= capacity; i++) {
    const res = await fetch(`${slotEngineUrl}/resource-pools/${pool.id}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
      body: JSON.stringify({ name: `F230 Court ${i}` }),
    });
    courts.push(((await res.json()) as any).data);
  }
  const authorizedIds = courts.filter((_, i) => authorizedIndices.includes(i + 1)).map((c) => c.id);
  await db.resource.updateMany({ where: { id: { in: authorizedIds } }, data: { guestBookable: true } });
  return { pool, courts };
}

async function freshWindowFor(poolId: string, capacity: number): Promise<string> {
  windowSeq += 1;
  const start = futureAlignedHour(500 + windowSeq * 2);
  const end = futureAlignedHour(501 + windowSeq * 2);
  const res = await fetch(`${slotEngineUrl}/resource-pools/${poolId}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity }),
  });
  return ((await res.json()) as any).data.id;
}

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
  {
    name: 'F-230 /bookings/manual — walk-in guest respects per-court guest authorization: falls back to resourceId null, never lands on a court reserved away from guests',
    async run() {
      // Capacity 2, only court 1 guest-authorized — mirrors slot-engine's own F-225 "no
      // authorized court free" test (court-slot-index.regression.ts:567), but through the
      // walk-in-guest /bookings/manual route rather than self-service POST /bookings.
      const { pool, courts } = await createResourcedPooledPool(2, [1]);
      const win = await freshWindowFor(pool.id, 2);
      const body = (extra: Record<string, unknown>) => ({
        tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: win,
        negotiatedPrice: 200, ...extra,
      });

      const first = await inspect(await manual(body({ userId: 'f230-guest-a', paymentMethod: 'cash' }), 'f230-guest-1'));
      if (first.status !== 201) throw new Error(`first: expected 201, got ${first.raw}`);
      const b1 = await db.booking.findUnique({ where: { id: first.json.data.booking.id }, select: { resourceId: true } });
      if (b1?.resourceId !== courts[0].id) {
        throw new Error(`first: expected the one guest-authorized Court 1, got ${JSON.stringify(b1)}`);
      }

      // Court 1 (the only guest-authorized court) is now taken. Capacity is 2, so the window
      // still has room, and only the non-guest-authorized court 2 remains. Before the F-230 fix,
      // /bookings/manual called /bookings/negotiated WITHOUT guestOnly, so this walk-in guest
      // would have landed on court 2 anyway — F-225's admin/negotiated-for-a-member behaviour,
      // wrongly applied to a real walk-in guest.
      const second = await inspect(await manual(body({ userId: 'f230-guest-b', paymentMethod: 'cash' }), 'f230-guest-2'));
      console.log('F230_EVIDENCE guest_fallback', JSON.stringify(second.json));
      if (second.status !== 201) throw new Error(`second: expected 201 (not a rejection — capacity is 2), got ${second.raw}`);
      const b2 = await db.booking.findUnique({ where: { id: second.json.data.booking.id }, select: { resourceId: true } });
      if (b2?.resourceId !== null) {
        throw new Error(`second: expected resourceId null fallback (no guest-authorized court free), got ${JSON.stringify(b2)} — walk-in guest was assigned a court reserved away from guests`);
      }
    },
  },
  {
    name: 'F-276 /bookings/manual — releaseGroupId re-verifies group no-show state server-side at write time: genuinely eligible succeeds, then a member confirming after that makes a second identical placement fail closed (409), never client-trusted',
    async run() {
      // Real pool + a real BookingRule with a real gracePeriodMinutes, matching the sweep/member-
      // attendance precedent (member-multi-batch-attendance.regression.ts).
      const poolRes = await fetch(`${slotEngineUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: TENANT_ID, branchId: BRANCH_ID, name: `F-276 Pool ${Date.now()}`,
          allocationMode: 'POOLED', capacity: 4, basePrice: 150, defaultRate: 150,
        }),
      });
      const pool = ((await poolRes.json()) as any).data;
      // gracePeriodMinutes: 150 (2.5h), paired with a window 2h out (below) -- the top-of-hour
      // rounding futureAlignedHour applies can shrink that 2h to as little as ~1h depending on
      // where in the current hour the test happens to run, so 150min keeps the cutoff genuinely
      // in the past under the worst case, not just the typical one.
      await db.bookingRule.create({
        data: { resourcePoolId: pool.id, gracePeriodMinutes: 150, guestAccessCutoffMinutes: 120, cancellationPolicyJson: { type: 'tiered', tiers: [] } },
      });

      // A real, hour-aligned window ~2h out (availability-window creation requires alignment,
      // UNALIGNED_TIME_BOUNDARY otherwise) — genuinely not started yet, but with a 150min grace
      // period its cutoff is already safely in the past. Known, accepted narrow edge case (shared
      // with every other *AlignedHour-based regression fixture in this codebase): a run within
      // ~90min of UTC midnight could roll `start` onto tomorrow's calendar date while `daysOfWeek`/
      // eligibility below resolves against today's -- not engineered around here.
      const start = futureAlignedHour(2);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const windowRes = await fetch(`${slotEngineUrl}/resource-pools/${pool.id}/availability-windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
      });
      const windowBody = await windowRes.json() as any;
      if (windowRes.status !== 200 && windowRes.status !== 201) {
        throw new Error(`Setup: expected availability-window creation to succeed, got ${windowRes.status}: ${JSON.stringify(windowBody)}`);
      }
      const window = windowBody.data;

      const todayIsoWeekday = String(start.getUTCDay() === 0 ? 7 : start.getUTCDay());
      const hhmm = start.toISOString().slice(11, 16);
      const group = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: `F-276 group ${Date.now()}`, resourcePoolId: pool.id,
          daysOfWeek: todayIsoWeekday, startTime: hhmm,
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        },
      });
      const memberA = 'f276-member-a';
      const memberB = 'f276-member-b';
      for (const userId of [memberA, memberB]) {
        await db.subscription.create({
          data: { userId, tenantId: TENANT_ID, mandateId: `f276-${userId}-${Date.now()}`, amount: 100000, frequency: 'monthly', status: 'active' },
        });
        await db.memberGroupAssignment.create({
          data: {
            userId, groupId: group.id, resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday, startTime: hhmm,
            status: 'ACTIVE', startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
          },
        });
      }
      // Deliberately NO Booking rows created for either member — the real, majority production
      // state while F-044 (sweep has no scheduled caller) stays unresolved. Both members must
      // read as "no-show" from absence alone, not from an explicit RELEASED_NO_SHOW row.

      // --- Real eligibility check, genuinely no-show, zero confirmations ---
      const eligibilityRes1 = await inspect(await fetch(`${slotEngineUrl}/groups/${group.id}/release-eligibility`, {
        headers: { Authorization: `Bearer ${internalKey}` },
      }));
      if (eligibilityRes1.status !== 200 || eligibilityRes1.json?.data?.eligible !== true) {
        throw new Error(`Expected genuine no-show group to be release-eligible, got ${eligibilityRes1.raw}`);
      }
      if (eligibilityRes1.json.data.window?.id !== window.id) {
        throw new Error(`Expected eligibility to resolve today's real window ${window.id}, got ${JSON.stringify(eligibilityRes1.json.data.window)}`);
      }
      console.log('F276_EVIDENCE eligible_zero_confirmations', JSON.stringify(eligibilityRes1.json.data));

      // --- Real placement, genuinely eligible: /bookings/manual + releaseGroupId succeeds despite
      //     the window being member-blocked (collidesWithMemberAssignment untouched/unconsulted). ---
      const placementBody = {
        tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
        userId: 'f276-walk-in-guest', negotiatedPrice: 150, paymentMethod: 'cash', releaseGroupId: group.id,
      };
      const placement = await inspect(await manual(placementBody, `f276-release-${Date.now()}`, ownerJwt));
      if (placement.status !== 201) {
        throw new Error(`Expected genuinely-eligible release placement to succeed with 201, got ${placement.raw}`);
      }
      const placedBooking = await db.booking.findUnique({ where: { id: placement.json.data.booking.id } });
      if (!placedBooking || placedBooking.windowId !== window.id || placedBooking.isMemberBooking) {
        throw new Error(`Expected a real, non-member guest booking in the released window, got ${JSON.stringify(placedBooking)}`);
      }
      console.log('F276_EVIDENCE placement_succeeded', placedBooking.id);

      // --- Member A confirms attendance AFTER the placement above (a second, independent window
      //     on the SAME group, same schedule but a later occurrence, would be the real production
      //     shape -- here re-using the identical group/window pair to prove the re-check itself
      //     works: mark memberA CONFIRMED directly, matching what /member/today-assignment/confirm
      //     would persist, then attempt a SECOND placement attempt against the same window). ---
      await db.booking.create({
        data: {
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: memberA,
          status: 'CONFIRMED', isMemberBooking: true, heldUntil: new Date(),
          idempotencyKey: `f276-confirm-${Date.now()}`, memberAttendanceConfirmedAt: new Date(),
        },
      });
      const eligibilityRes2 = await inspect(await fetch(`${slotEngineUrl}/groups/${group.id}/release-eligibility`, {
        headers: { Authorization: `Bearer ${internalKey}` },
      }));
      if (eligibilityRes2.json?.data?.eligible !== false) {
        throw new Error(`Expected eligibility to flip false once a member is genuinely CONFIRMED, got ${eligibilityRes2.raw}`);
      }
      const secondAttempt = await inspect(await manual(
        { ...placementBody, userId: 'f276-walk-in-guest-2' },
        `f276-release-stale-${Date.now()}`,
        ownerJwt,
      ));
      if (secondAttempt.status !== 409 || secondAttempt.json?.error?.code !== 'RELEASE_NO_LONGER_ELIGIBLE') {
        throw new Error(`Expected a stale release attempt (member now CONFIRMED) to fail closed 409 RELEASE_NO_LONGER_ELIGIBLE, got ${secondAttempt.status}: ${secondAttempt.raw}`);
      }
      console.log('F276_EVIDENCE stale_attempt_rejected', secondAttempt.json?.error);
    },
  },
];
