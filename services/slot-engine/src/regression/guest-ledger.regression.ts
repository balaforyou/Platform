import { Section, signJwt } from '@badminton/test-harness';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID, nextAlignedHour } from './_fixtures';

/**
 * GUEST LEDGER — F-229 Step 4
 *
 * GET /resource-pools/:id/guest-ledger returns every guest booking for the pool with its
 * PaymentIntent joined (by the bare `referenceId` string) and the Cash/UPI/Link method derived
 * from the gatewayRef prefix. isMemberBooking:true rows are excluded; F-183 child rows too.
 *
 * The suite builds its OWN pool so the row set is exact, and seeds bookings / intents / users
 * directly via Prisma (the gatewayRef prefixes are what matter, not the payment service).
 */

const ownerJwt = `Bearer ${signJwt({ userId: 'ledger-owner', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' })}`;
const nonAdminJwt = `Bearer ${signJwt({ userId: 'ledger-member', tenantId: TENANT_ID, roles: [], userType: 'MEMBER' })}`;

export const guestLedgerSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-229 GET /resource-pools/:id/guest-ledger — guest rows only (member excluded), Cash/UPI/Link method from gatewayRef, payment join, status filter, auth matrix',
    async run() {
      // --- own pool + one window ---
      const poolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ tenantId: TENANT_ID, branchId: BRANCH_ID, name: 'F229 Ledger Pool', allocationMode: 'POOLED', defaultRate: 300 }),
      });
      const pool = ((await poolRes.json()) as any).data;

      const start = nextAlignedHour(50);
      const winRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600e3).toISOString(), capacity: 10 }),
      });
      const win = ((await winRes.json()) as any).data;

      const guest = await db.user.create({ data: { tenantId: TENANT_ID, phone: '+919111100001', name: 'Ledger Guest', userType: 'GUEST', isPhoneVerified: false } });
      const member = await db.user.create({ data: { tenantId: TENANT_ID, phone: '+919111100002', name: 'Ledger Member', userType: 'MEMBER', isPhoneVerified: true } });

      const mkBooking = (userId: string, isMember: boolean, status: any, price: number) =>
        db.booking.create({
          data: {
            tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: pool.id, windowId: win.id, userId,
            status, heldAt: new Date(), heldUntil: new Date(Date.now() + 5 * 60000),
            isMemberBooking: isMember, price, courtSlotIndex: 1,
          },
        });

      const cashB = await mkBooking(guest.id, false, 'CONFIRMED', 300);
      const upiB = await mkBooking(guest.id, false, 'CONFIRMED', 300);
      const linkB = await mkBooking(guest.id, false, 'HELD', 300);
      const memberB = await mkBooking(member.id, true, 'CONFIRMED', 0);

      await db.paymentIntent.create({ data: { tenantId: TENANT_ID, userId: guest.id, amount: 30000, purpose: 'guest_booking', referenceId: cashB.id, status: 'captured', gatewayRef: `cash_${cashB.id.slice(0, 12)}` } });
      await db.paymentIntent.create({ data: { tenantId: TENANT_ID, userId: guest.id, amount: 30000, purpose: 'guest_booking', referenceId: upiB.id, status: 'captured', gatewayRef: `upi_UTRLEDGER${upiB.id.slice(0, 6)}` } });
      await db.paymentIntent.create({ data: { tenantId: TENANT_ID, userId: guest.id, amount: 30000, purpose: 'guest_booking', referenceId: linkB.id, status: 'pending', gatewayRef: `plink_mock_${linkB.id.slice(0, 12)}` } });
      // member booking deliberately has no intent

      const ledger = (qs = '', auth = ownerJwt) =>
        fetch(`${baseUrl}/resource-pools/${pool.id}/guest-ledger${qs}`, { headers: { Authorization: auth } })
          .then(async r => ({ status: r.status, json: await r.json() }));

      try {
        // --- owner: exactly the 3 guest rows, member excluded ---
        const all = await ledger();
        console.log('LEDGER_EVIDENCE all', JSON.stringify(all.json));
        if (all.status !== 200) throw new Error(`expected 200, got ${JSON.stringify(all.json)}`);
        const rows = all.json.data as any[];
        if (rows.length !== 3) throw new Error(`expected 3 guest rows, got ${rows.length}: ${JSON.stringify(rows.map(r => r.bookingId))}`);
        if (rows.some(r => r.bookingId === memberB.id)) throw new Error('member booking leaked into the guest ledger');

        const byId = new Map(rows.map(r => [r.bookingId, r]));
        if (byId.get(cashB.id)?.payment?.method !== 'cash') throw new Error(`cash row method wrong: ${JSON.stringify(byId.get(cashB.id))}`);
        if (byId.get(upiB.id)?.payment?.method !== 'upi') throw new Error(`upi row method wrong: ${JSON.stringify(byId.get(upiB.id))}`);
        if (byId.get(linkB.id)?.payment?.method !== 'link') throw new Error(`link row method wrong: ${JSON.stringify(byId.get(linkB.id))}`);
        if (byId.get(linkB.id)?.payment?.status !== 'pending') throw new Error('link row payment status should be pending');
        if (byId.get(cashB.id)?.payment?.amountPaise !== 30000) throw new Error('cash row amount wrong');

        const cashRow = byId.get(cashB.id)!;
        if (cashRow.guest?.name !== 'Ledger Guest' || cashRow.guest?.phone !== '+919111100001') throw new Error(`guest not resolved: ${JSON.stringify(cashRow.guest)}`);
        if (cashRow.court !== 'Court 1') throw new Error(`court label wrong: ${cashRow.court}`);

        // --- status filter ---
        const confirmed = await ledger('?status=CONFIRMED');
        if ((confirmed.json.data as any[]).length !== 2) throw new Error(`?status=CONFIRMED expected 2, got ${(confirmed.json.data as any[]).length}`);
        const badStatus = await ledger('?status=NONSENSE');
        if (badStatus.status !== 400) throw new Error(`bad status expected 400, got ${badStatus.status}`);

        // --- limit ---
        const limited = await ledger('?limit=1');
        if ((limited.json.data as any[]).length !== 1) throw new Error('?limit=1 did not cap');

        // --- auth matrix ---
        const noAuth = await fetch(`${baseUrl}/resource-pools/${pool.id}/guest-ledger`).then(r => r.status);
        if (noAuth !== 401) throw new Error(`no auth expected 401, got ${noAuth}`);
        const member403 = await ledger('', nonAdminJwt);
        if (member403.status !== 403) throw new Error(`non-admin expected 403, got ${member403.status}`);
        const otherBranchMgr = await ledger('', `Bearer ${signJwt({ userId: 'x', tenantId: TENANT_ID, roles: ['branch_manager:99999999-9999-9999-9999-999999999999'], userType: 'MEMBER' })}`);
        if (otherBranchMgr.status !== 403) throw new Error(`wrong-branch manager expected 403, got ${otherBranchMgr.status}`);
        const unknownPool = await fetch(`${baseUrl}/resource-pools/00000000-0000-0000-0000-000000000000/guest-ledger`, { headers: { Authorization: ownerJwt } }).then(r => r.status);
        if (unknownPool !== 404) throw new Error(`unknown pool expected 404, got ${unknownPool}`);
      } finally {
        await db.paymentIntent.deleteMany({ where: { referenceId: { in: [cashB.id, upiB.id, linkB.id] } } });
        await db.booking.deleteMany({ where: { resourcePoolId: pool.id } });
        await db.availabilityWindow.deleteMany({ where: { resourcePoolId: pool.id } });
        await db.user.deleteMany({ where: { id: { in: [guest.id, member.id] } } });
        await db.bookingRule.deleteMany({ where: { resourcePoolId: pool.id } });
        await db.resourcePool.delete({ where: { id: pool.id } }).catch(() => {});
      }
    },
  },
];
