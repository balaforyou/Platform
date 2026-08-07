import { Section, expectIdentityFromJwt, inspect } from '@badminton/test-harness';
import {
  db,
  baseUrl,
  bookingHeaders,
  guestToken,
  SlotEngineContext,
  BRANCH_ID,
  TENANT_ID,
  USER_ID_1,
  USER_ID_2,
} from './_fixtures';

/**
 * GUEST BOOKING — hold concurrency, idempotency, and the F-045 identity boundary.
 *
 * Concurrency/idempotency sections migrated from concurrency.test.ts Tests 1-4.
 * The identity sections are new with F-045: POST /bookings now derives userId
 * and tenantId from the verified JWT and never reads them from the body.
 */
export const guestBookingSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-045: POST /bookings derives identity from the JWT and ignores a spoofed body userId',
    async run(ctx) {
      await db.booking.deleteMany();

      // User A's token, but the body claims to be user B.
      const res = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID_1, 'f045-spoof-key'),
        body: JSON.stringify({
          tenantId: 'forged-tenant-id',
          branchId: BRANCH_ID,
          resourcePoolId: ctx.pooledPool.id,
          windowId: ctx.pooledWindow.id,
          userId: USER_ID_2, // spoofed — must be ignored, not rejected
        }),
      });
      const body = (await res.json()) as any;
      const booking = body.data ?? body;

      console.log(
        'BOOKING_IDENTITY_EVIDENCE spoofed_userid_ignored',
        JSON.stringify({
          status: res.status,
          sentUserIdInBody: USER_ID_2,
          tokenUserId: USER_ID_1,
          persistedUserId: booking?.userId,
          persistedTenantId: booking?.tenantId,
        }),
      );

      // Ignored, not rejected: the request SUCCEEDS, attributed to the token.
      if (res.status !== 201) {
        throw new Error(`Expected 201 (spoofed id ignored, not rejected), got ${res.status}`);
      }
      expectIdentityFromJwt(booking?.userId, USER_ID_1, USER_ID_2, 'POST /bookings');

      // tenantId is token-derived too — the forged one must not have landed.
      if (booking?.tenantId !== TENANT_ID) {
        throw new Error(
          `Expected token-derived tenantId ${TENANT_ID}, got ${booking?.tenantId} (body sent 'forged-tenant-id')`,
        );
      }

      // And the row on disk agrees with the response.
      const persisted = await db.booking.findUnique({ where: { id: booking.id } });
      if (persisted?.userId !== USER_ID_1) {
        throw new Error(`Persisted booking.userId is ${persisted?.userId}, expected ${USER_ID_1}`);
      }
    },
  },

  {
    name: 'F-045: POST /bookings rejects an unauthenticated caller (401), including idempotency-key replay',
    async run(ctx) {
      const noAuth = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'idempotency-key': 'f045-noauth-key' },
          body: JSON.stringify({
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            resourcePoolId: ctx.pooledPool.id,
            windowId: ctx.pooledWindow.id,
            userId: USER_ID_1,
          }),
        }),
      );
      console.log(
        'BOOKING_IDENTITY_EVIDENCE unauthenticated_rejected',
        JSON.stringify({ status: noAuth.status, body: noAuth.json }),
      );
      if (noAuth.status !== 401) {
        throw new Error(`Expected 401 for unauthenticated booking, got ${noAuth.status}`);
      }

      // Replaying a key that DOES exist must still 401 — auth runs before the
      // idempotency short-circuit, so a stranger can't read back the record.
      const replay = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'idempotency-key': 'f045-spoof-key' },
          body: JSON.stringify({ resourcePoolId: ctx.pooledPool.id, windowId: ctx.pooledWindow.id }),
        }),
      );
      console.log(
        'BOOKING_IDENTITY_EVIDENCE unauthenticated_idempotency_replay_rejected',
        JSON.stringify({ status: replay.status, body: replay.json }),
      );
      if (replay.status !== 401) {
        throw new Error(`Expected 401 replaying a known idempotency key unauthenticated, got ${replay.status}`);
      }

      const bogusToken = await inspect(
        await fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'idempotency-key': 'f045-badtoken-key',
            Authorization: 'Bearer not-a-real-jwt',
          },
          body: JSON.stringify({ resourcePoolId: ctx.pooledPool.id, windowId: ctx.pooledWindow.id }),
        }),
      );
      if (bogusToken.status !== 401) {
        throw new Error(`Expected 401 for a malformed token, got ${bogusToken.status}`);
      }
    },
  },

  {
    name: 'Concurrent holds on FIXED_INSTANCE (exactly one 201, one 409 SLOT_ALREADY_BOOKED)',
    async run(ctx) {
      await db.booking.deleteMany();

      // Two simultaneous requests for the same court+window: only one may win.
      // Each caller now holds their own token (F-045).
      const req1 = fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID_1, 'fixed-key-req1'),
        body: JSON.stringify({
          branchId: BRANCH_ID,
          resourcePoolId: ctx.fixedPool.id,
          resourceId: ctx.resource.id,
          windowId: ctx.window.id,
        }),
      });

      const req2 = fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID_2, 'fixed-key-req2'),
        body: JSON.stringify({
          branchId: BRANCH_ID,
          resourcePoolId: ctx.fixedPool.id,
          resourceId: ctx.resource.id,
          windowId: ctx.window.id,
        }),
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      const data1 = (await res1.json()) as any;
      const data2 = (await res2.json()) as any;

      console.log(`Request 1 status: ${res1.status}, data:`, data1);
      console.log(`Request 2 status: ${res2.status}, data:`, data2);

      const statuses = [res1.status, res2.status];
      if (!statuses.includes(201) || !statuses.includes(409)) {
        throw new Error('Expected exactly one 201 success and one 409 conflict.');
      }

      const errors = [data1.error?.code, data2.error?.code];
      if (!errors.includes('SLOT_ALREADY_BOOKED')) {
        throw new Error('Expected SLOT_ALREADY_BOOKED error code.');
      }
    },
  },

  {
    name: 'Concurrent holds on POOLED capacity=2 (exactly two 201, one 409 POOL_CAPACITY_EXCEEDED)',
    async run(ctx) {
      const makeReq = (key: string, userId: string) =>
        fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: bookingHeaders(userId, key),
          body: JSON.stringify({
            branchId: BRANCH_ID,
            resourcePoolId: ctx.pooledPool.id,
            windowId: ctx.pooledWindow.id,
          }),
        });

      const [pres1, pres2, pres3] = await Promise.all([
        makeReq('pooled-key-1', USER_ID_1),
        makeReq('pooled-key-2', USER_ID_2),
        makeReq('pooled-key-3', USER_ID_1),
      ]);
      const pdata1 = (await pres1.json()) as any;
      const pdata2 = (await pres2.json()) as any;
      const pdata3 = (await pres3.json()) as any;

      console.log(`Pooled Request 1 status: ${pres1.status}`);
      console.log(`Pooled Request 2 status: ${pres2.status}`);
      console.log(`Pooled Request 3 status: ${pres3.status}`);

      const pStatuses = [pres1.status, pres2.status, pres3.status];
      const successesCount = pStatuses.filter((s) => s === 201).length;
      const conflictsCount = pStatuses.filter((s) => s === 409).length;

      if (successesCount !== 2 || conflictsCount !== 1) {
        throw new Error(`Expected 2 successes and 1 conflict, got ${successesCount} and ${conflictsCount}`);
      }

      const pErrors = [pdata1.error?.code, pdata2.error?.code, pdata3.error?.code];
      if (!pErrors.includes('POOL_CAPACITY_EXCEEDED')) {
        throw new Error('Expected POOL_CAPACITY_EXCEEDED error code.');
      }
    },
  },

  {
    name: 'Idempotency-key sequential retry (same key → 200 with identical booking id)',
    async run(ctx) {
      // Reset capacity consumed by the previous section.
      await db.booking.deleteMany();

      const idemKey = 'idempotency-test-key-t3';
      const body = JSON.stringify({
        branchId: BRANCH_ID,
        resourcePoolId: ctx.pooledPool.id,
        windowId: ctx.pooledWindow.id,
      });

      const holdRes1 = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID_1, idemKey),
        body,
      });
      if (holdRes1.status !== 201) {
        throw new Error(`Expected first hold to return 201, got ${holdRes1.status}`);
      }
      const holdData1 = ((await holdRes1.json()) as any).data;

      const holdRes2 = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: bookingHeaders(USER_ID_1, idemKey),
        body,
      });
      if (holdRes2.status !== 200) {
        throw new Error(`Expected retried hold to return 200 OK, got ${holdRes2.status}`);
      }
      const holdData2 = ((await holdRes2.json()) as any).data;

      if (holdData1.id !== holdData2.id) {
        throw new Error('Expected retried request to return identical booking record.');
      }
    },
  },

  {
    name: 'Idempotency-key concurrent race (one 201 + one 200, same booking id — P2002 handled, not a 500)',
    async run(ctx) {
      await db.booking.deleteMany();

      const raceKey = 'idempotency-race-key-t4';
      const body = JSON.stringify({
        branchId: BRANCH_ID,
        resourcePoolId: ctx.pooledPool.id,
        windowId: ctx.pooledWindow.id,
      });
      const makeReq = () =>
        fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: bookingHeaders(USER_ID_1, raceKey),
          body,
        });

      const [raceRes1, raceRes2] = await Promise.all([makeReq(), makeReq()]);
      const raceData1 = (await raceRes1.json()) as any;
      const raceData2 = (await raceRes2.json()) as any;

      console.log(`Race Request 1 status: ${raceRes1.status}`);
      console.log(`Race Request 2 status: ${raceRes2.status}`);

      const raceStatuses = [raceRes1.status, raceRes2.status];
      if (!raceStatuses.includes(201) || !raceStatuses.includes(200)) {
        throw new Error('Expected exactly one 201 (created) and one 200 (duplicate hit) response.');
      }

      // Handle both envelope shapes, as the original test did.
      const raceBookingId1 = raceData1.data ? raceData1.data.id : raceData1.id;
      const raceBookingId2 = raceData2.data ? raceData2.data.id : raceData2.id;
      if (raceBookingId1 !== raceBookingId2) {
        throw new Error('Expected concurrent requests to resolve to the same booking ID.');
      }
    },
  },
];

// Re-exported so other suites can mint a matching token without duplicating the shape.
export { guestToken };
