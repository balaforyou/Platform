import crypto from 'crypto';
import { Section, inspect } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import {
  db,
  baseUrl,
  internalKey,
  bookingHeaders,
  guestToken,
  nextAlignedHour,
  SlotEngineContext,
  TENANT_ID,
  BRANCH_ID,
} from './_fixtures';

/**
 * F-310 PHASE 1 — POST /booking-orders: NON-CONTIGUOUS MULTI-SLOT GUEST BOOKING.
 *
 * A separate route from POST /bookings (F-183), deliberately: creates N independent
 * top-level Booking rows (no parentBookingId chain) sharing one orderId, with no
 * contiguity or same-resource-pool requirement between them. Each row is independently
 * cancellable via the existing POST /bookings/:id/cancel and independently swept by the
 * existing held_booking_expiry job. No PaymentIntent linking in this phase.
 *
 * Self-contained: every pool/rule/window here is created fresh per section via the HTTP
 * API, reusing TENANT_ID/BRANCH_ID from _fixtures.ts.
 */

const REGRESSION_TIERED_POLICY = {
  type: 'tiered',
  tiers: [
    { min_hours_before_slot: 24, refund_percent: 100 },
    { min_hours_before_slot: 1, refund_percent: 50 },
    { min_hours_before_slot: 0, refund_percent: 0 },
  ],
};

async function createPoolWithRule(opts: {
  maxDailyBookingsPerGuest?: number;
  dailyBookingCapEnabled?: boolean;
  capacity?: number;
}): Promise<{ pool: any }> {
  const capacity = opts.capacity ?? 4;
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-310 Pool ${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      allocationMode: 'POOLED',
      capacity,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      cancellationPolicyJson: REGRESSION_TIERED_POLICY,
      ...(opts.maxDailyBookingsPerGuest !== undefined ? { maxDailyBookingsPerGuest: opts.maxDailyBookingsPerGuest } : {}),
      ...(opts.dailyBookingCapEnabled !== undefined ? { dailyBookingCapEnabled: opts.dailyBookingCapEnabled } : {}),
    }),
  });

  return { pool };
}

/** Creates one 1-hour AvailabilityWindow at `hoursFromNow`, POOLED (no resourceId). */
async function createWindow(poolId: string, hoursFromNow: number): Promise<any> {
  const start = nextAlignedHour(hoursFromNow);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const res = await fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString() }),
  });
  return ((await res.json()) as any).data;
}

export const bookingOrdersSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-310: two genuinely non-contiguous, same-pool windows both held under one orderId, no parentBookingId chain',
    async run() {
      const { pool } = await createPoolWithRule({});
      // 9 AM-equivalent and 6 PM-equivalent, same day, far apart -- genuinely non-contiguous.
      const morning = await createWindow(pool.id, 4);
      const evening = await createWindow(pool.id, 12);
      const userId = 'f310-happy-user';

      const res = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-happy-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      if (res.status !== 201) {
        throw new Error(`Expected 201 creating a 2-window order, got ${res.status}: ${res.raw}`);
      }
      const body = res.json?.data ?? res.json;
      console.log(
        'F310_EVIDENCE non_contiguous_held',
        JSON.stringify({ orderId: body.orderId, heldCount: body.held.length, rejectedCount: body.rejected.length }),
      );
      if (body.held.length !== 2 || body.rejected.length !== 0) {
        throw new Error(`Expected 2 held / 0 rejected, got ${JSON.stringify(body)}`);
      }

      const rows = await db.booking.findMany({ where: { orderId: body.orderId } });
      console.log(
        'F310_EVIDENCE db_readback',
        JSON.stringify(rows.map((r) => ({ id: r.id, windowId: r.windowId, parentBookingId: r.parentBookingId, orderId: r.orderId, status: r.status, price: r.price?.toString() }))),
      );
      if (rows.length !== 2) throw new Error(`Expected 2 rows sharing orderId, got ${rows.length}`);
      if (rows.some((r) => r.parentBookingId !== null)) throw new Error(`Expected parentBookingId: null on every row, got ${JSON.stringify(rows.map((r) => r.parentBookingId))}`);
      if (rows.some((r) => r.status !== BookingStatus.HELD)) throw new Error(`Expected every row HELD, got ${JSON.stringify(rows.map((r) => r.status))}`);
      if (rows.some((r) => r.price === null)) throw new Error(`Expected every row to carry its own real price, got ${JSON.stringify(rows.map((r) => r.price))}`);
    },
  },

  {
    name: 'F-310: partial failure — one window already taken reports an accurate split, the available one is still genuinely held',
    async run() {
      const { pool } = await createPoolWithRule({ capacity: 1 });
      const morning = await createWindow(pool.id, 4);
      const evening = await createWindow(pool.id, 12);

      // Take the evening window's only capacity slot first, via the ordinary /bookings route.
      const blockerUserId = 'f310-blocker-user';
      const blockerToken = guestToken(blockerUserId);
      const blockRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${blockerToken}`, 'idempotency-key': 'f310-blocker-key' },
          body: JSON.stringify({ branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: evening.id }),
        }),
      );
      if (blockRes.status !== 201) throw new Error(`Expected 201 pre-holding the evening window, got ${blockRes.status}: ${blockRes.raw}`);

      const userId = 'f310-partial-user';
      const res = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-partial-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      const body = res.json?.data ?? res.json;
      console.log('F310_EVIDENCE partial_split', JSON.stringify({ status: res.status, held: body.held.length, rejected: body.rejected }));
      if (res.status !== 201) throw new Error(`Expected 201 (partial success), got ${res.status}: ${res.raw}`);
      if (body.held.length !== 1 || body.rejected.length !== 1) {
        throw new Error(`Expected 1 held / 1 rejected, got ${JSON.stringify(body)}`);
      }
      if (body.rejected[0].windowId !== evening.id || body.rejected[0].code !== 'POOL_CAPACITY_EXCEEDED') {
        throw new Error(`Expected evening window rejected with POOL_CAPACITY_EXCEEDED, got ${JSON.stringify(body.rejected[0])}`);
      }

      const heldRow = await db.booking.findUnique({ where: { id: body.held[0].id } });
      console.log('F310_EVIDENCE partial_db_readback', JSON.stringify({ status: heldRow?.status, windowId: heldRow?.windowId }));
      if (heldRow?.status !== BookingStatus.HELD || heldRow?.windowId !== morning.id) {
        throw new Error(`Expected the morning window's row to be genuinely HELD, got ${JSON.stringify(heldRow)}`);
      }
    },
  },

  {
    name: 'F-310: cancelling one booking in an order leaves its sibling untouched',
    async run() {
      const { pool } = await createPoolWithRule({});
      const morning = await createWindow(pool.id, 4);
      const evening = await createWindow(pool.id, 12);
      const userId = 'f310-cancel-user';
      const token = guestToken(userId);

      const res = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-cancel-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      const body = res.json?.data ?? res.json;
      const [first, second] = body.held;

      const cancelRes = await inspect(
        await fetch(`${baseUrl}/bookings/${first.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (cancelRes.status !== 200) throw new Error(`Expected 200 cancelling one order member, got ${cancelRes.status}: ${cancelRes.raw}`);

      const firstAfter = await db.booking.findUnique({ where: { id: first.id } });
      const secondAfter = await db.booking.findUnique({ where: { id: second.id } });
      console.log(
        'F310_EVIDENCE independent_cancel',
        JSON.stringify({ firstStatus: firstAfter?.status, secondStatus: secondAfter?.status }),
      );
      if (firstAfter?.status !== BookingStatus.CANCELLED) throw new Error(`Expected cancelled booking's own status CANCELLED, got ${firstAfter?.status}`);
      if (secondAfter?.status !== BookingStatus.HELD) throw new Error(`Expected sibling untouched (still HELD), got ${secondAfter?.status}`);
    },
  },

  {
    name: 'F-310: a held order left past 5 minutes is swept independently, same as any other HELD row',
    async run() {
      const { pool } = await createPoolWithRule({});
      const morning = await createWindow(pool.id, 4);
      const evening = await createWindow(pool.id, 12);
      const userId = 'f310-sweep-user';

      const res = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-sweep-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      const body = res.json?.data ?? res.json;
      const ids = body.held.map((b: any) => b.id);

      await db.booking.updateMany({ where: { id: { in: ids } }, data: { heldUntil: new Date(Date.now() - 1000) } });
      await db.scheduledJob.updateMany({ where: { name: 'held_booking_expiry' }, data: { nextRunAt: new Date(0) } });
      await fetch(`${baseUrl}/bookings/sweep/tick`, { method: 'POST', headers: { Authorization: `Bearer ${internalKey}` } });

      const rowsAfter = await db.booking.findMany({ where: { id: { in: ids } } });
      console.log('F310_EVIDENCE sweep_release', JSON.stringify(rowsAfter.map((r) => ({ id: r.id, status: r.status }))));
      if (rowsAfter.some((r) => r.status !== BookingStatus.RELEASED_NO_SHOW && r.status !== BookingStatus.CANCELLED)) {
        throw new Error(`Expected both order members released by the sweep, got ${JSON.stringify(rowsAfter.map((r) => r.status))}`);
      }
    },
  },

  {
    name: 'F-310: dailyBookingCapEnabled: false bypasses the cap for that pool only; a sibling pool with the default still enforces it',
    async run() {
      const { pool: uncappedPool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 1, dailyBookingCapEnabled: false });
      const { pool: cappedPool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 1 });
      const userId = 'f310-cap-toggle-user';

      const w1 = await createWindow(uncappedPool.id, 4);
      const w2 = await createWindow(uncappedPool.id, 12);
      const uncappedRes = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-cap-toggle-uncapped-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [w1.id, w2.id] }),
        }),
      );
      const uncappedBody = uncappedRes.json?.data ?? uncappedRes.json;
      console.log('F310_EVIDENCE cap_disabled', JSON.stringify({ status: uncappedRes.status, held: uncappedBody.held?.length }));
      if (uncappedRes.status !== 201 || uncappedBody.held.length !== 2) {
        throw new Error(`Expected the daily cap to be bypassed on the opted-out pool, got ${uncappedRes.status}: ${JSON.stringify(uncappedBody)}`);
      }

      const w3 = await createWindow(cappedPool.id, 20);
      const w4 = await createWindow(cappedPool.id, 22);
      const cappedRes = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-cap-toggle-capped-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [w3.id, w4.id] }),
        }),
      );
      console.log('F310_EVIDENCE cap_still_enforced', JSON.stringify({ status: cappedRes.status, code: (cappedRes.json?.data ?? cappedRes.json)?.error?.code }));
      if (cappedRes.status !== 400) {
        throw new Error(`Expected the default-enabled pool to still enforce the cap, got ${cappedRes.status}: ${cappedRes.raw}`);
      }
    },
  },

  {
    name: 'F-310: an order whose own size alone would exceed the daily cap is rejected in full, not silently trimmed',
    async run() {
      const { pool } = await createPoolWithRule({ maxDailyBookingsPerGuest: 2 });
      const userId = 'f310-order-size-cap-user';
      const w1 = await createWindow(pool.id, 4);
      const w2 = await createWindow(pool.id, 8);
      const w3 = await createWindow(pool.id, 12);

      // 3 windows in one order against a cap of 2 (0 existing bookings today) -- must reject
      // the WHOLE order, not silently hold 2 of the 3.
      const overRes = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-order-size-over-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [w1.id, w2.id, w3.id] }),
        }),
      );
      const overBody = overRes.json?.data ?? overRes.json;
      console.log('F310_EVIDENCE order_size_cap_rejected', JSON.stringify({ status: overRes.status, body: overBody }));
      if (overRes.status !== 400 || overBody?.error?.code !== 'DAILY_CAP_EXCEEDED') {
        throw new Error(`Expected the entire over-sized order rejected with DAILY_CAP_EXCEEDED, got ${overRes.status}: ${overRes.raw}`);
      }
      const rowsAfterReject = await db.booking.findMany({ where: { windowId: { in: [w1.id, w2.id, w3.id] } } });
      if (rowsAfterReject.length !== 0) {
        throw new Error(`Expected zero rows created on a rejected order, got ${rowsAfterReject.length}`);
      }

      // Exactly at the boundary (2 windows against a cap of 2) still succeeds.
      const atCapRes = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-order-size-boundary-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [w1.id, w2.id] }),
        }),
      );
      const atCapBody = atCapRes.json?.data ?? atCapRes.json;
      console.log('F310_EVIDENCE order_size_cap_boundary_ok', JSON.stringify({ status: atCapRes.status, held: atCapBody.held?.length }));
      if (atCapRes.status !== 201 || atCapBody.held.length !== 2) {
        throw new Error(`Expected a same-day order right at the cap boundary to succeed, got ${atCapRes.status}: ${atCapRes.raw}`);
      }
    },
  },

  {
    name: 'F-310: a windowId belonging to a different tenant is rejected as not found, not silently booked across tenants',
    async run() {
      // A second, real tenant + branch -- same real-cross-tenant pattern as F-277's own section
      // (group-tenant-scoping.regression.ts), proving isolation against an ACTUAL other tenant
      // rather than a synthetic id that happens not to match.
      const OTHER_TENANT_ID = 'f310-11111111-2222-3333-4444-555555555555';
      const OTHER_BRANCH_ID = 'f310-66666666-7777-8888-9999-000000000000';
      await db.tenant.upsert({
        where: { id: OTHER_TENANT_ID },
        update: {},
        create: { id: OTHER_TENANT_ID, name: 'F-310 Other Tenant', subdomain: 'f310-other-tenant' },
      });
      await db.branch.upsert({
        where: { id: OTHER_BRANCH_ID },
        update: {},
        create: { id: OTHER_BRANCH_ID, tenantId: OTHER_TENANT_ID, name: 'F-310 Other Branch', status: 'ACTIVE', timezone: 'UTC' },
      });
      const foreignPoolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ tenantId: OTHER_TENANT_ID, branchId: OTHER_BRANCH_ID, name: 'F-310 Foreign Pool', allocationMode: 'POOLED', capacity: 4 }),
      });
      const foreignPool = ((await foreignPoolRes.json()) as any).data;
      const foreignWindow = await createWindow(foreignPool.id, 4);

      const { pool } = await createPoolWithRule({});
      const ownWindow = await createWindow(pool.id, 12);
      const userId = 'f310-tenant-isolation-user';

      const res = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers: bookingHeaders(userId, 'f310-tenant-isolation-key'),
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [ownWindow.id, foreignWindow.id] }),
        }),
      );
      const body = res.json?.data ?? res.json;
      console.log('F310_EVIDENCE tenant_isolation', JSON.stringify({ status: res.status, held: body.held?.length, rejected: body.rejected }));
      if (res.status !== 201 || body.held.length !== 1 || body.rejected.length !== 1) {
        throw new Error(`Expected the caller's own window held and the foreign-tenant window rejected, got ${res.status}: ${JSON.stringify(body)}`);
      }
      if (body.rejected[0].windowId !== foreignWindow.id || body.rejected[0].code !== 'NOT_FOUND') {
        throw new Error(`Expected the foreign window rejected NOT_FOUND (not a distinguishing error, to avoid leaking cross-tenant existence), got ${JSON.stringify(body.rejected[0])}`);
      }

      const foreignRows = await db.booking.findMany({ where: { windowId: foreignWindow.id } });
      if (foreignRows.length !== 0) {
        throw new Error(`Expected zero bookings created against the foreign tenant's window, got ${foreignRows.length}`);
      }
    },
  },

  {
    name: 'F-310: a retried request (same Idempotency-Key) reproduces the identical orderId, not a fresh one',
    async run() {
      const { pool } = await createPoolWithRule({});
      const morning = await createWindow(pool.id, 4);
      const evening = await createWindow(pool.id, 12);
      const userId = 'f310-retry-user';
      const headers = bookingHeaders(userId, 'f310-retry-key');

      const first = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      const firstBody = first.json?.data ?? first.json;

      // Same Idempotency-Key, same windowIds -- simulates a client retry after e.g. a timeout,
      // where every window's derived per-window key already exists from the first attempt.
      const retry = await inspect(
        await fetch(`${baseUrl}/booking-orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ branchId: BRANCH_ID, windowIds: [morning.id, evening.id] }),
        }),
      );
      const retryBody = retry.json?.data ?? retry.json;
      console.log('F310_EVIDENCE retry_orderid_stable', JSON.stringify({ firstOrderId: firstBody.orderId, retryOrderId: retryBody.orderId, retryHeldIds: retryBody.held.map((b: any) => b.id) }));

      if (retryBody.orderId !== firstBody.orderId) {
        throw new Error(`Expected the retry to reproduce the identical orderId, got first=${firstBody.orderId} retry=${retryBody.orderId}`);
      }
      const retryIds = retryBody.held.map((b: any) => b.id).sort();
      const firstIds = firstBody.held.map((b: any) => b.id).sort();
      if (JSON.stringify(retryIds) !== JSON.stringify(firstIds)) {
        throw new Error(`Expected the retry to return the exact same booking rows, got first=${JSON.stringify(firstIds)} retry=${JSON.stringify(retryIds)}`);
      }
    },
  },
];
