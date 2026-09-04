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

/**
 * F-205: a POOLED pool with `capacity` real Resource rows, created in order so
 * `courts[i]` is the (i+1)-th court — position lines up with the cosmetic "Court N".
 *
 * F-225: courts created via POST /resources now default `guestBookable: false`. Authorize them
 * here (all of them, or the 1-based subset in `authorizeIndices`) so the F-205 real-court
 * assignment assertions below exercise the assignment path, not the resourceId:null fallback.
 */
async function createResourcedPooledPool(
  capacity: number,
  authorizeIndices?: number[],
): Promise<{ pool: any; courts: any[] }> {
  const pool = await createPooledPool(capacity);
  const courts: any[] = [];
  for (let i = 1; i <= capacity; i++) {
    const res = await fetch(`${baseUrl}/resource-pools/${pool.id}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
      body: JSON.stringify({ name: `Court ${i}` }),
    });
    courts.push(((await res.json()) as any).data);
  }
  const authorizedIds = authorizeIndices
    ? courts.filter((_, i) => authorizeIndices.includes(i + 1)).map((c) => c.id)
    : courts.map((c) => c.id);
  await db.resource.updateMany({ where: { id: { in: authorizedIds } }, data: { guestBookable: true } });
  return { pool, courts };
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

  // ── F-205: automatic real-court assignment (resourced pools) ──────────────────────

  {
    name: 'F-205: a POOLED self-service booking is assigned a real Resource; courtSlotIndex matches its 1-based position',
    async run() {
      const { pool, courts } = await createResourcedPooledPool(4);
      const window = await createWindow(pool.id, 30, 4);
      const res = await bookWindow('f205-selfservice-user', 'f205-selfservice-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.raw}`);
      const booking = res.json?.data ?? res.json;
      // Real DB read-back, not just the API response.
      const row = await db.booking.findUnique({
        where: { id: booking.id },
        select: { resourceId: true, courtSlotIndex: true },
      });
      console.log('F205_EVIDENCE selfservice_first', JSON.stringify(row));
      if (row?.resourceId !== courts[0].id) {
        throw new Error(`Expected resourceId ${courts[0].id} (Court 1), got ${row?.resourceId}`);
      }
      if (row?.courtSlotIndex !== 1) {
        throw new Error(`Expected courtSlotIndex 1 to match Court 1's position, got ${row?.courtSlotIndex}`);
      }
    },
  },

  {
    name: 'F-205: concurrent bookings on a resourced pool each get a distinct real Resource, courtSlotIndex tracking it',
    async run() {
      const { pool, courts } = await createResourcedPooledPool(3);
      const window = await createWindow(pool.id, 31, 3);
      const results = await Promise.all([
        bookWindow('f205-conc-1', 'f205-conc-1-key', { branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id }),
        bookWindow('f205-conc-2', 'f205-conc-2-key', { branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id }),
        bookWindow('f205-conc-3', 'f205-conc-3-key', { branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id }),
      ]);
      for (const r of results) {
        if (r.status !== 201) throw new Error(`Expected 201 for every concurrent hold, got ${r.status}: ${r.raw}`);
      }
      const rows = await db.booking.findMany({
        where: { windowId: window.id },
        select: { resourceId: true, courtSlotIndex: true },
      });
      console.log('F205_EVIDENCE concurrent', JSON.stringify(rows));
      const ids = rows.map((x) => x.resourceId);
      if (new Set(ids).size !== 3) throw new Error(`Expected 3 distinct real resourceIds, got ${JSON.stringify(ids)}`);
      for (const x of rows) {
        if (!courts.some((c) => c.id === x.resourceId)) {
          throw new Error(`Assigned resourceId ${x.resourceId} is not one of the pool's real courts`);
        }
        const pos = courts.findIndex((c) => c.id === x.resourceId) + 1;
        if (x.courtSlotIndex !== pos) {
          throw new Error(`courtSlotIndex ${x.courtSlotIndex} does not match the assigned court's position ${pos}`);
        }
      }
    },
  },

  {
    name: 'F-205: a negotiated (single-slot flow) booking on a resourced pool is also assigned a real Resource',
    async run() {
      const { pool, courts } = await createResourcedPooledPool(2);
      const window = await createWindow(pool.id, 32, 2);
      const res = await bookNegotiated('f205-neg-user', 'f205-neg-key', {
        resourcePoolId: pool.id,
        windowId: window.id,
        negotiatedPrice: 250,
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.raw}`);
      const booking = res.json?.data ?? res.json;
      const row = await db.booking.findUnique({
        where: { id: booking.id },
        select: { resourceId: true, courtSlotIndex: true },
      });
      console.log('F205_EVIDENCE negotiated', JSON.stringify(row));
      if (row?.resourceId !== courts[0].id) throw new Error(`Expected Court 1 (${courts[0].id}), got ${row?.resourceId}`);
      if (row?.courtSlotIndex !== 1) throw new Error(`Expected courtSlotIndex 1, got ${row?.courtSlotIndex}`);
    },
  },

  {
    name: 'F-205: a POOLED pool with no Resource rows still falls back to resourceId null + occupancy-scan index (unchanged)',
    async run() {
      const pool = await createPooledPool(4); // deliberately no resources
      const window = await createWindow(pool.id, 33, 4);
      const res = await bookWindow('f205-fallback-user', 'f205-fallback-key', {
        branchId: BRANCH_ID,
        resourcePoolId: pool.id,
        windowId: window.id,
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${res.raw}`);
      const booking = res.json?.data ?? res.json;
      const row = await db.booking.findUnique({
        where: { id: booking.id },
        select: { resourceId: true, courtSlotIndex: true },
      });
      console.log('F205_EVIDENCE fallback', JSON.stringify(row));
      if (row?.resourceId !== null) {
        throw new Error(`Expected resourceId null for a resource-less pool, got ${row?.resourceId}`);
      }
      if (row?.courtSlotIndex !== 1) {
        throw new Error(`Expected fallback courtSlotIndex 1 (F-186 scan), got ${row?.courtSlotIndex}`);
      }
    },
  },

  // ── F-225: per-court guest eligibility ──────────────────────────────────────────────

  {
    name: 'F-225: a guest booking skips a court not authorized for guests; courtSlotIndex stays synced to real position',
    async run() {
      // Capacity 3, courts 1 and 3 authorized, court 2 NOT.
      const { pool, courts } = await createResourcedPooledPool(3, [1, 3]);
      const window = await createWindow(pool.id, 40, 3);

      const first = await bookWindow('f225-guest-1', 'f225-guest-1-key', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
      });
      if (first.status !== 201) throw new Error(`first booking: expected 201, got ${first.status}: ${first.raw}`);
      const b1 = first.json?.data ?? first.json;
      const r1 = await db.booking.findUnique({ where: { id: b1.id }, select: { resourceId: true, courtSlotIndex: true } });
      if (r1?.resourceId !== courts[0].id || r1?.courtSlotIndex !== 1) {
        throw new Error(`first booking: expected Court 1 / index 1, got ${JSON.stringify(r1)}`);
      }

      const second = await bookWindow('f225-guest-2', 'f225-guest-2-key', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
      });
      if (second.status !== 201) throw new Error(`second booking: expected 201, got ${second.status}: ${second.raw}`);
      const b2 = second.json?.data ?? second.json;
      const r2 = await db.booking.findUnique({ where: { id: b2.id }, select: { resourceId: true, courtSlotIndex: true } });
      // Court 2 is unauthorized → skipped. Assigned Court 3, and courtSlotIndex tracks its REAL
      // position (3), not compacted to 2.
      if (r2?.resourceId !== courts[2].id || r2?.courtSlotIndex !== 3) {
        throw new Error(`second booking: expected Court 3 / index 3 (2 skipped, numbering not compacted), got ${JSON.stringify(r2)}`);
      }
      console.log('F225_EVIDENCE guest_skip', JSON.stringify({ first: r1, second: r2 }));
    },
  },

  {
    name: 'F-225: a negotiated booking still lands on a court not authorized for guests',
    async run() {
      const { pool, courts } = await createResourcedPooledPool(3, [1, 3]); // court 2 not guest-authorized
      const window = await createWindow(pool.id, 41, 3);

      // Fill courts 1 and 3 with guest bookings first.
      for (const [i, key] of [['a', 'f225-neg-fill-a'], ['b', 'f225-neg-fill-b']] as const) {
        const r = await bookWindow(`f225-neg-fill-${i}`, `${key}-key`, {
          branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
        });
        if (r.status !== 201) throw new Error(`fill ${i}: expected 201, got ${r.status}: ${r.raw}`);
      }

      // A negotiated booking now must take court 2 — the only one free — even though it is not
      // guest-authorized. The admin/negotiated path does not filter on guestBookable.
      const neg = await bookNegotiated('f225-neg-user', 'f225-neg-key', {
        resourcePoolId: pool.id, windowId: window.id, negotiatedPrice: 200,
      });
      if (neg.status !== 201) throw new Error(`negotiated: expected 201, got ${neg.status}: ${neg.raw}`);
      const nb = neg.json?.data ?? neg.json;
      const nr = await db.booking.findUnique({ where: { id: nb.id }, select: { resourceId: true, courtSlotIndex: true } });
      if (nr?.resourceId !== courts[1].id || nr?.courtSlotIndex !== 2) {
        throw new Error(`negotiated: expected Court 2 / index 2 (unauthorized court still assignable by admin), got ${JSON.stringify(nr)}`);
      }
      console.log('F225_EVIDENCE negotiated_unfiltered', JSON.stringify(nr));
    },
  },

  {
    name: 'F-225: a guest booking with no authorized court free falls back to resourceId:null (no rejection)',
    async run() {
      // Capacity 3, only court 1 authorized for guests.
      const { pool, courts } = await createResourcedPooledPool(3, [1]);
      const window = await createWindow(pool.id, 42, 3);

      const first = await bookWindow('f225-full-1', 'f225-full-1-key', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
      });
      if (first.status !== 201) throw new Error(`first: expected 201, got ${first.status}: ${first.raw}`);
      const r1 = await db.booking.findUnique({ where: { id: (first.json?.data ?? first.json).id }, select: { resourceId: true } });
      if (r1?.resourceId !== courts[0].id) throw new Error(`first: expected Court 1, got ${r1?.resourceId}`);

      // Court 1 (the only authorized one) is now taken; capacity is 3 so the booking is still
      // accepted, but assignPooledCourt has no guest-authorized court free → resourceId null.
      const second = await bookWindow('f225-full-2', 'f225-full-2-key', {
        branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id,
      });
      if (second.status !== 201) throw new Error(`second: expected 201 (not a rejection), got ${second.status}: ${second.raw}`);
      const r2 = await db.booking.findUnique({
        where: { id: (second.json?.data ?? second.json).id },
        select: { resourceId: true, courtSlotIndex: true },
      });
      if (r2?.resourceId !== null) {
        throw new Error(`second: expected resourceId null fallback (no authorized court free), got ${r2?.resourceId}`);
      }
      console.log('F225_EVIDENCE no_authorized_free', JSON.stringify(r2));
    },
  },
];
