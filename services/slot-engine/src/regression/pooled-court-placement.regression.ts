import { randomUUID } from 'crypto';
import { Section } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * F-269 — a POOLED pool's AvailabilityWindow is shared by every court (resourceId null). The
 * Guest Slot Inventory grid and the Guest Dashboard's live allocation used to mark EVERY court
 * booked (with the same guest) whenever the shared window had any booking. Each booking is now
 * drawn on its own court only: its real F-205 resourceId, else its courtSlotIndex court if free,
 * else the first free court in Court N (createdAt) order.
 */

const auth = { Authorization: `Bearer ${internalKey}` };

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

function at(dateString: string, hour: number): Date {
  return new Date(`${dateString}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

async function makePool(label: string, allocationMode: 'POOLED' | 'FIXED_INSTANCE', courtCount: number) {
  const pool = await db.resourcePool.create({
    data: { tenantId: TENANT_ID, branchId: BRANCH_ID, name: `F-269 ${label} ${Date.now()}`, allocationMode, capacity: courtCount },
  });
  const courts = [];
  // Sequential on purpose: createdAt order IS "Court N" order.
  for (let i = 1; i <= courtCount; i++) {
    courts.push(await db.resource.create({ data: { resourcePoolId: pool.id, name: `Court ${i}`, guestBookable: true } }));
  }
  return { pool, courts };
}

async function makeWindow(poolId: string, start: Date, resourceId: string | null = null, capacity = 4) {
  return db.availabilityWindow.create({
    data: { resourcePoolId: poolId, resourceId, startTime: start, endTime: new Date(start.getTime() + 3600000), capacity },
  });
}

async function makeBooking(
  poolId: string,
  windowId: string,
  opts: { resourceId?: string | null; courtSlotIndex?: number | null; status?: BookingStatus; userId?: string },
) {
  return db.booking.create({
    data: {
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      resourcePoolId: poolId,
      windowId,
      userId: opts.userId ?? `f269-user-${randomUUID()}`,
      status: opts.status ?? BookingStatus.CONFIRMED,
      heldUntil: new Date(),
      isMemberBooking: false,
      resourceId: opts.resourceId ?? null,
      courtSlotIndex: opts.courtSlotIndex ?? null,
    },
  });
}

async function grid(poolId: string, date: string) {
  const url = new URL(`/branches/${BRANCH_ID}/guest-inventory-grid`, baseUrl);
  url.searchParams.set('date', date);
  url.searchParams.set('poolId', poolId);
  const res = await fetch(url, { headers: auth });
  if (res.status !== 200) throw new Error(`guest-inventory-grid: expected 200, got ${res.status}: ${await res.text()}`);
  return ((await res.json()) as any).data as { resources: { id: string }[]; cells: any[] };
}

function cellsAt(cells: any[], start: Date) {
  const iso = start.toISOString();
  return cells.filter((c) => c.startTime === iso);
}

async function cleanupPool(poolId: string) {
  await db.booking.deleteMany({ where: { resourcePoolId: poolId } });
  await db.availabilityWindow.deleteMany({ where: { resourcePoolId: poolId } });
  await db.resource.deleteMany({ where: { resourcePoolId: poolId } });
  await db.resourcePool.delete({ where: { id: poolId } });
}

export const pooledCourtPlacementSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-269: inventory grid draws each POOLED booking on its own court only -- real court, no-court fallback, courtSlotIndex, and elapsed completed/cancelled',
    async run() {
      const { pool, courts } = await makePool('grid', 'POOLED', 4);
      const [c1, c2, c3, c4] = courts;
      const tomorrow = utcDate(1);
      const yesterday = utcDate(-1);
      try {
        // (a) one booking on court 3 -> only court 3 booked (the reported JBC shape).
        const w1 = await makeWindow(pool.id, at(tomorrow, 10));
        const b1 = await makeBooking(pool.id, w1.id, { resourceId: c3.id, courtSlotIndex: 3 });
        // (b)+(c) a real-court booking on court 2 plus a no-court booking -> no-court goes to the
        // first free court (court 1); exactly two booked cells.
        const w2 = await makeWindow(pool.id, at(tomorrow, 11));
        const b2 = await makeBooking(pool.id, w2.id, { resourceId: c2.id, courtSlotIndex: 2 });
        const b2b = await makeBooking(pool.id, w2.id, {});
        // courtSlotIndex-only booking -> its indexed court (court 4).
        const w3 = await makeWindow(pool.id, at(tomorrow, 12));
        const b3 = await makeBooking(pool.id, w3.id, { courtSlotIndex: 4 });

        const g = await grid(pool.id, tomorrow);
        const columnOrder = g.resources.map((r) => r.id);
        if (JSON.stringify(columnOrder) !== JSON.stringify(courts.map((c) => c.id))) {
          throw new Error(`Expected columns in Court N (createdAt) order, got ${JSON.stringify(columnOrder)}`);
        }

        const byCourt = (cells: any[]) => Object.fromEntries(cells.map((c) => [c.resourceId, c]));
        const r1 = byCourt(cellsAt(g.cells, at(tomorrow, 10)));
        console.log('F269_EVIDENCE one_booking', JSON.stringify(courts.map((c) => r1[c.id].type)));
        if (r1[c3.id].type !== 'guest-booked' || r1[c3.id].bookingId !== b1.id) throw new Error(`court 3 should be booked by ${b1.id}, got ${JSON.stringify(r1[c3.id])}`);
        for (const c of [c1, c2, c4]) {
          if (r1[c.id].type !== 'guest-vacant') throw new Error(`${c.name} should be guest-vacant, got ${r1[c.id].type}`);
        }

        const r2 = byCourt(cellsAt(g.cells, at(tomorrow, 11)));
        console.log('F269_EVIDENCE real_plus_nocourt', JSON.stringify(courts.map((c) => r2[c.id].type)));
        if (r2[c2.id].bookingId !== b2.id) throw new Error(`court 2 should hold its real booking ${b2.id}, got ${JSON.stringify(r2[c2.id])}`);
        if (r2[c1.id].bookingId !== b2b.id) throw new Error(`the no-court booking should land on court 1 (first free), got ${JSON.stringify(r2[c1.id])}`);
        if (r2[c3.id].type !== 'guest-vacant' || r2[c4.id].type !== 'guest-vacant') throw new Error('courts 3 and 4 should be guest-vacant');

        const r3 = byCourt(cellsAt(g.cells, at(tomorrow, 12)));
        if (r3[c4.id].bookingId !== b3.id) throw new Error(`the courtSlotIndex=4 booking should land on court 4, got ${JSON.stringify(r3[c4.id])}`);
        if ([c1, c2, c3].some((c) => r3[c.id].type !== 'guest-vacant')) throw new Error('courts 1-3 should be guest-vacant at 12:00');

        // (d) elapsed window: a completed booking on court 1 and a cancelled one on court 2.
        const w4 = await makeWindow(pool.id, at(yesterday, 10));
        const b4 = await makeBooking(pool.id, w4.id, { resourceId: c1.id, courtSlotIndex: 1 });
        const b4c = await makeBooking(pool.id, w4.id, { resourceId: c2.id, courtSlotIndex: 2, status: BookingStatus.CANCELLED });
        const gy = await grid(pool.id, yesterday);
        const r4 = byCourt(cellsAt(gy.cells, at(yesterday, 10)));
        console.log('F269_EVIDENCE elapsed', JSON.stringify(courts.map((c) => r4[c.id].type)));
        if (r4[c1.id].type !== 'completed' || r4[c1.id].bookingId !== b4.id) throw new Error(`court 1 should be completed, got ${JSON.stringify(r4[c1.id])}`);
        if (r4[c2.id].type !== 'cancelled' || r4[c2.id].bookingId !== b4c.id) throw new Error(`court 2 should be cancelled, got ${JSON.stringify(r4[c2.id])}`);
        if (r4[c3.id].type !== 'elapsed' || r4[c4.id].type !== 'elapsed') throw new Error('courts 3 and 4 should be elapsed');
      } finally {
        await cleanupPool(pool.id);
      }
    },
  },

  {
    name: 'F-269: FIXED_INSTANCE pools are unchanged -- a per-court window marks only its own court',
    async run() {
      const { pool, courts } = await makePool('fixed', 'FIXED_INSTANCE', 2);
      const [cA, cB] = courts;
      const tomorrow = utcDate(1);
      try {
        const w = await makeWindow(pool.id, at(tomorrow, 10), cA.id, 1);
        const b = await makeBooking(pool.id, w.id, { resourceId: cA.id });
        const g = await grid(pool.id, tomorrow);
        const row = Object.fromEntries(cellsAt(g.cells, at(tomorrow, 10)).map((c) => [c.resourceId, c]));
        if (row[cA.id].type !== 'guest-booked' || row[cA.id].bookingId !== b.id) throw new Error(`court A should be booked, got ${JSON.stringify(row[cA.id])}`);
        if (row[cB.id].type !== 'empty') throw new Error(`court B has no window and should be empty, got ${row[cB.id].type}`);
      } finally {
        await cleanupPool(pool.id);
      }
    },
  },

  {
    name: "F-269: dashboard live allocation shows 'guest' (with that guest's name) only on the court the booking is on",
    async run() {
      const { pool, courts } = await makePool('live', 'POOLED', 4);
      const [c1, c2, c3, c4] = courts;
      const user = await db.user.create({
        data: { tenantId: TENANT_ID, phone: `+9190269${String(Date.now()).slice(-5)}`, name: 'F269 Live Guest', userType: 'GUEST', isPhoneVerified: true },
      });
      try {
        // A window covering "now" (the dashboard's live snapshot needs startTime <= now < endTime).
        const start = new Date(Date.now() - 10 * 60000);
        const w = await makeWindow(pool.id, start);
        await makeBooking(pool.id, w.id, { resourceId: c2.id, courtSlotIndex: 2, userId: user.id });

        const res = await fetch(`${baseUrl}/branches/${BRANCH_ID}/guest-occupancy-dashboard?date=${start.toISOString().slice(0, 10)}`, { headers: auth });
        if (res.status !== 200) throw new Error(`guest-occupancy-dashboard: expected 200, got ${res.status}: ${await res.text()}`);
        const body = ((await res.json()) as any).data;
        const live = Object.fromEntries(
          body.liveAllocation.filter((a: any) => courts.some((c) => c.id === a.resourceId)).map((a: any) => [a.resourceId, a]),
        );
        console.log('F269_EVIDENCE live_allocation', JSON.stringify(courts.map((c) => [live[c.id]?.status, live[c.id]?.guestName])));
        if (live[c2.id]?.status !== 'guest' || live[c2.id]?.guestName !== 'F269 Live Guest') {
          throw new Error(`court 2 should be 'guest' with the booking's guest name, got ${JSON.stringify(live[c2.id])}`);
        }
        for (const c of [c1, c3, c4]) {
          if (live[c.id]?.status !== 'open') throw new Error(`${c.name} should be 'open', got ${JSON.stringify(live[c.id])}`);
        }
      } finally {
        await cleanupPool(pool.id);
        await db.user.delete({ where: { id: user.id } });
      }
    },
  },
];
