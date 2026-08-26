import { Section, inspect } from '@badminton/test-harness';
import {
  db,
  baseUrl,
  internalKey,
  bookingHeaders,
  guestToken,
  nextAlignedHour,
  TENANT_ID,
  BRANCH_ID,
  SlotEngineContext,
} from './_fixtures';

/**
 * F-186 — courtSlotIndex.
 *
 * A display-only "Court N" number for POOLED pools, assigned once per booking and
 * identical on the parent and every child. Computed by unioning the occupied
 * courtSlotIndex values (active HELD/CONFIRMED bookings) across every window a
 * booking touches, then taking the lowest integer in 1..pool.capacity absent from
 * that union. If no such integer exists the booking still succeeds — the existing
 * per-window capacity check is what actually governs validity — and courtSlotIndex
 * is left null. Applies identically to self-service POST /bookings and to
 * POST /bookings/negotiated, which shares the same real capacity pool per window
 * but is single-window (no lockedWindows array, no parent/child cascade).
 *
 * Self-contained: every pool/rule/window here is created fresh per section via the
 * HTTP API, reusing TENANT_ID/BRANCH_ID from _fixtures.ts (already seeded by
 * setupBaseFixtures() before any section runs). Every booking in this suite uses a
 * distinct userId so F-184's daily cap never interferes with index-assignment
 * assertions.
 */

async function createPooledPool(capacity: number, maxAdditionalWindows = 1): Promise<any> {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-186 Pool ${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
      maxAdditionalWindows,
      cancellationPolicyJson: { type: 'tiered', tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }] },
    }),
  });

  return pool;
}

async function createWindow(poolId: string, hoursFromNow: number, capacity: number): Promise<any> {
  const startTime = nextAlignedHour(hoursFromNow);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const res = await fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), capacity }),
  });
  return ((await res.json()) as any).data;
}

async function bookWindow(userId: string, idempotencyKey: string, body: Record<string, any>) {
  return inspect(
    await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: bookingHeaders(userId, idempotencyKey),
      body: JSON.stringify(body),
    }),
  );
}

async function bookNegotiated(userId: string, idempotencyKey: string, body: Record<string, any>) {
  return inspect(
    await fetch(`${baseUrl}/bookings/negotiated`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalKey}`,
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ tenantId: TENANT_ID, branchId: BRANCH_ID, userId, ...body }),
    }),
  );
}

async function cancelBooking(userId: string, bookingId: string) {
  const res = await inspect(
    await fetch(`${baseUrl}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken(userId)}` },
      body: '{}',
    }),
  );
  if (res.status !== 200) {
    throw new Error(`Expected 200 cancelling booking ${bookingId} as ${userId}, got ${res.status}: ${res.raw}`);
  }
  return res;
}

export const courtSlotIndexSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-186: single-window booking into an empty pool gets courtSlotIndex 1',
    async run() {
      const pool = await createPooledPool(4);
      const window = await createWindow(pool.id, 20, 4);
      const res = await bookWindow('f186-single-user', 'f186-single-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.raw}`);
      const booking = res.json?.data ?? res.json;
      console.log('F186_EVIDENCE single_window', JSON.stringify({ courtSlotIndex: booking.courtSlotIndex }));
      if (booking.courtSlotIndex !== 1) {
        throw new Error(`Expected courtSlotIndex 1, got ${JSON.stringify(booking.courtSlotIndex)}`);
      }
    },
  },

  {
    name: 'F-186: second concurrent booking on the same window gets courtSlotIndex 2, not 1',
    async run() {
      const pool = await createPooledPool(4);
      const window = await createWindow(pool.id, 21, 4);
      const first = await bookWindow('f186-concurrent-user-1', 'f186-concurrent-key-1', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      const second = await bookWindow('f186-concurrent-user-2', 'f186-concurrent-key-2', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      if (first.status !== 201 || second.status !== 201) {
        throw new Error(`Expected both bookings to succeed, got ${first.status} / ${second.status}`);
      }
      const b1 = first.json?.data ?? first.json;
      const b2 = second.json?.data ?? second.json;
      console.log(
        'F186_EVIDENCE concurrent_second',
        JSON.stringify({ first: b1.courtSlotIndex, second: b2.courtSlotIndex }),
      );
      if (b1.courtSlotIndex !== 1 || b2.courtSlotIndex !== 2) {
        throw new Error(`Expected indices 1 then 2, got ${b1.courtSlotIndex} then ${b2.courtSlotIndex}`);
      }
    },
  },

  {
    name:
      'F-186: multi-window booking spanning two windows with different pre-existing occupancy ' +
      'gets one shared index equal to the lowest free index across the union of both windows',
    async run() {
      const pool = await createPooledPool(4, 2);
      const windowA = await createWindow(pool.id, 22, 4);
      const windowB = await createWindow(pool.id, 23, 4);

      // Pre-occupy index 1 on A only, and indices 1+2 on B, so the lowest index free on
      // BOTH windows is 3 -- proving the union spans every window the booking touches,
      // not just lockedWindows[0].
      await bookWindow('f186-multi-preoccupy-a1', 'f186-multi-preoccupy-a1-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowA.id,
      });
      await bookWindow('f186-multi-preoccupy-b1', 'f186-multi-preoccupy-b1-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowB.id,
      });
      await bookWindow('f186-multi-preoccupy-b2', 'f186-multi-preoccupy-b2-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowB.id,
      });

      const multi = await bookWindow('f186-multi-user', 'f186-multi-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowA.id,
        additionalWindowIds: [windowB.id],
      });
      if (multi.status !== 201) throw new Error(`Expected 201, got ${multi.status}: ${multi.raw}`);
      const parent = multi.json?.data ?? multi.json;
      console.log(
        'F186_EVIDENCE multi_window',
        JSON.stringify({
          parentIndex: parent.courtSlotIndex,
          childIndices: (parent.childBookings || []).map((c: any) => c.courtSlotIndex),
        }),
      );
      if (parent.courtSlotIndex !== 3) {
        throw new Error(
          `Expected parent courtSlotIndex 3 (lowest free across the union of both windows), got ${parent.courtSlotIndex}`,
        );
      }
      if (
        !Array.isArray(parent.childBookings) ||
        parent.childBookings.length !== 1 ||
        parent.childBookings[0].courtSlotIndex !== 3
      ) {
        throw new Error(`Expected exactly 1 child with courtSlotIndex 3, got ${JSON.stringify(parent.childBookings)}`);
      }
    },
  },

  {
    name: 'F-186: no common index across all touched windows leaves courtSlotIndex null without rejecting the booking',
    async run() {
      const pool = await createPooledPool(2, 2);
      const windowA = await createWindow(pool.id, 24, 2);
      const windowB = await createWindow(pool.id, 25, 2);

      // Engineer: A ends with only index 2 active (index 1 free); B ends with only
      // index 1 active (index 2 free). Union across A+B = {1, 2} -- no index free in
      // 1..2 even though each window individually still has room (activeCount 1 < 2).
      const a1 = await bookWindow('f186-nocommon-a1', 'f186-nocommon-a1-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowA.id,
      });
      await bookWindow('f186-nocommon-a2', 'f186-nocommon-a2-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowA.id,
      });
      const a1Booking = a1.json?.data ?? a1.json;
      await cancelBooking('f186-nocommon-a1', a1Booking.id);

      await bookWindow('f186-nocommon-b1', 'f186-nocommon-b1-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowB.id,
      });
      const b2 = await bookWindow('f186-nocommon-b2', 'f186-nocommon-b2-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowB.id,
      });
      const b2Booking = b2.json?.data ?? b2.json;
      await cancelBooking('f186-nocommon-b2', b2Booking.id);

      const activeA = await db.booking.findMany({
        where: { windowId: windowA.id, status: { in: ['HELD', 'CONFIRMED'] as any } },
      });
      const activeB = await db.booking.findMany({
        where: { windowId: windowB.id, status: { in: ['HELD', 'CONFIRMED'] as any } },
      });
      console.log(
        'F186_EVIDENCE nocommon_setup',
        JSON.stringify({
          activeAIndices: activeA.map((b: any) => b.courtSlotIndex),
          activeBIndices: activeB.map((b: any) => b.courtSlotIndex),
        }),
      );

      const multi = await bookWindow('f186-nocommon-user', 'f186-nocommon-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: windowA.id,
        additionalWindowIds: [windowB.id],
      });
      const parent = multi.json?.data ?? multi.json;
      console.log(
        'F186_EVIDENCE nocommon_result',
        JSON.stringify({ status: multi.status, courtSlotIndex: parent?.courtSlotIndex }),
      );
      if (multi.status !== 201) {
        throw new Error(`Expected the booking to still succeed (capacity independently allows it), got ${multi.status}: ${multi.raw}`);
      }
      if (parent.courtSlotIndex !== null) {
        throw new Error(`Expected courtSlotIndex null (no common free index across both windows), got ${parent.courtSlotIndex}`);
      }
      if (
        !Array.isArray(parent.childBookings) ||
        parent.childBookings.length !== 1 ||
        parent.childBookings[0].courtSlotIndex !== null
      ) {
        throw new Error(`Expected the 1 child to also have courtSlotIndex null, got ${JSON.stringify(parent.childBookings)}`);
      }
    },
  },

  {
    name: 'F-186: cancelling a booking frees its courtSlotIndex for a later booking on the same window',
    async run() {
      const pool = await createPooledPool(4);
      const window = await createWindow(pool.id, 26, 4);
      const first = await bookWindow('f186-cancel-release-1', 'f186-cancel-release-1-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      const firstBooking = first.json?.data ?? first.json;
      if (firstBooking.courtSlotIndex !== 1) {
        throw new Error(`Expected first booking to take index 1, got ${firstBooking.courtSlotIndex}`);
      }
      await cancelBooking('f186-cancel-release-1', firstBooking.id);

      const second = await bookWindow('f186-cancel-release-2', 'f186-cancel-release-2-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      const secondBooking = second.json?.data ?? second.json;
      console.log('F186_EVIDENCE cancel_release', JSON.stringify({ secondIndex: secondBooking.courtSlotIndex }));
      if (secondBooking.courtSlotIndex !== 1) {
        throw new Error(`Expected the freed index 1 to be reassigned to the new booking, got ${secondBooking.courtSlotIndex}`);
      }
    },
  },

  {
    name:
      "F-186: a negotiated booking and a self-service booking on the same window see each other's " +
      'courtSlotIndex assignments',
    async run() {
      const pool = await createPooledPool(4);
      const window = await createWindow(pool.id, 27, 4);

      const negotiated = await bookNegotiated('f186-negotiated-user', 'f186-negotiated-key', {
        resourcePoolId: pool.id,
        windowId: window.id,
        negotiatedPrice: 200,
      });
      if (negotiated.status !== 201) {
        throw new Error(`Expected 201 for negotiated booking, got ${negotiated.status}: ${negotiated.raw}`);
      }
      const negotiatedBooking = negotiated.json?.data ?? negotiated.json;
      if (negotiatedBooking.courtSlotIndex !== 1) {
        throw new Error(`Expected negotiated booking to take index 1, got ${negotiatedBooking.courtSlotIndex}`);
      }

      const selfService = await bookWindow('f186-negotiated-selfservice-user', 'f186-negotiated-selfservice-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      const selfServiceBooking = selfService.json?.data ?? selfService.json;
      console.log(
        'F186_EVIDENCE negotiated_crossvisibility',
        JSON.stringify({
          negotiatedIndex: negotiatedBooking.courtSlotIndex,
          selfServiceIndex: selfServiceBooking.courtSlotIndex,
        }),
      );
      if (selfServiceBooking.courtSlotIndex !== 2) {
        throw new Error(
          `Expected the self-service booking to see the negotiated booking's index and take 2, got ${selfServiceBooking.courtSlotIndex}`,
        );
      }
    },
  },
];
