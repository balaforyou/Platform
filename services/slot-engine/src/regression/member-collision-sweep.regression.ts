import { Section, signJwt } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, guestToken, bookingHeaders, withinTodayUtc, SlotEngineContext, TENANT_ID, BRANCH_ID, defaultTermDates } from './_fixtures';

/** withinTodayUtc, rounded down to the top of the hour -- stays within today (margin already
 *  built into withinTodayUtc) while landing on a 60-minute pattern slot boundary. */
function alignedHourWithinToday(minutesAhead: number): Date {
  const date = withinTodayUtc(minutesAhead);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

/**
 * F-207.2 — Member/guest slot collision: ongoing exclusion, the entitlement gate, the
 * ensureTodayMemberBooking defensive capacity guard, and the one-time relocate/cancel sweep.
 *
 * This service's own regression run never starts the payment service (unlike payment's own
 * suite, which starts slot-engine + identity-auth), so the sweep's cancel+refund branch is only
 * proven here up to "the booking really was cancelled" -- the cross-service POST /refunds leg is
 * unreachable in this isolated process and correctly surfaces in the returned collisionSweep's
 * `failed` array rather than silently succeeding. The full cancel-then-refund chain and the
 * disable-module live scenario are proven separately against the real dev stack (see the F-207.2
 * evidence report), not duplicated here as a mocked substitute.
 */

async function makePool(label: string, capacity: number, tenantId: string = TENANT_ID, branchId: string = BRANCH_ID) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: `F-207.2 ${label} ${Date.now()}`,
      allocationMode: 'POOLED',
      capacity,
      basePrice: 200,
      defaultRate: 200,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;
  await db.bookingRule.create({
    data: { resourcePoolId: pool.id, guestOpenWindowDays: 7, cancellationPolicyJson: { type: 'tiered', tiers: [] } },
  });
  // F-169: POST /member-group-assignments rejects a schedule no active pattern covers --
  // needed here since these sections create real AvailabilityWindow rows directly (for precise
  // control of startTime) rather than through a pattern, but the assignment route itself still
  // requires one to exist. Broad enough (00:00-23:00, todayIsoWeekday, 60-min slots) to cover
  // every aligned-hour window these sections construct.
  await db.availabilityPattern.create({
    data: {
      resourcePoolId: pool.id,
      daysOfWeek: todayIsoWeekday(),
      startTime: '00:00',
      endTime: '23:00',
      slotDurationMinutes: 60,
      capacity,
      status: 'ACTIVE',
      ...defaultTermDates(),
    },
  });
  return pool;
}

function todayIsoWeekday(): string {
  const day = new Date().getUTCDay();
  return String(day === 0 ? 7 : day);
}

// F-207.2's relocation tiebreak considers EVERY POOLED sibling pool in the branch -- so the
// relocate/cancel sections below need their own isolated tenant+branch, not the shared
// TENANT_ID/BRANCH_ID other sections in this file (and this suite) also create pools under,
// or "no sibling exists" would be false by construction (an earlier section's pool in the same
// branch would count as an eligible sibling).
async function makeIsolatedTenantAndBranch(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tenant = await db.tenant.create({
    data: { name: `F-207.2 ${label} ${suffix}`, subdomain: `f2072-${label}-${suffix}`.toLowerCase().slice(0, 40) },
  });
  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: `F-207.2 ${label} branch`, status: 'ACTIVE', timezone: 'UTC' },
  });
  return { tenant, branch };
}

export const memberCollisionSweepSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-207.2: ongoing exclusion — GET /availability hides the window, POST /bookings rejects 409 MEMBER_SLOT_RESERVED, once an ACTIVE assignment covers it',
    async run() {
      const pool = await makePool('Exclusion Pool', 3);
      const windowStart = alignedHourWithinToday(6 * 60);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      await db.availabilityWindow.create({
        data: { resourcePoolId: pool.id, startTime: windowStart, endTime: windowEnd, capacity: 3 },
      });
      const startTimeStr = windowStart.toISOString().slice(11, 16);

      // Before the assignment exists: visible and bookable.
      const beforeAvail = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability?date=${windowStart.toISOString().slice(0, 10)}`);
      const beforeSlots = ((await beforeAvail.json()) as any).data;
      if (!beforeSlots.some((s: any) => s.window.id && new Date(s.window.startTime).getTime() === windowStart.getTime())) {
        throw new Error('F-207.2 setup: expected the window visible before any assignment exists');
      }

      const assignRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f207-2-excl-member', resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: startTimeStr }),
      });
      if (assignRes.status !== 201) {
        throw new Error(`F-207.2: expected assignment create 201, got ${assignRes.status}: ${JSON.stringify(await assignRes.json())}`);
      }

      // Display half: no longer in GET /availability.
      const afterAvail = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability?date=${windowStart.toISOString().slice(0, 10)}`);
      const afterSlots = ((await afterAvail.json()) as any).data;
      if (afterSlots.some((s: any) => new Date(s.window.startTime).getTime() === windowStart.getTime())) {
        throw new Error('F-207.2: expected the member-covered window to be hidden from GET /availability');
      }

      // Write half: a fresh guest booking attempt is rejected, not just hidden.
      const bookRes = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders('f207-2-excl-guest', 'f207-2-excl-key'),
        body: JSON.stringify({ branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: (await db.availabilityWindow.findFirst({ where: { resourcePoolId: pool.id, startTime: windowStart } }))!.id }),
      });
      if (bookRes.status !== 409) {
        throw new Error(`F-207.2: expected POST /bookings 409, got ${bookRes.status}`);
      }
      const bookBody = (await bookRes.json()) as any;
      if (bookBody.error?.code !== 'MEMBER_SLOT_RESERVED') {
        throw new Error(`F-207.2: expected MEMBER_SLOT_RESERVED, got ${JSON.stringify(bookBody.error)}`);
      }
      console.log('F-207.2 ongoing exclusion verified: hidden from GET /availability, POST /bookings 409 MEMBER_SLOT_RESERVED.');
    },
  },

  {
    name: 'F-207.2: entitlement-gated — exclusion only applies while MEMBER_MANAGEMENT is ACTIVE; a disabled module immediately frees the slot',
    async run() {
      const tenant = await db.tenant.create({ data: { name: `F-207.2 Entitlement ${Date.now()}`, subdomain: `f2072-ent-${Date.now()}` } });
      const branch = await db.branch.create({ data: { tenantId: tenant.id, name: 'F-207.2 Entitlement Branch', status: 'ACTIVE', timezone: 'UTC' } });
      await db.moduleEntitlement.create({
        data: { tenantId: tenant.id, module: 'MEMBER_MANAGEMENT', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 365 * 86400000) },
      });
      await db.moduleEntitlement.create({
        data: { tenantId: tenant.id, module: 'GUEST_BOOKING', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 365 * 86400000) },
      });

      const poolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ tenantId: tenant.id, branchId: branch.id, name: 'F-207.2 Entitlement Pool', allocationMode: 'POOLED', capacity: 2, basePrice: 150, defaultRate: 150 }),
      });
      const pool = ((await poolRes.json()) as any).data;
      await db.bookingRule.create({ data: { resourcePoolId: pool.id, guestOpenWindowDays: 7, cancellationPolicyJson: { type: 'tiered', tiers: [] } } });

      const windowStart = alignedHourWithinToday(5 * 60);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      const window = await db.availabilityWindow.create({ data: { resourcePoolId: pool.id, startTime: windowStart, endTime: windowEnd, capacity: 2 } });
      const startTimeStr = windowStart.toISOString().slice(11, 16);

      await db.memberGroupAssignment.create({
        data: { userId: 'f207-2-ent-member', resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: startTimeStr, status: 'ACTIVE', ...defaultTermDates() },
      });

      // ACTIVE entitlement: the exclusion applies.
      const activeRes = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders('f207-2-ent-guest', 'f207-2-ent-key-1'),
        body: JSON.stringify({ branchId: branch.id, resourcePoolId: pool.id, windowId: window.id }),
      });
      if (activeRes.status !== 409) {
        throw new Error(`F-207.2 entitlement ACTIVE: expected 409, got ${activeRes.status}`);
      }

      // Disable the module (Owner early wind-down) -- decided this session: this must
      // immediately free the slot, no manual assignment cleanup.
      await db.moduleEntitlement.update({
        where: { tenantId_module: { tenantId: tenant.id, module: 'MEMBER_MANAGEMENT' } },
        data: { disabledAt: new Date() },
      });

      const disabledRes = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders('f207-2-ent-guest', 'f207-2-ent-key-2'),
        body: JSON.stringify({ branchId: branch.id, resourcePoolId: pool.id, windowId: window.id }),
      });
      if (disabledRes.status !== 201) {
        throw new Error(`F-207.2 entitlement disabled: expected 201 (slot freed), got ${disabledRes.status}: ${JSON.stringify(await disabledRes.json())}`);
      }
      console.log('F-207.2 entitlement gate verified: ACTIVE excludes (409), disabled frees the slot immediately (201).');
    },
  },

  {
    name: 'F-207.2: ensureTodayMemberBooking\'s defensive capacity guard fires 409 MEMBER_SLOT_AT_CAPACITY when the window is already full',
    async run() {
      const pool = await makePool('Capacity Guard Pool', 1);
      const windowStart = alignedHourWithinToday(3 * 60);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      const window = await db.availabilityWindow.create({ data: { resourcePoolId: pool.id, startTime: windowStart, endTime: windowEnd, capacity: 1 } });
      const startTimeStr = windowStart.toISOString().slice(11, 16);

      // Fill the pool's only seat via the admin-discretionary negotiated path -- confirmed this
      // session (real-caller grep) to be the ONLY other real booking-creation path besides
      // ordinary self-service guest bookings, and deliberately NOT collision-checked (Option A).
      // Exercising the guard against a negotiated-origin occupant, not just a self-service one,
      // per this round's explicit verification addition.
      const negotiatedRes = await fetch(`${baseUrl}/bookings/negotiated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}`, 'Idempotency-Key': 'f207-2-cap-negotiated' },
        body: JSON.stringify({ tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: window.id, userId: 'f207-2-cap-walkin', negotiatedPrice: 150 }),
      });
      if (negotiatedRes.status !== 201) {
        throw new Error(`F-207.2 capacity guard setup: expected negotiated booking 201, got ${negotiatedRes.status}`);
      }

      await db.memberGroupAssignment.create({
        data: { userId: 'f207-2-cap-member', resourcePoolId: pool.id, daysOfWeek: todayIsoWeekday(), startTime: startTimeStr, status: 'ACTIVE', ...defaultTermDates() },
      });
      // /member/today-assignment/confirm requires an active Subscription before it will even
      // reach ensureTodayMemberBooking's capacity guard.
      await db.subscription.create({
        data: { userId: 'f207-2-cap-member', tenantId: TENANT_ID, mandateId: `f207-2-cap-${Date.now()}`, amount: 100000, frequency: 'monthly', status: 'active' },
      });

      const memberJwt = signJwt({ userId: 'f207-2-cap-member', tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      const confirmRes = await fetch(`${baseUrl}/member/today-assignment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberJwt}` },
      });
      if (confirmRes.status !== 409) {
        throw new Error(`F-207.2 capacity guard: expected 409, got ${confirmRes.status}: ${JSON.stringify(await confirmRes.json())}`);
      }
      const confirmBody = (await confirmRes.json()) as any;
      if (confirmBody.error?.code !== 'MEMBER_SLOT_AT_CAPACITY') {
        throw new Error(`F-207.2 capacity guard: expected MEMBER_SLOT_AT_CAPACITY, got ${JSON.stringify(confirmBody.error)}`);
      }
      console.log('F-207.2 capacity guard verified: fires against a negotiated-origin occupant, not just self-service.');
    },
  },

  {
    name: 'F-207.2: relocate/cancel sweep — a pre-existing guest booking is relocated to a sibling pool with room, price preserved',
    async run() {
      const { tenant, branch } = await makeIsolatedTenantAndBranch('reloc');
      const collisionPool = await makePool('Sweep Collision Pool', 1, tenant.id, branch.id);
      const siblingPool = await makePool('Sweep Sibling Pool', 2, tenant.id, branch.id);
      const windowStart = alignedHourWithinToday(7 * 60);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      await db.availabilityWindow.create({ data: { resourcePoolId: collisionPool.id, startTime: windowStart, endTime: windowEnd, capacity: 1 } });
      const startTimeStr = windowStart.toISOString().slice(11, 16);

      const guestBookRes = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': 'f207-2-reloc-key', Authorization: `Bearer ${guestToken('f207-2-reloc-guest', tenant.id)}` },
        body: JSON.stringify({ branchId: branch.id, resourcePoolId: collisionPool.id, windowId: (await db.availabilityWindow.findFirst({ where: { resourcePoolId: collisionPool.id, startTime: windowStart } }))!.id }),
      });
      if (guestBookRes.status !== 201) {
        throw new Error(`F-207.2 relocate setup: expected guest booking 201, got ${guestBookRes.status}`);
      }
      const guestBooking = ((await guestBookRes.json()) as any).data;
      const originalPrice = guestBooking.price;
      // The sweep's HELD branch cancels outright, no relocation attempted -- a real collision
      // (not just a HELD hold) needs a CONFIRMED booking, matching a real paid guest reservation.
      const confirmRes = await fetch(`${baseUrl}/bookings/${guestBooking.id}/confirm`, {
        method: 'POST', headers: { Authorization: `Bearer ${internalKey}` },
      });
      if (confirmRes.status !== 200) {
        throw new Error(`F-207.2 relocate setup: expected confirm 200, got ${confirmRes.status}`);
      }

      const assignRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f207-2-reloc-member', resourcePoolId: collisionPool.id, daysOfWeek: todayIsoWeekday(), startTime: startTimeStr }),
      });
      if (assignRes.status !== 201) {
        throw new Error(`F-207.2 relocate: expected assignment create 201, got ${assignRes.status}`);
      }
      const assignBody = ((await assignRes.json()) as any).data;
      if (assignBody.collisionSweep?.relocated !== 1) {
        throw new Error(`F-207.2 relocate: expected collisionSweep.relocated === 1, got ${JSON.stringify(assignBody.collisionSweep)}`);
      }

      const relocated = await db.booking.findUnique({ where: { id: guestBooking.id } });
      if (!relocated || relocated.resourcePoolId !== siblingPool.id) {
        throw new Error(`F-207.2 relocate: expected booking moved to sibling pool ${siblingPool.id}, got ${relocated?.resourcePoolId}`);
      }
      if (relocated.status !== BookingStatus.CONFIRMED && relocated.status !== BookingStatus.HELD) {
        throw new Error(`F-207.2 relocate: expected the booking to remain active, got status ${relocated.status}`);
      }
      if (Number(relocated.price) !== Number(originalPrice)) {
        throw new Error(`F-207.2 relocate: expected price preserved (${originalPrice}), got ${relocated.price}`);
      }
      console.log('F-207.2 relocation verified: booking moved to sibling pool, price preserved, no cancel/refund involved.');
    },
  },

  {
    name: 'F-207.2: relocate/cancel sweep — no sibling room → the booking is cancelled with a forced full refund attempted (payment unreachable here, correctly reported in failed)',
    async run() {
      const { tenant, branch } = await makeIsolatedTenantAndBranch('cancel');
      const collisionPool = await makePool('Sweep No-Sibling Pool', 1, tenant.id, branch.id);
      const windowStart = alignedHourWithinToday(8 * 60);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
      await db.availabilityWindow.create({ data: { resourcePoolId: collisionPool.id, startTime: windowStart, endTime: windowEnd, capacity: 1 } });
      const startTimeStr = windowStart.toISOString().slice(11, 16);

      const guestBookRes = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': 'f207-2-cancel-key', Authorization: `Bearer ${guestToken('f207-2-cancel-guest', tenant.id)}` },
        body: JSON.stringify({ branchId: branch.id, resourcePoolId: collisionPool.id, windowId: (await db.availabilityWindow.findFirst({ where: { resourcePoolId: collisionPool.id, startTime: windowStart } }))!.id }),
      });
      if (guestBookRes.status !== 201) {
        throw new Error(`F-207.2 cancel setup: expected guest booking 201, got ${guestBookRes.status}`);
      }
      const guestBooking = ((await guestBookRes.json()) as any).data;
      const confirmRes = await fetch(`${baseUrl}/bookings/${guestBooking.id}/confirm`, {
        method: 'POST', headers: { Authorization: `Bearer ${internalKey}` },
      });
      if (confirmRes.status !== 200) {
        throw new Error(`F-207.2 cancel setup: expected confirm 200, got ${confirmRes.status}`);
      }

      const assignRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f207-2-cancel-member', resourcePoolId: collisionPool.id, daysOfWeek: todayIsoWeekday(), startTime: startTimeStr }),
      });
      if (assignRes.status !== 201) {
        throw new Error(`F-207.2 cancel: expected assignment create 201, got ${assignRes.status}`);
      }
      const assignBody = ((await assignRes.json()) as any).data;
      // No sibling pool exists for this collision pool in this isolated section, so relocation
      // cannot succeed; and payment isn't running in this suite, so the /refunds leg fails --
      // this correctly lands in `failed`, not `cancelled`, per runMemberCollisionSweep's own
      // design (a cancelled-but-unrefunded booking legitimately needs a human's attention).
      if (assignBody.collisionSweep?.relocated !== 0 || assignBody.collisionSweep?.failed?.length !== 1) {
        throw new Error(`F-207.2 cancel: expected 0 relocated and 1 failed (payment unreachable here), got ${JSON.stringify(assignBody.collisionSweep)}`);
      }

      const cancelled = await db.booking.findUnique({ where: { id: guestBooking.id } });
      if (cancelled?.status !== BookingStatus.CANCELLED) {
        throw new Error(`F-207.2 cancel: expected the booking itself to be CANCELLED regardless of the refund call's reachability, got ${cancelled?.status}`);
      }
      if (Number(cancelled.refundAmount) !== Number(guestBooking.price)) {
        throw new Error(`F-207.2 cancel: expected refundAmount forced to the full price (${guestBooking.price}), got ${cancelled.refundAmount}`);
      }
      console.log('F-207.2 cancel-path verified: booking cancelled with refundAmount forced to full price even though the cross-service /refunds call itself could not complete here.');
    },
  },
];
