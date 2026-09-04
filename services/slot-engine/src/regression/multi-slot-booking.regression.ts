import { Section, inspect } from '@badminton/test-harness';
import {
  db,
  baseUrl,
  internalKey,
  guestToken,
  nextAlignedHour,
  SlotEngineContext,
  TENANT_ID,
  BRANCH_ID,
} from './_fixtures';

/**
 * F-183 PHASE 1 — MULTI-SLOT-TIME BOOKING.
 *
 * A guest can extend a single-court booking by whole contiguous hours, up to an
 * admin-configurable `maxAdditionalWindows` cap. One billable "parent" Booking (real
 * price, idempotencyKey, goes through the existing lifecycle) plus lightweight "child"
 * Booking rows (price: null, idempotencyKey: null) occupying the remaining windows, so
 * every existing windowId-keyed query keeps working unmodified.
 *
 * Self-contained: every pool/rule/window here is created fresh per section via the HTTP
 * API, reusing TENANT_ID/BRANCH_ID from _fixtures.ts (already seeded by
 * setupBaseFixtures() before any section runs).
 */

const REGRESSION_TIERED_POLICY = {
  type: 'tiered',
  tiers: [
    { min_hours_before_slot: 24, refund_percent: 100 },
    { min_hours_before_slot: 1, refund_percent: 50 },
    { min_hours_before_slot: 0, refund_percent: 0 },
  ],
};

async function createPooledPoolWithWindows(opts: {
  hours: number;
  maxAdditionalWindows: number;
  capacity?: number;
  gapBeforeLastHour?: boolean; // when true, the final window is 2 hours after the previous one (non-contiguous)
}): Promise<{ pool: any; windows: any[] }> {
  const capacity = opts.capacity ?? 4;
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-183 Pooled Pool ${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
      maxAdditionalWindows: opts.maxAdditionalWindows,
      cancellationPolicyJson: REGRESSION_TIERED_POLICY,
    }),
  });

  const baseStart = nextAlignedHour(4);
  const windows: any[] = [];
  for (let i = 0; i < opts.hours; i++) {
    const isLast = i === opts.hours - 1;
    const gapHours = opts.gapBeforeLastHour && isLast ? 2 : 1;
    const priorEnd = i === 0 ? baseStart : new Date(new Date(windows[i - 1].endTime).getTime());
    const start = i === 0 ? baseStart : new Date(priorEnd.getTime() + (gapHours - 1) * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const res = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
      body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity }),
    });
    windows.push(((await res.json()) as any).data);
  }
  return { pool, windows };
}

async function createTwoCourtFixedInstancePool(): Promise<{
  pool: any;
  resourceA: any;
  resourceB: any;
  hour1A: any;
  hour2A: any;
  hour2B: any;
}> {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-183 Two-Court FIXED_INSTANCE Pool ${Date.now()}`,
      allocationMode: 'FIXED_INSTANCE',
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      maxAdditionalWindows: 1,
      cancellationPolicyJson: REGRESSION_TIERED_POLICY,
    }),
  });

  const resourceARes = await fetch(`${baseUrl}/resource-pools/${pool.id}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ name: 'F-183 Court A' }),
  });
  const resourceA = ((await resourceARes.json()) as any).data;

  const resourceBRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ name: 'F-183 Court B' }),
  });
  const resourceB = ((await resourceBRes.json()) as any).data;

  const hour1Start = nextAlignedHour(4);
  const hour1End = new Date(hour1Start.getTime() + 60 * 60 * 1000);
  const hour2Start = hour1End;
  const hour2End = new Date(hour2Start.getTime() + 60 * 60 * 1000);

  const createWindow = async (resourceId: string, start: Date, end: Date) => {
    const res = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
      body: JSON.stringify({ resourceId, startTime: start.toISOString(), endTime: end.toISOString() }),
    });
    return ((await res.json()) as any).data;
  };

  // Both courts get both hours — a real multi-court FIXED_INSTANCE setup, generated the
  // same way availabilityGeneration.ts would (one window per resource per time step).
  const hour1A = await createWindow(resourceA.id, hour1Start, hour1End);
  await createWindow(resourceB.id, hour1Start, hour1End);
  const hour2A = await createWindow(resourceA.id, hour2Start, hour2End);
  const hour2B = await createWindow(resourceB.id, hour2Start, hour2End);

  return { pool, resourceA, resourceB, hour1A, hour2A, hour2B };
}

export const multiSlotBookingSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-183: contiguous 2-hour booking creates parent + child rows; confirm/check-in cascade to both',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1 });
      const userId = 'f183-happy-user';
      const token = guestToken(userId);

      const createRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'idempotency-key': 'f183-happy-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      if (createRes.status !== 201) {
        throw new Error(`Expected 201 creating a 2-hour booking, got ${createRes.status}: ${createRes.raw}`);
      }
      const parent = createRes.json?.data ?? createRes.json;
      console.log(
        'F183_EVIDENCE create',
        JSON.stringify({ parentId: parent.id, price: parent.price, childCount: parent.childBookings?.length }),
      );

      if (!Array.isArray(parent.childBookings) || parent.childBookings.length !== 1) {
        throw new Error(`Expected exactly 1 child booking on the parent, got ${JSON.stringify(parent.childBookings)}`);
      }
      const child = parent.childBookings[0];
      if (child.price !== null) throw new Error(`Expected child.price to be null, got ${child.price}`);
      if (child.idempotencyKey !== null) throw new Error(`Expected child.idempotencyKey to be null, got ${child.idempotencyKey}`);
      if (child.parentBookingId !== parent.id) throw new Error('child.parentBookingId does not point back to the parent');
      if (child.windowId !== windows[1].id) throw new Error('child.windowId is not the second (additional) window');
      if (parent.windowId !== windows[0].id) throw new Error('parent.windowId is not the earliest (base) window');

      // Two FLAT-priced windows at the pool's default rate (100 each) — summed, not just the first.
      if (Number(parent.price) !== 200) {
        throw new Error(`Expected summed price 200 (2 x 100 FLAT), got ${parent.price}`);
      }

      const confirmRes = await inspect(
        await fetch(`${baseUrl}/bookings/${parent.id}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${internalKey}` },
        }),
      );
      if (confirmRes.status !== 200) {
        throw new Error(`Expected 200 confirming the parent, got ${confirmRes.status}: ${confirmRes.raw}`);
      }
      const parentAfterConfirm = await db.booking.findUnique({ where: { id: parent.id } });
      const childAfterConfirm = await db.booking.findUnique({ where: { id: child.id } });
      console.log(
        'F183_EVIDENCE confirm_cascade',
        JSON.stringify({ parentStatus: parentAfterConfirm?.status, childStatus: childAfterConfirm?.status }),
      );
      if (parentAfterConfirm?.status !== 'CONFIRMED' || childAfterConfirm?.status !== 'CONFIRMED') {
        throw new Error(
          `Expected both CONFIRMED after /confirm, got parent=${parentAfterConfirm?.status} child=${childAfterConfirm?.status}`,
        );
      }

      const checkinRes = await inspect(
        await fetch(`${baseUrl}/bookings/${parent.id}/check-in`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (checkinRes.status !== 200) {
        throw new Error(`Expected 200 checking in the parent, got ${checkinRes.status}: ${checkinRes.raw}`);
      }
      const parentAfterCheckin = await db.booking.findUnique({ where: { id: parent.id } });
      const childAfterCheckin = await db.booking.findUnique({ where: { id: child.id } });
      console.log(
        'F183_EVIDENCE checkin_cascade',
        JSON.stringify({ parentStatus: parentAfterCheckin?.status, childStatus: childAfterCheckin?.status }),
      );
      if (parentAfterCheckin?.status !== 'CHECKED_IN' || childAfterCheckin?.status !== 'CHECKED_IN') {
        throw new Error(
          `Expected both CHECKED_IN after /check-in, got parent=${parentAfterCheckin?.status} child=${childAfterCheckin?.status}`,
        );
      }
    },
  },

  {
    name: 'F-183: cancelling via the parent id cascades to the child; only the parent computes a refund',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1 });
      const userId = 'f183-cancel-user';
      const token = guestToken(userId);

      const createRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'idempotency-key': 'f183-cancel-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      const parent = createRes.json?.data ?? createRes.json;
      const child = parent.childBookings[0];

      await fetch(`${baseUrl}/bookings/${parent.id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${internalKey}` },
      });

      const cancelRes = await inspect(
        await fetch(`${baseUrl}/bookings/${parent.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (cancelRes.status !== 200) {
        throw new Error(`Expected 200 cancelling the parent, got ${cancelRes.status}: ${cancelRes.raw}`);
      }
      const parentAfter = await db.booking.findUnique({ where: { id: parent.id } });
      const childAfter = await db.booking.findUnique({ where: { id: child.id } });
      console.log(
        'F183_EVIDENCE cancel_cascade',
        JSON.stringify({
          parentStatus: parentAfter?.status,
          parentRefund: parentAfter?.refundAmount,
          childStatus: childAfter?.status,
          childRefund: childAfter?.refundAmount,
        }),
      );
      if (parentAfter?.status !== 'CANCELLED' || childAfter?.status !== 'CANCELLED') {
        throw new Error(
          `Expected both CANCELLED, got parent=${parentAfter?.status} child=${childAfter?.status}`,
        );
      }
      // ~4 hours before slot start, tiered policy (24h:100%, 1h:50%, 0h:0%) matches the
      // 1-hour tier — a real, nonzero refund on the parent.
      if (!parentAfter?.refundAmount || Number(parentAfter.refundAmount) !== 100) {
        throw new Error(`Expected parent refundAmount 100 (50% of summed price 200), got ${parentAfter?.refundAmount}`);
      }
      if (childAfter?.refundAmount !== null) {
        throw new Error(`Expected child refundAmount to stay null (it never had a price), got ${childAfter?.refundAmount}`);
      }
    },
  },

  {
    name: 'F-183: direct /cancel, /check-in, /confirm on a child booking id all reject with 400 CHILD_BOOKING_NOT_MUTABLE',
    async run() {
      // capacity: 1 — so the child's HELD booking makes the window's availability binary
      // (occupied vs free), rather than one of several remaining seats in a wider pool.
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1, capacity: 1 });
      const userId = 'f183-direct-child-user';
      const token = guestToken(userId);

      const createRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'idempotency-key': 'f183-direct-child-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      const parent = createRes.json?.data ?? createRes.json;
      const child = parent.childBookings[0];

      // Direct /cancel on the child id, while still HELD — the real exploit path Chief
      // found: the child carries the same userId as the parent, so ownership legitimately
      // passes; only the new guard stops the mutation.
      const cancelRes = await inspect(
        await fetch(`${baseUrl}/bookings/${child.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      console.log(
        'F183_EVIDENCE direct_cancel_on_child',
        JSON.stringify({ status: cancelRes.status, code: cancelRes.json?.error?.code }),
      );
      if (cancelRes.status !== 400 || cancelRes.json?.error?.code !== 'CHILD_BOOKING_NOT_MUTABLE') {
        throw new Error(
          `Expected 400 CHILD_BOOKING_NOT_MUTABLE cancelling a child directly, got ${cancelRes.status}: ${cancelRes.raw}`,
        );
      }
      const parentAfterCancelAttempt = await db.booking.findUnique({ where: { id: parent.id } });
      const childAfterCancelAttempt = await db.booking.findUnique({ where: { id: child.id } });
      if (parentAfterCancelAttempt?.status !== 'HELD' || childAfterCancelAttempt?.status !== 'HELD') {
        throw new Error('A rejected direct cancel must not change either row\'s status');
      }
      if (childAfterCancelAttempt?.refundAmount !== null) {
        throw new Error('A rejected direct cancel must not compute any refund on the child');
      }

      // The child's window must still show as occupied — the billing/double-booking
      // consequence Chief traced, now confirmed absent.
      const availabilityRes = await inspect(
        await fetch(`${baseUrl}/resource-pools/${pool.id}/availability?from=${windows[1].startTime}&to=${windows[1].endTime}`),
      );
      const stillOccupied = !(availabilityRes.json?.data ?? availabilityRes.json ?? [])
        .some((slot: any) => slot.window.id === windows[1].id);
      console.log('F183_EVIDENCE child_window_still_occupied', JSON.stringify({ stillOccupied }));
      if (!stillOccupied) {
        throw new Error("Child's window must not appear as available after a rejected direct cancel attempt");
      }

      // Direct /check-in on the child id (needs CONFIRMED first to isolate the guard from
      // the status-precondition check — confirm the PARENT properly, which cascades, then
      // attempt check-in directly on the child).
      await fetch(`${baseUrl}/bookings/${parent.id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      const checkinRes = await inspect(
        await fetch(`${baseUrl}/bookings/${child.id}/check-in`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      console.log(
        'F183_EVIDENCE direct_checkin_on_child',
        JSON.stringify({ status: checkinRes.status, code: checkinRes.json?.error?.code }),
      );
      if (checkinRes.status !== 400 || checkinRes.json?.error?.code !== 'CHILD_BOOKING_NOT_MUTABLE') {
        throw new Error(
          `Expected 400 CHILD_BOOKING_NOT_MUTABLE checking in a child directly, got ${checkinRes.status}: ${checkinRes.raw}`,
        );
      }

      // Direct /confirm on a child id, via the internal key — a fresh HELD booking so the
      // guard is what fires, not the HELD-only precondition.
      const { pool: pool2, windows: windows2 } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1 });
      const create2 = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken('f183-direct-child-user-2')}`,
            'idempotency-key': 'f183-direct-child-key-2',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool2.id,
            windowId: windows2[0].id,
            additionalWindowIds: [windows2[1].id],
          }),
        }),
      );
      const parent2 = create2.json?.data ?? create2.json;
      const child2 = parent2.childBookings[0];
      const confirmChildRes = await inspect(
        await fetch(`${baseUrl}/bookings/${child2.id}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${internalKey}` },
        }),
      );
      console.log(
        'F183_EVIDENCE direct_confirm_on_child',
        JSON.stringify({ status: confirmChildRes.status, code: confirmChildRes.json?.error?.code }),
      );
      if (confirmChildRes.status !== 400 || confirmChildRes.json?.error?.code !== 'CHILD_BOOKING_NOT_MUTABLE') {
        throw new Error(
          `Expected 400 CHILD_BOOKING_NOT_MUTABLE confirming a child directly, got ${confirmChildRes.status}: ${confirmChildRes.raw}`,
        );
      }
    },
  },

  {
    name: 'F-183: GET /bookings/my excludes child rows for a multi-window booking\'s owner',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1 });
      const userId = 'f183-my-bookings-user';
      const token = guestToken(userId);

      const createRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'idempotency-key': 'f183-my-bookings-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      const parent = createRes.json?.data ?? createRes.json;
      const child = parent.childBookings[0];

      const myRes = await inspect(
        await fetch(`${baseUrl}/bookings/my`, { headers: { Authorization: `Bearer ${token}` } }),
      );
      if (myRes.status !== 200) {
        throw new Error(`Expected 200 from /bookings/my, got ${myRes.status}: ${myRes.raw}`);
      }
      const list = myRes.json?.data ?? myRes.json;
      const ids = list.map((b: any) => b.id);
      console.log('F183_EVIDENCE bookings_my', JSON.stringify({ parentIncluded: ids.includes(parent.id), childIncluded: ids.includes(child.id) }));
      if (!ids.includes(parent.id)) {
        throw new Error('Expected /bookings/my to include the parent booking');
      }
      if (ids.includes(child.id)) {
        throw new Error('Expected /bookings/my to exclude the child booking, but it was present');
      }
    },
  },

  {
    name: 'F-183: exceeding maxAdditionalWindows returns 400 INVALID_WINDOW_COUNT',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 3, maxAdditionalWindows: 1 });
      const res = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken('f183-count-violation-user')}`,
            'idempotency-key': 'f183-count-violation-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id, windows[2].id], // 2 additional, cap is 1
          }),
        }),
      );
      console.log('F183_EVIDENCE window_count_violation', JSON.stringify({ status: res.status, code: res.json?.error?.code }));
      if (res.status !== 400 || res.json?.error?.code !== 'INVALID_WINDOW_COUNT') {
        throw new Error(`Expected 400 INVALID_WINDOW_COUNT, got ${res.status}: ${res.raw}`);
      }
    },
  },

  {
    name: 'F-183: a non-contiguous additional window returns 400 NON_CONTIGUOUS_WINDOWS',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({
        hours: 2,
        maxAdditionalWindows: 1,
        gapBeforeLastHour: true, // second window starts 2 hours after the first, not 1
      });
      const res = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken('f183-noncontiguous-user')}`,
            'idempotency-key': 'f183-noncontiguous-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      console.log('F183_EVIDENCE non_contiguous', JSON.stringify({ status: res.status, code: res.json?.error?.code }));
      if (res.status !== 400 || res.json?.error?.code !== 'NON_CONTIGUOUS_WINDOWS') {
        throw new Error(`Expected 400 NON_CONTIGUOUS_WINDOWS, got ${res.status}: ${res.raw}`);
      }
    },
  },

  {
    name: 'F-183: a FIXED_INSTANCE resourceId mismatch across windows returns 400 RESOURCE_MISMATCH',
    async run() {
      const { pool, hour1A, hour2B } = await createTwoCourtFixedInstancePool();
      const res = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken('f183-resource-mismatch-user')}`,
            'idempotency-key': 'f183-resource-mismatch-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: hour1A.id, // Court A, hour 1
            additionalWindowIds: [hour2B.id], // Court B, hour 2 — same pool, contiguous time, wrong court
          }),
        }),
      );
      console.log('F183_EVIDENCE resource_mismatch', JSON.stringify({ status: res.status, code: res.json?.error?.code }));
      if (res.status !== 400 || res.json?.error?.code !== 'RESOURCE_MISMATCH') {
        throw new Error(`Expected 400 RESOURCE_MISMATCH, got ${res.status}: ${res.raw}`);
      }
    },
  },

  {
    name: 'F-183: an ordinary single-window booking (no additionalWindowIds) is unaffected — empty childBookings, unchanged price',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 1, maxAdditionalWindows: 1 });
      const res = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken('f183-regression-user')}`,
            'idempotency-key': 'f183-regression-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            // no additionalWindowIds at all — the pre-F-183 request shape
          }),
        }),
      );
      if (res.status !== 201) {
        throw new Error(`Expected 201 for an ordinary single-window booking, got ${res.status}: ${res.raw}`);
      }
      const booking = res.json?.data ?? res.json;
      console.log(
        'F183_EVIDENCE single_window_regression',
        JSON.stringify({ price: booking.price, childCount: booking.childBookings?.length, windowId: booking.windowId }),
      );
      if (Number(booking.price) !== 100) {
        throw new Error(`Expected unchanged single-window price 100, got ${booking.price}`);
      }
      if (booking.windowId !== windows[0].id) {
        throw new Error('Expected windowId to be the requested window, unchanged from pre-F-183 behavior');
      }
      if (!Array.isArray(booking.childBookings) || booking.childBookings.length !== 0) {
        throw new Error(`Expected an empty childBookings array for an ordinary booking, got ${JSON.stringify(booking.childBookings)}`);
      }
      if (booking.parentBookingId !== null) {
        throw new Error(`Expected parentBookingId to be null for an ordinary booking, got ${booking.parentBookingId}`);
      }
    },
  },

  {
    name: 'F-205: a multi-window POOLED booking on a resourced pool assigns one real Resource to the parent and every child',
    async run() {
      const { pool, windows } = await createPooledPoolWithWindows({ hours: 2, maxAdditionalWindows: 1 });
      // Add real Resource rows (capacity 4) so F-205's assignment path is exercised, not the fallback.
      const courts: any[] = [];
      for (let i = 1; i <= 4; i++) {
        const r = await fetch(`${baseUrl}/resource-pools/${pool.id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ name: `F-205 Court ${i}` }),
        });
        courts.push(((await r.json()) as any).data);
      }
      // F-225: courts default guestBookable:false — authorize them so this guest-path booking
      // exercises F-205's real-court assignment, not the resourceId:null fallback.
      await db.resource.updateMany({
        where: { id: { in: courts.map((c) => c.id) } },
        data: { guestBookable: true },
      });

      const userId = 'f205-multi-user';
      const createRes = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken(userId)}`,
            'idempotency-key': 'f205-multi-key',
          },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: pool.id,
            windowId: windows[0].id,
            additionalWindowIds: [windows[1].id],
          }),
        }),
      );
      if (createRes.status !== 201) {
        throw new Error(`Expected 201, got ${createRes.status}: ${createRes.raw}`);
      }
      const parent = createRes.json?.data ?? createRes.json;

      const rows = await db.booking.findMany({
        where: { OR: [{ id: parent.id }, { parentBookingId: parent.id }] },
        select: { id: true, resourceId: true, courtSlotIndex: true, parentBookingId: true },
      });
      console.log('F205_EVIDENCE multi_window', JSON.stringify(rows));
      if (rows.length !== 2) throw new Error(`Expected parent + 1 child, got ${rows.length} rows`);
      const resourceIds = new Set(rows.map((r) => r.resourceId));
      if (resourceIds.size !== 1 || rows[0].resourceId === null) {
        throw new Error(`Expected one real resourceId across parent + child, got ${JSON.stringify([...resourceIds])}`);
      }
      if (!courts.some((c) => c.id === rows[0].resourceId)) {
        throw new Error(`Assigned resourceId ${rows[0].resourceId} is not one of the pool's courts`);
      }
      const pos = courts.findIndex((c) => c.id === rows[0].resourceId) + 1;
      for (const r of rows) {
        if (r.courtSlotIndex !== pos) {
          throw new Error(`courtSlotIndex ${r.courtSlotIndex} on ${r.id} does not match the assigned court position ${pos}`);
        }
      }
    },
  },

  {
    // F-224: guest self-service pricing chain. Branch is timezone 'UTC' in these fixtures, so
    // a window's branch-local start-of-day minutes == its UTC hour*60. cleanDatabase() never
    // deletes the shared Branch row, so this section restores the guest-pricing columns in a
    // finally block — otherwise the FLAT-100/200 assertions in the sections above would break
    // on a re-run.
    name: 'F-224: guest booking price = branch guestPeakRate in a peak window, guestStandardRate outside, window.price still wins, defaultRate when unset',
    async run() {
      const poolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          name: `F-224 Guest Pricing Pool ${Date.now()}`,
          allocationMode: 'POOLED',
          capacity: 4,
        }),
      });
      const pool = ((await poolRes.json()) as any).data; // defaultRate defaults to 100.00
      await fetch(`${baseUrl}/booking-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ resourcePoolId: pool.id, cancellationPolicyJson: REGRESSION_TIERED_POLICY }),
      });

      let base = nextAlignedHour(3);
      while (base.getUTCHours() > 19) base = new Date(base.getTime() + 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const H = base.getUTCHours();

      const mkWindow = async (hourOffset: number) => {
        const start = new Date(base.getTime() + hourOffset * 60 * 60 * 1000);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const r = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 4 }),
        });
        return ((await r.json()) as any).data;
      };

      const book = async (windowId: string, user: string) => {
        const res = await inspect(
          await fetch(`${baseUrl}/bookings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${guestToken(user)}`,
              'idempotency-key': `f224-${user}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            },
            body: JSON.stringify({ branchId: BRANCH_ID, resourcePoolId: pool.id, windowId }),
          }),
        );
        if (res.status !== 201) throw new Error(`book ${windowId}: expected 201, got ${res.status}: ${res.raw}`);
        return (res.json?.data ?? res.json) as any;
      };

      try {
        const wStd = await mkWindow(0); // hour H
        const wPeak = await mkWindow(1); // hour H+1
        const wOverride = await mkWindow(2); // hour H+2

        // Peak window covers only hour H+1.
        await db.branch.update({
          where: { id: BRANCH_ID },
          data: {
            guestStandardRate: 200,
            guestPeakRate: 500,
            guestPeakWindows: [{ start: `${pad(H + 1)}:00`, end: `${pad(H + 2)}:00` }],
          },
        });
        // A per-window override on wOverride must still win ahead of the blanket rates.
        await db.availabilityWindow.update({ where: { id: wOverride.id }, data: { price: '999', pricingMode: 'FLAT' } });

        const bStd = await book(wStd.id, 'f224-std');
        if (Number(bStd.price) !== 200) throw new Error(`outside peak: expected guestStandardRate 200, got ${bStd.price}`);

        const bPeak = await book(wPeak.id, 'f224-peak');
        if (Number(bPeak.price) !== 500) throw new Error(`inside peak: expected guestPeakRate 500, got ${bPeak.price}`);

        const bOv = await book(wOverride.id, 'f224-ovr');
        if (Number(bOv.price) !== 999) throw new Error(`window.price override: expected 999, got ${bOv.price}`);

        // Peak window still set but peak rate cleared -> a booking in that same window now
        // falls through to guestStandardRate (200). wPeak has capacity 4, only 1 booking so far.
        await db.branch.update({ where: { id: BRANCH_ID }, data: { guestPeakRate: null } });
        const bPeakNoPeakRate = await book(wPeak.id, 'f224-peak-norate');
        if (Number(bPeakNoPeakRate.price) !== 200) {
          throw new Error(`peak window, no peak rate: expected guestStandardRate 200, got ${bPeakNoPeakRate.price}`);
        }

        // All guest fields cleared -> pool.defaultRate (100).
        await db.branch.update({
          where: { id: BRANCH_ID },
          data: { guestStandardRate: null, guestPeakRate: null, guestPeakWindows: [] },
        });
        const wPlain = await mkWindow(3);
        const bPlain = await book(wPlain.id, 'f224-plain');
        if (Number(bPlain.price) !== 100) throw new Error(`no guest fields: expected pool.defaultRate 100, got ${bPlain.price}`);

        console.log('F224_EVIDENCE', JSON.stringify({ standard: bStd.price, peak: bPeak.price, override: bOv.price, fallback: bPlain.price }));
      } finally {
        await db.branch.update({
          where: { id: BRANCH_ID },
          data: { guestStandardRate: null, guestPeakRate: null, guestPeakWindows: [] },
        });
      }
    },
  },
];
